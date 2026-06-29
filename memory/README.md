# Memory — Claude Code project context

This folder is a **snapshot of Claude Code's persistent memory** for this project,
copied here so it travels with the repo (via git) instead of being stuck on one machine.

## Why this exists

Claude Code stores per-project memory as markdown files on the local machine, under:

```
~/.claude/projects/<project-slug>/memory/
```

That directory is **device-local** — it does not sync through git. When moving work to
another device, the strategic context (the "why" and "what's next") would otherwise be
lost, leaving only what's reconstructable from commits and config files.

These files were copied out of that local memory directory on 2026-06-29 so a fresh
Claude Code session on another device can recover full context.

## How to pick this up on the other device

1. Clone/pull this repo.
2. Copy these files back into Claude Code's local memory directory:

   ```bash
   mkdir -p ~/.claude/projects/<project-slug>/memory
   cp memory/*.md ~/.claude/projects/<project-slug>/memory/
   ```

   The `<project-slug>` is derived from the repo's absolute path (Claude Code generates
   it automatically the first time you open the project — start a session, then check
   `~/.claude/projects/` for the matching folder).

3. Alternatively, just point Claude Code at this folder and ask it to read these files —
   it can absorb the context directly without restoring them into local memory.

## What's here

- `MEMORY.md` — the index Claude loads each session (one line per memory).
- `project_*.md` — project state: deployment plan, DB architecture, Railway deploy
  action, slopshop-template relationship, and next steps.
- `feedback_*.md` — working-style guidance Claude should follow.
- `user_background.md` — who the user is and how they like to work.

## Caveats

These are **point-in-time snapshots** (dated April 2026). File:line references and claims
about code behavior may be stale — verify against current code before trusting them. The
git history and repo files are the source of truth for code state; these files are the
source of truth for intent and roadmap.
