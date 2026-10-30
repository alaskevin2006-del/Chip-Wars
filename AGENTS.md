# Chip Diplomacy implementation boundaries

User confirmed 2026-10-29: supersede V3 with four-agent text diplomacy. Preserve Chip-Wars source and history. docs/diplomacy-contracts.md is new contract; old V3/contracts govern legacy only.
Exactly USA, China, Netherlands, ASML. Default three rounds, configurable 1–5. No economic scores, database, extra framework or fabricated model success. Production UI/API use real DeepSeek only; no demo fallback. Offline test/probe fixtures require an explicit server-only flag. Server holds keys and private sessions. No chain of thought.
Feature tasks use separate branches/worktrees. Delegate engine and UI after stage 0. Engine owns server/diplomacy/{engine,scenario,demo}.mjs and tests/diplomacy-engine*. UI owns src/diplomacy/** except types.ts and tests/diplomacy-ui*. Coordinator owns shared types, HTTP/provider integration, root configuration, archives and docs. Preserve all old gameplay modules.
Never commit credentials or server identities. Do not change unrelated services or global settings. Preserve local ports 3000/5001. Run npm run typecheck, npm run test, npm run build; report real results.
