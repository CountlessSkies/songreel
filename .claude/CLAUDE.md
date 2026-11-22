# CLAUDE

Project-specific guidance for AI coding agents.

- Read `HANDOFF.md` first: architecture, pipelines, deploy, secrets and what is not done yet.
- UI follows the boss's design file `ref/solsongs-v1.6.1.html` (not committed; it is a 5 MB prototype). Plain React + hand-written CSS, no component library:
  - `src/web/app.css`: base only (box-sizing, body font and background), as in the ref.
  - `src/web/home.css` (scoped under `.home`) and `src/web/studio.css` (scoped under `.studio`, generated from the ref, app-only rules at the end).
  - When the design changes, copy its CSS and markup rather than restyling by hand.
- RunningHub calls follow the official developer kit (see the RunningHub section in `HANDOFF.md`). Only use endpoints and parameters from its `model-registry.public.json`.
- Calls to RunningHub, OpenAI and Suno cost real money. Test UI with `?mock=1` first.
