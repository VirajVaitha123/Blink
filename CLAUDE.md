# Git and PR conventions

## Branching
- **Never commit directly to `main`.** Always create a feature branch and open a PR, even for one-line changes.
- Branch names follow `<type>/<short-kebab-summary>`, where `<type>` matches the Conventional Commit type below (`feat`, `fix`, `tune`, `refactor`, `docs`, `chore`). Examples from history: `feat/lower-intent-threshold`, `feat/play-button-and-tuning`.

## Commit messages
- Conventional Commits with a scope: `<type>(<scope>): <subject>`. Subject in imperative mood, lowercase, no trailing period.
  - Examples: `feat(voice): speak "Space" on look-up gesture`, `tune(scanner): lower intent blink to 150ms, raise default cycle to 1200ms`.
- Body (optional, wrapped at ~72 cols) explains **why**, not what — leave the "what" to the diff.
- **Do not add a `Co-Authored-By: Claude` trailer.** Author the commit as the user; no Claude/Anthropic attribution in commits or PR bodies.

## Pull requests
- I (Claude) may open PRs with `gh pr create`, but never push to or merge into `main` directly.
- PR title follows the same Conventional Commit format as the squash commit would.
- PR body: short Summary (1–3 bullets, why-focused) + Test plan checklist. **No "Generated with Claude Code" footer or Claude attribution.**
- Do not force-push, do not skip hooks (`--no-verify`), do not bypass signing.
