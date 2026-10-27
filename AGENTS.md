# Chip-Wars implementation boundaries

Read docs/game-baseline-v3.md and docs/contracts.md before changing code. V3.0 is the only game specification. Exactly nine agents and 24 action templates plus HOLD. Every numerical coefficient is a game assumption [G]. No extra economic simulation, database or framework.

Never commit credentials or server identity. All provider credentials are server environment variables. Do not alter other server projects, ports, default sites or services. No global restarts or upgrades.

Feature tasks use separate branches and worktrees. Delegation is explicitly requested for the engine and UI tasks after stage 0 completes. Owners:
- feat/engine: src/engine/** except frozen types.ts, src/agents/rule.ts, tests/engine*, tests/agents*.
- feat/ui: src/ui/**, src/App.tsx, UI styles, tests/ui*.
- feat/llm: server/**, src/agents/llm.ts, tests/llm*.
- feat/deploy: ops/**, docs/deployment.md.
- Coordinator/integrator: shared contract/types, root dependencies, docs, orchestration integration and CI.

Do not modify frozen exports or shared types in feature tasks. Propose changes to coordinator. resolveTurn is deterministic, immutable and has no network, UI or clock. Agent observations hide all other agents' private information. Rule fallback must complete six rounds for either player.

Run npm run typecheck, npm run test and npm run build. Report real results. Do not claim live deployment or provider access without verification.
