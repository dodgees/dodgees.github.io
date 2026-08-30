# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.
- Flat static GitHub Pages site; side projects live as path folders (e.g. `/picket/`, `/family-fit/`) and are linked from the homepage easter-egg side-projects list in `index.html`.
- Family Fit (`family-fit/`): invite-only Supabase auth + Postgres mini-app. Setup and invite steps: `family-fit/README.md`. Schema/RLS: `family-fit/schema.sql`. Public anon config only in `family-fit/config.js` — never commit `service_role`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
