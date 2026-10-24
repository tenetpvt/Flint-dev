---
description: Strict git branch discipline and main branch protection
globs: ["**/*"]
always_on: true
---

# Strict Git Branch Discipline & Main Branch Protection

1. **NEVER COMMIT OR PUSH TO MAIN:**
   - Under NO circumstances should any commit, push, fast-forward, or merge ever be made to the `main` branch on ANY remote (`origin` or `submission`).
   - The `main` branch is permanently locked. It serves the stable production deployment for the `flint` project.
   - Do NOT touch `main` unless the USER explicitly provides written permission with the exact instruction to push to main.

2. **ALL WORK BELONGS TO DEV:**
   - All coding, testing, bug fixes, git commits, and git pushes MUST strictly remain on the `dev` branch.
   - Always verify the active branch with `git branch --show-current` before running any git commands.

3. **VERCEL PROJECT SEPARATION:**
   - Vercel project **`flint`** is connected exclusively to `origin/main` (stable locked release).
   - Vercel project **`flint-dev`** is for development work from the `dev` branch.
   - Do not cross-pollinate branches between these projects.

4. **COMMIT MESSAGE HYGIENE:**
   - Never reference "SIH" in commit messages.
   - Keep `.env` and API secrets untracked.
