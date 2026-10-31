# Chip Diplomacy V1.6 implementation boundaries

User adopted docs/game-rules-v16.md on2026-10-30. It supersedes previous V1/V3 only for current application. Four roles/four rounds, T/A/E/S/P, all numbers game assumptions[G]. No added economics/database/framework. Real DeepSeek first; explicit deterministic fallback ONLY after failure per V1.6, never mock provider output. Keys server-side, no chain of thought. Preserve legacy versions/history.

Stage0 shared types src/game-v1/types.ts and docs/game-v16-contracts.md are frozen for feature tasks. Delegate engine and UI into separate branches/worktrees after stage0. Engine owns server/v1/engine.mjs and tests/v16-engine*. UI owns src/game-v1/** except types.ts and tests/v1-ui*. Coordinator owns shared types/contracts, AI, HTTP, integration, docs, deployment. Engine deterministic immutable with explicit seed; sealed AS choices and private deal terms must never leak through nested report/effect/source projections. No network/clock in engine.

Original public4187, local3000/5001 unchanged. No credentials/server identity in Git; no unrelated services/sites/ports, no global restarts/upgrades. Run typecheck/test/build and deployment regressions. Report real provider/fallback honestly.
