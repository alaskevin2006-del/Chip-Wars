# Chip Diplomacy V1 implementation boundaries

User adopted docs/game-rules-v1.md on 2026-10-30. It supersedes prior text-only rules and old V3 ONLY for the new application. Exactly four roles US/CN/NL/AS, four rounds, metrics A/B/H/R per the specified game rules. All numbers are hypothetical game assumptions, never real predictions. No extra economic simulation, database or framework. Live DeepSeek only; offline tests may inject fixtures. Keys stay server-side; no chain of thought.

Preserve legacy Chip-Wars and text-Diplomacy code/history. docs/game-v1-contracts.md and src/game-v1/types.ts freeze the new integration contract. No feature-task shared type edits; propose to coordinator.

Feature tasks use separate worktrees/branches. After stage0 delegate engine and UI. Engine owns server/v1/engine.mjs and tests/v1-engine*. UI owns src/game-v1/** except types.ts, tests/v1-ui*. Coordinator owns shared contracts/types, HTTP/scheduling/LLM integration, dependencies, deployment, docs and integration tests. Engine is deterministic and immutable with explicit goal draws, no network/clock/UI. Observations expose only the corresponding role's goal/messages; no sealed opponent actions. Signing lock is atomic on last consent; settlement is idempotent.

Public entry stays on original server port4187. Local ports3000/5001 remain. Never commit keys or server identity; never alter unrelated services/ports/sites, no global restarts/upgrades. Run npm run typecheck, npm run test, npm run build plus deployment regression tests. Report real results and model/timeout PASS honestly.
