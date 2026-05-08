## 1. Data Models And Providers

- [ ] 1.1 Define typed models for photo candidates, confirmed inventory items, retrieval sources, part knowledge records, and project recommendations.
- [ ] 1.2 Add a provider interface for local catalog, curated database, Exa search, and vision/photo analysis with mocked test implementations.
- [ ] 1.3 Add secret handling for `EXA_API_KEY` through environment or secure settings without storing the key in project files.
- [ ] 1.4 Add source ranking and confidence helpers for datasheets, vendors, tutorials, forums, and unknown sources.

## 2. Photo Intake And Inventory Review

- [ ] 2.1 Build the photo intake panel with upload/drop support, transient image handling, and empty/failure states.
- [ ] 2.2 Implement candidate extraction flow with confidence, evidence, safety flags, and "I have this / not sure / ignore" controls.
- [ ] 2.3 Store confirmed inventory separately from unconfirmed candidates and reset transient photos unless the learner saves inventory.
- [ ] 2.4 Add tests for successful photo candidates, no-detection flows, low-confidence confirmation, and privacy behavior.

## 3. Parts Retrieval And Rendering

- [ ] 3.1 Implement local-catalog-first matching with close-match confirmation.
- [ ] 3.2 Add curated beginner parts database loading with synonyms, pins, voltage/current notes, companions, and render family.
- [ ] 3.3 Implement Exa retrieval provider with highlights, structured result normalization, caching, and no-network test fixtures.
- [ ] 3.4 Extend draft part creation to carry source URLs, retrieved date, confidence, original trust notes, and render fallback.
- [ ] 3.5 Add tests for local-only, curated DB, Exa fallback, source conflict, and renderer fallback behavior.

## 4. Project Recommendations

- [ ] 4.1 Implement recommendation ranking based on confirmed parts, missing parts, safety, simulation support, difficulty, and learning concepts.
- [ ] 4.2 Build project recommendation cards with used parts, missing parts, concepts, safety notes, and "create project/recipe" actions.
- [ ] 4.3 Add recipe/project draft generation after learner approval, with DRC and review requirements before build/flash guidance.
- [ ] 4.4 Add tests for build-now recommendations, missing-part recommendations, unsafe project demotion, and novelty re-ranking.

## 5. Codex Tools And UX Integration

- [ ] 5.1 Add Codex tools for `analyze_parts_photo`, `match_parts_database`, `search_parts_web`, `recommend_projects_from_inventory`, and `create_recipe_from_project`.
- [ ] 5.2 Update Codex prompt rules so photo/web-derived parts require confirmation before persistence or project creation.
- [ ] 5.3 Add UI source badges, confidence labels, and beginner-language explanations for Codex responses.
- [ ] 5.4 Verify with `pnpm typecheck`, `pnpm test`, `pnpm build`, and `openspec validate household-parts-photo-project-ideas --strict`.
