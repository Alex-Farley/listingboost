# Developing ListingBoost with cloud coding agents

The repository is agent-agnostic: every tool reads [AGENTS.md](../AGENTS.md)
(directly or via a pointer file), sets up with one idempotent script, and
proves its work with one command.

| Step | Command |
| --- | --- |
| Set up | `bash scripts/setup.sh` |
| Verify before committing | `bun run verify` |

Setup needs outbound access to `bun.sh` (only if Bun is missing) and the npm
registry. Nothing else: no credentials or Cloudflare account are needed for
development and tests.

## Per platform

| Platform | What it reads | Setup |
| --- | --- | --- |
| Claude Code (web / cloud) | `CLAUDE.md` → `AGENTS.md` | Automatic: `.claude/settings.json` SessionStart hook runs the setup script in remote sessions. Alternatively put `bash scripts/setup.sh` in the environment's setup script. |
| OpenAI Codex (cloud) | `AGENTS.md` | In the environment settings, set the setup script to `bash scripts/setup.sh`. |
| Google Jules | `AGENTS.md` | Initial setup command: `bash scripts/setup.sh`. |
| Gemini CLI | `GEMINI.md` → `AGENTS.md` | Run the setup script once. |
| GitHub Copilot coding agent | `.github/copilot-instructions.md` → `AGENTS.md` | Automatic via `.github/workflows/copilot-setup-steps.yml`. |
| Cursor (background agents) | `AGENTS.md` | Install command: `bash scripts/setup.sh`. |
| GitHub Codespaces / Dev Containers | `.devcontainer/devcontainer.json` | Automatic `postCreateCommand`. |

## Working agreement for any agent

1. Start from `docs/CURRENT_STATUS.md` → "Next recommended task", or the
   assigned GitHub issue (epic Alex-Farley/listingboost#134).
2. Work on a branch; follow the TDD loop in `docs/AGENT_RULES.md`.
3. `bun run verify` must pass; CI runs the same checks.
4. Update `docs/CURRENT_STATUS.md` / `docs/ACCEPTANCE_TESTS.md`, open a PR
   referencing the issue.

Parallel agents should take different requirement issues (R4–R11) to avoid
conflicting migrations. New schema changes go in a new numbered migration
file, never by editing an applied one.
