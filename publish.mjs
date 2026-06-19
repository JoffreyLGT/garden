#!/usr/bin/env node
// publish.mjs — sync "public" notes from the Obsidian vault into Quartz's content/ folder.
//
// A note is PUBLISHED iff its frontmatter has  public: true  (boolean, or the
// string "true"/"yes"/"1"). The script makes content/ an EXACT MIRROR of the
// current set of public notes:
//   - new / changed public notes are copied in
//   - notes that lost public:true are DELETED from content/ (and from git)
//   - only attachments REFERENCED by public notes are copied — private images
//     and private notes never leave the vault.
//
// Deletion is driven by a manifest (.publish-manifest.json) listing the files the
// previous run emitted, so unpublishing a note reliably removes it from the repo.
//
// Usage (run from D:\garden-site):
//   node publish.mjs              sync + git commit + push   (normal publish)
//   node publish.mjs --no-push    sync + git commit, but don't push
//   node publish.mjs --no-git     sync files only, no git at all
//   node publish.mjs --dry-run    report what WOULD change, write nothing
//
// The vault path can be overridden with the VAULT_PATH environment variable.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// ---------- configuration ----------
const VAULT = path.resolve(process.env.VAULT_PATH || "D:/Garden");
const SITE = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(SITE, "content");
const MANIFEST = path.join(SITE, ".publish-manifest.json");
const SKIP_DIRS = new Set([".obsidian", ".trash", ".git"]);
const ATTACHMENT_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico",
  ".pdf", ".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg", ".excalidraw",
]);

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const NO_GIT = args.has("--no-git");
const NO_PUSH = args.has("--no-push");

// ---------- helpers ----------
const toPosix = (p) => p.split(path.sep).join("/");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Minimal, tolerant parser for the leading YAML frontmatter block. We only need
// flat scalar keys (specifically `public`), so this avoids any YAML dependency.
function frontmatter(text) {
  if (!text.startsWith("---")) return {};
  const firstNL = text.indexOf("\n");
  const end = text.indexOf("\n---", firstNL);
  if (firstNL === -1 || end === -1) return {};
  const block = text.slice(firstNL + 1, end);
  const data = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (m) data[m[1]] = m[2].trim();
  }
  return data;
}

function isPublic(fm) {
  if (fm.public === undefined) return false;
  const v = String(fm.public).trim().replace(/^["']|["']$/g, "").toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}

// Collect attachment references (Obsidian embeds + markdown images) from a note body.
function refsFromBody(text) {
  const refs = new Set();
  for (const m of text.matchAll(/!\[\[([^\]]+?)\]\]/g)) {
    refs.add(m[1].split("|")[0].split("#")[0].trim()); // ![[file.png|alt]] -> file.png
  }
  for (const m of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    let u = m[1].trim();
    if (u.startsWith("<") && u.endsWith(">")) u = u.slice(1, -1);
    u = u.split(/\s+/)[0]; // drop optional "title"
    try { u = decodeURIComponent(u); } catch {}
    refs.add(u);
  }
  return [...refs];
}

function buildAttachmentIndex(files) {
  const byBase = new Map();
  for (const abs of files) {
    if (!ATTACHMENT_EXTS.has(path.extname(abs).toLowerCase())) continue;
    const base = path.basename(abs).toLowerCase();
    (byBase.get(base) ?? byBase.set(base, []).get(base)).push(abs);
  }
  return byBase;
}

function resolveAttachment(ref, noteAbs, index) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) return null; // external URL
  const ext = path.extname(ref).toLowerCase();
  if (!ATTACHMENT_EXTS.has(ext)) return null;            // not an attachment (e.g. note embed)
  for (const c of [path.resolve(path.dirname(noteAbs), ref), path.resolve(VAULT, ref)]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  const hit = index.get(path.basename(ref).toLowerCase()); // Obsidian shortest-path fallback
  return hit && hit.length ? hit[0] : null;
}

function pruneEmptyDirs(dir) {
  try {
    while (dir.startsWith(CONTENT) && dir !== CONTENT && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    }
  } catch {}
}

function git(a) { return execFileSync("git", a, { cwd: SITE, encoding: "utf8" }); }

function gitCommitPush(n) {
  if (!git(["status", "--porcelain"]).trim()) {
    console.log("\nNothing to commit — published site already up to date.");
    return;
  }
  git(["add", "-A"]);
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  git(["commit", "-m", `Publish sync: ${stamp} (${n} public notes)`]);
  console.log("\nCommitted publish changes.");
  if (NO_PUSH) { console.log("--no-push: not pushing."); return; }
  try {
    git(["push"]);
    console.log("Pushed. GitHub Actions will rebuild and deploy the site.");
  } catch {
    console.log("Push skipped/failed (no upstream yet?). Run once: git push -u origin <branch>");
  }
}

// ---------- main ----------
function main() {
  if (!fs.existsSync(VAULT)) {
    console.error(`Vault not found: ${VAULT} (set VAULT_PATH to override)`);
    process.exit(1);
  }
  const allFiles = walk(VAULT);
  const mdFiles = allFiles.filter((f) => f.toLowerCase().endsWith(".md"));
  const index = buildAttachmentIndex(allFiles);

  const emit = new Map(); // contentRelPath -> absolute source path
  let publicCount = 0;

  for (const noteAbs of mdFiles) {
    const text = fs.readFileSync(noteAbs, "utf8");
    if (!isPublic(frontmatter(text))) continue;
    publicCount++;
    emit.set(toPosix(path.relative(VAULT, noteAbs)), noteAbs);
    for (const ref of refsFromBody(text)) {
      const att = resolveAttachment(ref, noteAbs, index);
      if (!att) continue;
      const arel = toPosix(path.relative(VAULT, att));
      if (!arel.startsWith("..")) emit.set(arel, att);
    }
  }

  let prev = [];
  try { prev = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch {}
  const next = new Set(emit.keys());
  const toDelete = prev.filter((p) => !next.has(p));

  console.log(`Vault:        ${VAULT}`);
  console.log(`Public notes: ${publicCount}`);
  console.log(`Emitting:     ${next.size} files (notes + referenced attachments)`);
  console.log(`Deleting:     ${toDelete.length} unpublished file(s)`);
  toDelete.forEach((p) => console.log(`  - ${p}`));

  if (DRY) { console.log("\n--dry-run: nothing written."); return; }

  for (const rel of toDelete) {
    const abs = path.join(CONTENT, rel);
    fs.rmSync(abs, { force: true });
    pruneEmptyDirs(path.dirname(abs));
  }
  for (const [rel, src] of emit) {
    const dest = path.join(CONTENT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  fs.writeFileSync(MANIFEST, JSON.stringify([...next].sort(), null, 2) + "\n");
  console.log("\nContent folder synced.");

  if (NO_GIT) { console.log("--no-git: skipped commit/push."); return; }
  gitCommitPush(publicCount);
}

main();
