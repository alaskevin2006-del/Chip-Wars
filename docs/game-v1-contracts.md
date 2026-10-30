> Historical V1.0 contract. Current application follows docs/game-v16-contracts.md.
# Four-round V1 integration contract

Sole game rules: docs/game-rules-v1.md, adopted by user2026-10-30. Supersedes old text-only and V3 for new entry. Shared interface src/game-v1/types.ts. Fourroles US,CN,NL,AS fixed totalRounds4. Numeric game assumptions ONLY A/B/H/R and specified credit/fulfilledDeals. No new effects or fixed economic forecasts. Production uses real DeepSeek, no demo endpoint/fallback. Retain earlier code as legacy.

## Pure engine (engine owner)

server/v1/engine.mjs exports:
- ROLE_IDS array; GOAL_CATALOGUE Record<Role,GoalCard[]>; ACTIONS Record<Role,ActionCard[]>.
- createGame(draws:Record<Role,0|1>): State. Caller supplies independent unbiased draws; no engine randomness/clock/network. round1 negotiation, fixed opening stats. State.version increments each accepted operation. State fields include phase,round,state,roundStart,player-independent private goals, pendingResearch,researchUses,credit,fulfilledDeals,messages,deals,actions,actionSources,readyRoles,reportHistory; private internal structure may vary but coordinator needs phase/round/version/actions and readyRoles.
- getSnapshot(state,viewer:Role): Snapshot WITHOUT id,aiStatus,deadlineAt,notices (HTTP attaches these). Exactly shape types.ts for remaining fields. pendingResearch/researchUses public. possible goal catalogue public, actual selected goals hidden except ownGoal; after finished reveal all and results. No unowned private messages, other selected goals, current sealed opponent action IDs. submittedRoles flags may be public; ownAction only viewer's own. Public deals by default; their text is non-executable, commitments are executable. Metrics only in state, derived views never writable duplicates.
- getObservation(state,role): role's public rules/state, ownGoal, own visible messages/deals, own legalActions and history. Never other actual goals/sealed opponent choices. Do NOT include global private state under nested keys. Public goal catalogue allowed.
- legalActions(state,role): ActionCard[] (C1 absent round4 or after2uses); allroles may PASS.
- sendMessage(state,role,{content,target:Role|null},source='player'): State; max2messages/role/current round, nonempty1–100Unicode codepoints; only negotiation/not-ready; target another role or null. Message source player/llm.
- proposeDeal(state,role,{commitments:Partial<Record<Role,ActionId>>,text:string}): State. max1proposal/role/round,2–4roles including proposer, each commitment legal currentround nonPASS. proposer acceptance implicit because explicitly selected own commitment. Only negotiation/not-ready. Text max300, informational only. Initial status pending.
- respondDeal(state,role,{dealId,accept:boolean}): State. signing phase/not-ready only; invited unaccepted party, current-round pending proposal. Reject closes proposal. Last accept atomically checks all participant locks; any conflict -> proposal status conflict, no new locks; otherwise effective and locks all roles. Cannot become a party to2effective deals in one round. Prior non-final consents do NOT reserve a slot. Wrong/duplicate/outsider response rejects.
- ready(state,role): State. negotiation all4ready -> signing with cleared readyRoles; signing all4ready -> actions and pending proposals expire. Idempotent for already-ready same phase. No metric changes in these phases.
- submitAction(state,role,actionId,source='player'): State. actions only, one legal choice perrole. Same choice repeat idempotent; conflicting re-submit rejects. Never enforce agreement promises: breach allowed. After last choice auto resolveRound. Sources player/llm/timeout; missing/failed agent choice handled by HTTP as PASS timeout, not fake model success.
- resolveRound(state,round=state.round): State. Reject incomplete/invalid choices, same-round already settled returns unchanged. Rules based on roundStart; sum all deltas THEN clamp once. Credit individually checks promises; fulfilledDeals only if ALL participants comply. reportHistory includes actual choices, conditions/deltas,clamped state,credit and deals. rounds1–3 -> report; round4 -> finished + reveal goals + victory. No agreement means no official victory even with numeric targets. Exactly specified two thresholds AND fulfilledDeals>=1 AND credit>=1.
- advanceRound(state): State. report -> next negotiation, apply pending C1 at start once then capture roundStart; C1 schedules one R increment due following round, at most2uses total, prohibited round4. Round4 finishes directly. No restarting a finished state.

