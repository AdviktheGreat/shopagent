# Repository workflow

- After each small, completed implementation change, run the relevant checks, commit the change, and push it to GitHub. The user explicitly requested frequent commits and pushes.
- Use the user's commit identity: `AdviktheGreat <advikanand7@gmail.com>`. Keep identity configuration local to this repository.
- Do not add assistant co-author attribution.
- Commit only files related to the current change. Preserve unrelated user work, and never force-push or rewrite shared history without explicit authorization.
- The extension runs directly from `extension/`; no build step is required. Use `npm test`, `npm run check`, and browser integration tests as appropriate for the change.
