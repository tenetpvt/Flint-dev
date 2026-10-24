# FLINT Development Guidelines & Invariants

## 1. Strict Git Branch Discipline (NEVER TOUCH MAIN)
- **NEVER commit, push, merge, or force-push to `main` on any remote (`origin` or `submission`).**
- The `main` branch is permanently locked to serve the stable production deployment for the `flint` project on Vercel.
- All code changes, bug fixes, and git pushes MUST strictly target the **`dev`** branch only.
- ONLY touch `main` if the user explicitly gives written permission to deploy to main.

## 2. Vercel Projects & Remotes
- **Project `flint` (`flint.vercel.app`):** Connected to `origin/main` (stable production).
- **Project `flint-dev` (`flint-dev.vercel.app`):** Connected to development testing.

## 3. Commit Hygiene
- Never mention internal hackathon acronyms ("SIH") in git commit messages.
- Never commit `.env` files or credentials.
