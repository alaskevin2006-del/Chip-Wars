# Frozen contracts — V3.0

Canonical data types: src/engine/types.ts. GameState extends WorldState; no duplicate writable UI indicators. Config is stored on state so observation/validation use the identical rules. Initial numeric configuration, costs, delays, AP and all mechanics parameters are [G] in config.ts.

Public exports of src/engine/index.ts:
- createGame(config, seed, playerRole): GameState
- getObservation(state, role): AgentObservation
- getLegalActions(state, role): LegalAction[]
- validateDecision(state, role, decision): ValidationResult
- resolveTurn(state, decisions, randomInputs, config): TurnResult
- projectPhase(baseState, priorDecisions, targetPhase, config): GameState
- deriveIndicators(state): Indicators
- scoreGame(state, role): Score
- DEFAULT_CONFIG: GameConfig (feature engine implements/export)

Decision orchestration: start with S0_BRIEFING. Obtain BOTH major-government decisions from this same pre-action state (opponent never sees player's sealed choice). projectPhase(base, majors, S2_THIRD_GOV, config) applies prior major actions to an immutable projection. All three third governments decide from this same projection. projectPhase(base, majors+thirds, S3_FIRMS, config) applies preceding decisions; all four firms independently decide from that projection. Finally resolveTurn(BASE, allNineDecisions, randomInputs, config) replays/validates each phase and charges each action exactly once, settles M1–M6, records S5_REPORT, advances turn (1..6; finished after six). Projected states must never be submitted as the base for resolveTurn. Random inputs and rng_state are explicit and replayable. No engine calls to a decision maker.

Rule API: src/agents/rule.ts exports decideRule(observation: AgentObservation): AgentDecision. It sees only the observation, including its own weights/cash and legal actions. LLM adapter exports decideLLM(observation, options?): Promise<{decision: AgentDecision|null; fallback:boolean; reason?:string}>; it sends only observation and legalActions and leaves rule fallback to coordinator. Optional runtime config/status: GET /api/health; POST /api/agent/decide receives {observation, legalActions}, returns {decision, fallback, reason?}. Failed responses can return null decision. Server validates runtime schema and choices; authoritative engine still checks AP/money/full legality. Production Node entry server/index.mjs serves dist and API on one port.

Actions have stable template IDs in ACTION_IDS (24 plus HOLD), optionally target and level. level on license actions is desired absolute next 0/1/2 level, at most one step per turn. Distinct options are uniquely identified by id+target+level. Decision cannot repeat a template (exception CN_MATERIAL_LICENSE may target ga and ge separately; each target once), or change a single policy twice. HOLD is free and cannot accompany other actions. Empty actions means hold. Every template/target is checked against generated legal actions AND aggregate AP/cash. Negotiation CN_OFFER can remain hidden in MVP, with explicit disclosure. Server cannot invent economics or accept state mutations from text.

Observation.publicState contains public policy, industry technology/capacity, materials, government budgets, published profits, politics, derived indicators and public project queue. Other firms' cash, opponent preference vectors, estimates, strategy types and sealed choices never appear. History is public event summaries only (no private reasoning from competitors). Public game indices are fictional, not empirical forecasts. Browser-resident logical privacy is not tamper resistance.

UI receives an observation, selected Action[], last TurnRecord and optional loading/fallback/error states. It requests a turn through an adapter and never assigns economics. Mock uses the same frozen observation structure and is replaced by coordinator's engine adapter; mock data must never be imported by production adapter. Scores: technology, economy, diplomacy, fiscal (0–100), discounted long-term projects displayed separately. A report lists actions and actual deltas; trends only use prior real TurnRecords.

File ownership and branches: AGENTS.md. Shared/root changes only coordinator. No new APIs without coordinator update of this document.
