## Why

Beginners often have a pile of parts but do not know what each part is, what is safe to connect, or what projects are realistic with the parts already on the desk. Circuitiny can turn a phone photo into a guided learning path: identify likely parts, ask the learner to confirm, recommend beginner projects, and create reviewed draft parts only when the local catalog is missing something.

## What Changes

- Add a household-parts photo intake flow that accepts an image, identifies likely electronics parts, and asks the learner to confirm uncertain matches before using them.
- Add a reviewed parts knowledge pipeline that checks the local catalog first, then a curated parts database, then Exa-backed web retrieval when local knowledge is insufficient.
- Add beginner project recommendations based on the confirmed inventory, including projects that can be built now, projects needing a small missing-parts list, difficulty, safety notes, and learning concepts.
- Add Codex tools for photo analysis, inventory matching, web-backed part lookup, and project recommendation so the learner can ask plain-English questions.
- Extend draft part creation/rendering so newly recommended parts can appear in the canvas through GLB, primitive, or generic fallback renderers with explicit review metadata.
- Do not store the user's Exa API key in source or project files; integrations use `EXA_API_KEY` or a user-managed secret store.

## Impact

- Renderer/UI: new photo intake panel, inventory review UI, project recommendation cards, source badges, and "I have this / not sure" confirmation controls.
- Agent tools: new typed tool handlers for image analysis, catalog/database/web matching, Exa search, and project generation.
- Catalog: local catalog remains first source of truth; draft parts require review metadata and beginner-safe render fallbacks.
- External dependencies: optional Exa provider through `EXA_API_KEY`; vision model/provider remains configurable and must not persist images unless the learner saves an inventory.
- Tests: mocked photos, mocked curated DB, mocked Exa search responses, no-network unit tests, and end-to-end recommendation flows.