All methods immutable, return cloned nextState or unchanged for idempotent cases, throw Error on invalid input (message safe for user). Numeric values integer0..5 / credit0..2. No secret goal IDs or private content in public errors. Engine tests cover acceptance checklist plus locks, filters and exact simultaneous clipping.

## Server scheduling (coordinator)

Keep server/diplomacy-index.mjs entry and createDiplomacyServer export. Old text server moved to server/text-diplomacy-index.mjs (legacy tests retargeted); old modules kept. Backend scheduler advances independently of browser: negotiation -> signing -> actions -> report -> next/final. Each AI role gets ONE batch call per stage, goal draws from crypto.randomInt(2). It uses only getObservation(role). Negotiation output {messages:[{content,target}],proposal:null|{commitments,text}}; signing {responses:[{dealId,accept}]}; actions {actionId}. No economic edits in model output. Calls may be sequential per stage; sealed choices never visible to others. Entire batch validated on a projection then committed. Model failure explicit notice; no forged messages; missing action PASS with source timeout. One bounded retry, current persisted quota and same provider credentials. No network in engine. Human inactivity deadline (default5min) ends their negotiation/signing and uses PASS for unsubmitted action, labeled; reports auto-advance after20sec, user can advance earlier. Default hard session lifetime2h, model operations pause/discard on epoch change. Optional env small deadlines only in isolated tests/probe.

## HTTP and UI

GET /api/health -> {status:'ok',llm:{enabled,model},rulesVersion:'1.0'}.
POST /api/diplomacy/sessions {playerRole:Role} -> Session. No client goals/draws/mode/rounds. Live unavailable503, reject mock/demo requests. Auth Bearer token for all session routes; viewer fixed at session creation.
Prior text-client payloads {mode,rounds,player} receive409 with an explicit refresh-to-V1 message; they never create a game or spend provider calls. HTML entry uses Cache-Control:no-store; fingerprinted assets remain immutable.
GET /api/diplomacy/sessions/:id -> Snapshot. UI polls about1second; never drives bot steps or settlement. Refresh can restore token sessionStorage if desired (no credentials stored), reset DELETE cancels current epoch.
POST .../:id/message {expectedVersion,content,target} -> Snapshot
POST .../:id/proposal {expectedVersion,commitments,text} -> Snapshot
POST .../:id/respond {expectedVersion,dealId,accept} -> Snapshot
POST .../:id/ready {expectedVersion} -> Snapshot (finish own negotiation/signing)
POST .../:id/action {expectedVersion,actionId} -> Snapshot (sealed)
POST .../:id/next {expectedVersion} -> Snapshot (report only)
DELETE .../:id -> {deleted:true}
POST .../:id/polish {text} -> {candidate:string}; never sends it as a message, player reviews/edits. No new commitments/conditions/threats. Bound1–100chars and refuse added action IDs/numbers/commitment phrases. Optional AI failure no candidate fixture.
POST .../:id/secretary {} -> {advice:SecretaryAdvice}; only player's projected observation. Motive guesses must uncertain:true. No hidden strategies or chain-of-thought.

Invalid player inputs422; stale or conflicting version409 -> UI GET authoritative state, preserve unsent draft. No state mutation by client, no role selection in subsequent requests. Server output notices are generic safe errors, never provider raw text/key or private goal from a competitor. Public phases and current status may be added to snapshot; types changes coordinator only.

UI export src/game-v1/App.tsx; coordinator mounts it from src/diplomacy-main.tsx. Single compact page: fourmetrics explanations, owngoal, public credit/possibletypes, 4round stage progress, chat max2/100chars,AI polish optional, proposal form participant nonPASS commitments, signing controls, actioncards selectable independent of promises, reveal only after settlement, clear report/history/win requirements. Secretary on demand shows guesses as guesses. No mode selector/demo path. Desktop main info same page; mobile readable without overflow. Explain selected goal is hypothetical private game objective. Opponent private goals hidden until final. Preserve earlier UI files unmodified.

