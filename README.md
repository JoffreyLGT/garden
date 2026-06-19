# Garden — my Obsidian notes, published with Quartz

**Live site:** https://joffreylgt.github.io/garden/

This repo is the **published** half of my digital garden. My full notes live in a
private Obsidian vault (`D:\Garden`); only notes flagged `public: true` are synced
here and built into the public site.

## How it works

- [`publish.mjs`](publish.mjs) reads the Obsidian vault, selects notes whose
  frontmatter has `public: true` (boolean or the string `"true"`), and mirrors them
  into `content/` — adding, updating, and **deleting** so `content/` exactly matches
  the current public set. A note that loses `public: true` is removed from this repo
  on the next sync (tracked via `.publish-manifest.json`). Attachments are copied
  only if a published note references them; private notes/images never leave the vault.
- A push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
  which builds Quartz and deploys to GitHub Pages.

## Homepage

To control the landing page from Obsidian, add `home: true` to the frontmatter of
any vault note — it gets published as `content/index.md` (the site root). The first
note with `home: true` wins; if none exists, a default homepage is generated.

## Publishing (day to day)

From this folder:

```sh
node publish.mjs            # sync public notes -> commit -> push (site rebuilds)
node publish.mjs --dry-run  # show what would change, write nothing
node publish.mjs --no-push  # sync + commit locally, don't push
node publish.mjs --no-git   # sync files only, no commit/push
```

The vault path defaults to `D:\Garden`; override with the `VAULT_PATH` env var.

## Local preview

```sh
node ./quartz/bootstrap-cli.mjs build --serve   # http://localhost:8080
```

## Notes / gotchas

- Built on **Quartz v5** (Obsidian template). Community plugins are fetched at build
  time into `.quartz/` (gitignored), so CI installs them with `quartz plugin install`.
- CI uses **Node 24**. Node 22 fails Quartz's plugin install on a `.scss` import.
- The `cname` plugin and Plausible analytics are disabled; the broken `quartz-themes`
  plugin is disabled. Re-enable in `quartz.config.yaml` if wanted.
- This repo's commit identity is set to a GitHub noreply email (repo-local) so the
  work email in the global git config isn't exposed in public history.
- To pull in future Quartz updates: `git fetch upstream` then
  `node ./quartz/bootstrap-cli.mjs upgrade`.
