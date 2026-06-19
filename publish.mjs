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
// The source vault is read from vault-path.txt (a local, gitignored file in this
// folder), or from the VAULT_PATH environment variable.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import YAML from "yaml";

// ---------- configuration ----------
const SITE = path.dirname(fileURLToPath(import.meta.url));
const VAULT_CONFIG = path.join(SITE, "vault-path.txt"); // local & gitignored: source vault path
function resolveVault() {
  const fromEnv = process.env.VAULT_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  try {
    const fromFile = fs.readFileSync(VAULT_CONFIG, "utf8").trim();
    if (fromFile) return path.resolve(fromFile);
  } catch {}
  return null;
}
const VAULT = resolveVault();
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

// Parse the leading YAML frontmatter block (handles scalars, lists, and maps —
// e.g. the control-panel note's `footer_links` list).
function frontmatter(text) {
  if (!text.startsWith("---")) return {};
  const firstNL = text.indexOf("\n");
  const end = text.indexOf("\n---", firstNL);
  if (firstNL === -1 || end === -1) return {};
  try {
    return YAML.parse(text.slice(firstNL + 1, end), { logLevel: "silent" }) ?? {};
  } catch {
    return {};
  }
}

function truthy(val) {
  if (val === undefined) return false;
  const v = String(val).trim().replace(/^["']|["']$/g, "").toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}
const isPublic = (fm) => truthy(fm.public);
// A note flagged `home: true` becomes the site homepage (emitted as content/index.md).
const isHome = (fm) => truthy(fm.home);
// A note flagged `garden_config: true` is the site "control panel": its properties
// drive quartz.config.yaml. It is read for settings but never published as a page.
const isConfig = (fm) => truthy(fm.garden_config);

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

// Turn a footer_links property into a { label: url } map. Accepts either an
// Obsidian list of "Label | URL" strings, or a YAML map of label -> url.
function parseFooterLinks(val) {
  const out = {};
  if (Array.isArray(val)) {
    for (const entry of val) {
      const s = String(entry).trim();
      if (!s) continue;
      const i = s.indexOf("|");
      if (i === -1) out[s] = s; // bare URL, label = url
      else out[s.slice(0, i).trim()] = s.slice(i + 1).trim();
    }
  } else if (val && typeof val === "object") {
    for (const [k, v] of Object.entries(val)) out[k] = String(v);
  }
  return out;
}

// Set a nested option on the plugin whose `source` matches, in the YAML Document.
function setPluginOption(doc, source, keyPath, value) {
  const plugins = doc.get("plugins", true);
  for (const item of plugins?.items ?? []) {
    if (item.get && item.get("source") === source) item.setIn(keyPath, doc.createNode(value));
  }
}

// Apply the control-panel note's properties to quartz.config.yaml (preserving the
// file's comments/structure). Returns the human-readable changes; only writes when
// `write` is true and something actually changed.
function applySiteConfig(cfgFm, write) {
  const cfgPath = path.join(SITE, "quartz.config.yaml");
  const before = fs.readFileSync(cfgPath, "utf8");
  const doc = YAML.parseDocument(before);
  const changes = [];

  if (cfgFm.site_title != null && String(cfgFm.site_title) !== "") {
    doc.setIn(["configuration", "pageTitle"], String(cfgFm.site_title));
    changes.push(`site title -> "${cfgFm.site_title}"`);
  }
  if ("site_tagline" in cfgFm) {
    const suffix = cfgFm.site_tagline ? ` — ${cfgFm.site_tagline}` : "";
    doc.setIn(["configuration", "pageTitleSuffix"], suffix);
    changes.push(`tagline -> "${cfgFm.site_tagline ?? ""}"`);
  }
  if ("footer_links" in cfgFm) {
    const links = parseFooterLinks(cfgFm.footer_links);
    setPluginOption(doc, "github:quartz-community/footer", ["options", "links"], links);
    changes.push(`footer links -> ${JSON.stringify(links)}`);
  }
  if ("display_properties" in cfgFm) {
    const props = (Array.isArray(cfgFm.display_properties)
      ? cfgFm.display_properties
      : [cfgFm.display_properties]
    ).map(String).filter(Boolean);
    // Force allowlist mode so private flags (public/home/garden_config/…) never leak.
    setPluginOption(doc, "github:quartz-community/note-properties", ["options", "includeAll"], false);
    setPluginOption(doc, "github:quartz-community/note-properties", ["options", "includedProperties"], props);
    changes.push(`displayed properties -> ${JSON.stringify(props)}`);
  }

  const after = doc.toString();
  const willWrite = after !== before;
  if (write && willWrite) fs.writeFileSync(cfgPath, after);
  return { changes, willWrite };
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
  if (!VAULT || !fs.existsSync(VAULT)) {
    console.error(`Source vault not found (current: ${VAULT ?? "unset"}).`);
    console.error(`Set it in ${VAULT_CONFIG} (one line: the vault path), or via VAULT_PATH.`);
    process.exit(1);
  }
  const allFiles = walk(VAULT);
  const mdFiles = allFiles.filter((f) => f.toLowerCase().endsWith(".md"));
  const index = buildAttachmentIndex(allFiles);

  // Parse every note once; the first note flagged `home: true` is the homepage.
  const parsed = mdFiles.map((abs) => {
    const text = fs.readFileSync(abs, "utf8");
    return { abs, text, fm: frontmatter(text) };
  });
  const homeAbs = parsed.find((p) => isHome(p.fm))?.abs ?? null;
  const cfgNote = parsed.find((p) => isConfig(p.fm)) ?? null;

  const emit = new Map(); // contentRelPath -> absolute source path
  let publicCount = 0;

  for (const p of parsed) {
    // The control-panel note isn't published as its own page — unless it's also
    // the homepage (a single note can be both), in which case it must still emit.
    if (p === cfgNote && p.abs !== homeAbs) continue;
    const isHomeNote = p.abs === homeAbs;
    if (!isPublic(p.fm) && !isHomeNote) continue; // home note is published implicitly
    publicCount++;
    const rel = isHomeNote ? "index.md" : toPosix(path.relative(VAULT, p.abs));
    emit.set(rel, p.abs);
    for (const ref of refsFromBody(p.text)) {
      const att = resolveAttachment(ref, p.abs, index);
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
  console.log(`Published:    ${publicCount} note(s)${homeAbs ? "  (homepage: " + toPosix(path.relative(VAULT, homeAbs)) + ")" : ""}`);
  console.log(`Emitting:     ${next.size} files (notes + referenced attachments)`);
  console.log(`Deleting:     ${toDelete.length} unpublished file(s)`);
  toDelete.forEach((p) => console.log(`  - ${p}`));

  if (DRY) {
    console.log("Would emit:");
    [...next].sort().forEach((p) => console.log(`  + ${p}`));
    if (cfgNote) {
      const { changes } = applySiteConfig(cfgNote.fm, false);
      console.log(`Site config (from ${toPosix(path.relative(VAULT, cfgNote.abs))}):`);
      changes.forEach((c) => console.log(`  ~ ${c}`));
    }
    console.log("\n--dry-run: nothing written.");
    return;
  }

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

  // Safety net: the site must always have a homepage.
  const indexAbs = path.join(CONTENT, "index.md");
  if (!fs.existsSync(indexAbs)) {
    fs.writeFileSync(indexAbs, "---\ntitle: Garden\n---\n\nWelcome to my digital garden.\n");
    console.log("No `home: true` note found — wrote a default content/index.md.");
  }

  // Apply site settings from the control-panel note (if any) to quartz.config.yaml.
  if (cfgNote) {
    const { changes, willWrite } = applySiteConfig(cfgNote.fm, true);
    if (willWrite) console.log(`Applied site config (${toPosix(path.relative(VAULT, cfgNote.abs))}): ${changes.join("; ")}`);
  }

  console.log("\nContent folder synced.");

  if (NO_GIT) { console.log("--no-git: skipped commit/push."); return; }
  gitCommitPush(publicCount);
}

main();
