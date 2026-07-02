---
name: ship
description: Wraps up a finished piece of work in this repo — bumps the version, brings README.md, ARCHITECTURE.md, TESTING.md and CLAUDE.md up to date with the change, appends a CHANGELOG.md entry, commits, pushes, builds the release, and copies it to the "NONAME" USB stick if it's plugged in. Invoke ONLY when the user explicitly runs /ship or explicitly asks to commit, document and push the current work — never trigger this on your own initiative just because a task looks finished.
---

# ship

One explicit command that closes out a task: bump the version, sync the
living docs, record the change in the changelog, commit, push, build the
release, and drop it onto the USB stick if one is plugged in. Every step in
this skill is already covered by the user invoking `/ship` — that invocation
is the explicit authorization for the version bump, the commit, and the
push, so don't pause mid-skill to ask "should I commit now?". Do stop and
tell the user if something looks wrong (nothing staged, tests failing, push
rejected, build failing).

## Scope

Living docs this skill maintains: `README.md`, `ARCHITECTURE.md`,
`TESTING.md`, `CLAUDE.md`, `CHANGELOG.md`.

Out of scope, never touch: `tasks.md`, `implementation_plan.md` — these are
one-off planning documents from the initial build, not living references.
If the user wants those updated too, that's a separate explicit request.

## Steps

### 1. Gather state

Run in parallel:
- `git status` (never `-uall`)
- `git diff` and `git diff --staged`
- `git log -8 --oneline`
- `git rev-parse --abbrev-ref HEAD` and check whether the branch tracks a
  remote / is ahead-behind (`git status -sb` covers both)

If the working tree is clean and there's nothing to push, say so and stop —
there's nothing to ship.

### 2. Set the version

Read the current version with `node -p "require('./package.json').version"`.
Ask the user for the new version with `AskUserQuestion` — offer the current
version unchanged and a patch bump (`x.y.z` → `x.y.(z+1)`) as the two
options; the user can type a custom version (minor/major bump) via "Other".

Run `bash scripts/set-version.sh <version>` (skip this call if the user kept
the current version — nothing to sync). This updates `package.json`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `Cargo.lock`; these
files get staged and committed alongside the docs in step 5.

### 3. Update the living docs

For each of `README.md`, `ARCHITECTURE.md`, `TESTING.md`, `CLAUDE.md`: read
it, and edit only the parts the diff actually invalidates — new/changed Tauri
commands, new components, changed data flow, new scripts, changed commands to
run, new config fields. Do not rewrite sections that are still accurate, and
do not pad with content the diff doesn't justify. If a doc needs no change,
leave it untouched — don't edit files just to have touched them.

Cross-check against `CLAUDE.md`'s existing structure and tone before writing
— match its style (tables, `###` headers, concise bullet points) rather than
inventing a new format.

### 4. Update CHANGELOG.md

Create it at the repo root if it doesn't exist yet, using
[Keep a Changelog](https://keepachangelog.com/) format:

```markdown
# Changelog

## [Unreleased]

## [0.1.1] - 2026-06-30
### Added
- ...
```

- Read the current version from `package.json` (already bumped in step 2, if
  applicable).
- If that version already has a released section in the changelog, add new
  bullets under `## [Unreleased]` (create that heading right below the title
  if missing), grouped under `### Added` / `### Changed` / `### Fixed` /
  `### Removed` (omit empty categories).
- If `package.json`'s version is newer than the latest released heading in
  the changelog (i.e. a version bump happened as part of this change, e.g.
  via `scripts/set-version.sh`), rename `## [Unreleased]` to
  `## [x.y.z] - YYYY-MM-DD` (today's date) and fold its bullets plus this
  change's bullets into that section, leaving a fresh empty `## [Unreleased]`
  above it.
- Write bullets from the user's perspective (what changed for someone using
  or building the app), not implementation narration. One line each.

### 5. Stage and commit

Stage the files that make up this change explicitly by name — the diff from
step 1, the version-bump files from step 2 (if any), and the doc/changelog
edits from steps 3–4. Do not use `git add -A` or `git add .`. Skip anything
that looks like a secret or credential file and warn the user if one is
present in the working tree.

Draft a commit message matching this repo's existing style (see the
`git log` output from step 1 — prefixes like `feat:`, `fix:`, `chore:`,
`docs:`, `perf:` are used; 1–2 sentences, focused on why). Commit with:

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

Never use `--no-verify`, `--no-gpg-sign`, or amend an existing commit.

### 6. Push

`git push`. If the branch has no upstream yet, use `git push -u origin
<branch>`. If the push is rejected (diverged, non-fast-forward), stop and
report it — do not force-push.

### 7. Build and copy to the USB stick

Run `bash scripts/deploy.sh <version>` with the version from step 2 (this is
safe even if the version didn't change — the script just skips re-syncing
it and goes straight to `npm run tauri build -- --bundles appimage` +
`scripts/package-linux.sh`, populating `deploy/`). This step can take a
minute or two on a cold build; let the user know before running it.

Then check whether the "NONAME" stick is mounted:

```bash
findmnt -n -o TARGET --source LABEL=NONAME
```

- If it prints a mount point: copy the contents of `deploy/` into
  `<mount>/pordata/Linux/` on the stick (create the directory if missing).
  This mirrors the existing `<USB-Root>/pordata/Linux/` convention used by
  `setup_usb_stick` for the app binary.
- If it prints nothing, the stick isn't plugged in — skip the copy and note
  that in the report. This is expected, not an error; don't stop the skill
  over it since the user said "if it's mounted".

### 8. Report

Tell the user, briefly: which docs were touched (or "no doc changes
needed"), the version (unchanged or bumped to what), the changelog entry,
the commit hash + message, the push result, the build result, and whether
the USB copy happened (and to where) or was skipped because the stick
wasn't mounted.
