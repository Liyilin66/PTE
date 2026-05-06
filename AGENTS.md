# Repository Guidance

This repository is organized around the Kai-Kou product app in `kai-kou/`.

## Scope

- `kai-kou/` is the main application and deployment root.
- `kai-kou/AGENTS.md` contains the detailed app-level working rules.
- Root-level files should stay limited to repository guidance, summary docs, and ignore rules.

## Keep Out Of Git

Do not commit local agent runtimes, generated state, build output, logs, or local production artifacts:

- `.agents/`
- `.claude/`
- `.codex/`
- `.omx/`
- `.omc/`
- `output/`
- `wfd/`
- `dist/`
- `node_modules/`
- local `.env*` files

## WFD Boundary

Keep WFD implementation code in `kai-kou/src`, `kai-kou/backend`, and `kai-kou/scripts`.
Keep WFD process documentation in `kai-kou/docs/wfd/`.
Generated WFD audio, workbooks, and run reports belong outside Git history.

## Git Hygiene

Before committing, check `git status -sb --untracked-files=all` and stage only intentional source, docs, or config changes.
Do not stage logs, runtime state, generated reports, local media output, or tool-specific cache directories.
