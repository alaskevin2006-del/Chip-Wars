# Chip Diplomacy actual verification

Task date: 2026-10-29 (Asia/Shanghai). User confirmed replacing V3 with four-role text diplomacy while preserving old source. This record is for the NEW app. docs/progress.md records historical Chip-Wars checks and is not new deployment evidence.

## Preservation

Baseline clean Chip-Wars main at7733b0b; remote checked against origin main before development. Backup tag backup/chip-wars-before-diplomacy-20261029. New branch codex/chip-diplomacy and separate worktree; engine/UI delegated in independent branches/worktrees. Legacy game source modules unchanged. MiroFish archive from7657031, including dirty script and its untracked original backup. Original MiroFish checkout not changed except backup branch creation. Archive excludes keys and generated/runtime data; required imported logos included. File hashes verified against staged Git blobs; archive marked binary-preserving to avoid line-ending corruption. Original MiroFish is not reinstalled or business-tested by this task.

## Runtime and actual model tests

Original MiroFish configuration inspected:3000 frontend,5001 backend. Both ports initially unoccupied. New frontend/backend started on these exact local ports. No remote deployment, remote service replacement or public reachability is claimed.

DeepSeek JSON mode and default model verified against official docs on task date: https://api-docs.deepseek.com/quick_start and https://api-docs.deepseek.com/guides/json_mode/ . Existing official DeepSeek credentials mapped privately from original local environment into ignored new environment; never printed or committed.

- Live observer trial1: three rounds/12 slots, four actual final decisions; two slots failed structured validation after retry and were correctly skipped.
- Live observer trial2 after better validation feedback: three rounds/12 slots, four actual final decisions; one failed slot correctly recorded. Private actions not visible to observer are intentionally omitted.
- Live browser trial3: player controlled USA, submitted all three rounds; other three agents performed nine successful LLM actions. Three rounds/12slots completed, four final decisions, zero slot errors. Only six model messages were visible to USA because other bilateral private messages were filtered. This trial verifies real frontend/API/model integration and player intervention, not a scripted demo. Actual generated choices and outcomes are not reproducible guarantees.

Local ignored evidence: artifacts/live-session.json (last observer run), artifacts/live-player-session.json (player-view projection only; no session token, key or private role notes), artifacts/diplomacy-live-player.png.

## Browser checks

Bundled Chromium used for actual browser testing. Desktop1440x1100, mobile390x844: no horizontal overflow. World map, four cartoon envoys, wooden roundtable, goal bubbles and secretary rendered. Demo observer completed three rounds/12messages; USA player input appeared in next-round records; pause/resume/reset worked; mobile one-round simulation ended with four cards; refresh returns clean opening. Browser page-error list empty. One initial browser run was invalidated by coordinator restarting the test backend; it was rerun successfully against a stable backend, not counted as a pass.

Screenshots in ignored artifacts: diplomacy-desktop.png, diplomacy-mobile.png, diplomacy-demo-finished.png, diplomacy-live-player.png. Mobile map clipping observed and corrected before final screenshot verification.

## Checks

Integrated initial check: npm run typecheck passed, npm run test113/113 passed, npm run build passed with both new and legacy entry. Final updated results are recorded below after final run. New tests cover immutable state,25 complete mode/round/player combinations, privacy, proposal consent/revision, authority, malformed model JSON, timeout, failed final slots, authenticated sessions, duplicate/stale requests, pause/discard and UI response recovery.

No new framework/database/economic simulation. Sessions reside in server memory and are lost on restart; refresh loses the page-held capability and returns to opening. Quota ledger persists. Free-text legal correctness is bounded by prompts and discrete action permissions, not a complete legal-language parser. Model failures still occur and are shown honestly; no fabricated fallback text in live mode. Historical sources describe dated background, not comprehensive current law. Demo remains deterministic example data.

## Final verification

Final npm run typecheck passed; npm run test117/117 passed across10 files; npm run build passed, generating both new and legacy entries. Archive114 files have zero SHA-256 mismatches. Legacy src/engine,src/agents,src/game,src/ui,src/App.tsx and server/index.mjs show zero changes against the original baseline. Credential-pattern scan of frontend assets found zero matches. Updated mobile map and role legends rechecked visually and through browser flow; desktop/mobile no overflow and browser error list empty. Final source and archive credential checks run before commit/push.

## Compact single-view interface follow-up

User requested a clearer single page without a required map. Removed the map, large hero and decorative notebook/footer from the default view. Compact council and proposals sit left of the dominant transcript; final decisions switch in the same right panel. Desktop1440x900 now has document height900 (previous1802), transcript starts at228 (previous1265). Desktop1366x768 has document height768; controls, four representatives and transcript remain visible. Transcript/results/proposals scroll inside their own regions. Mobile390x844 uses natural stacking, document height1277, no horizontal overflow. Player submit remains visible within the desktop viewport. Actual browser demo3rounds, player submission/next round, reset, result tabs, history-evidence jump and mobile rendering passed with no page errors. Updated screenshots: artifacts/compact-desktop.png, compact-desktop-768.png, compact-player.png, compact-decisions.png, compact-mobile.png. Typecheck,118/118tests and build passed; no provider calls or backend changes were required for this layout task.

## Substantive negotiation text follow-up

User reported that the content felt like brief chat. Read the local WarAgent agent/board/stick implementation: it separates responses and new actions and maintains explicit relationship/internal records. This follow-up targets the user's content-depth issue without importing its war system, chain-of-thought output or economics. Current UI was verified to be running the old fixed demo; live quality was checked independently.

Measured previous demo12messages mean40characters (34–43); previous live observer sample10visiblemessages mean230characters (184–281). Expanded independent fictional private dossiers (fournotes each), substantive issue agenda, grounded role-visible negotiationBrief with actual message/proposal references. New prompt asks for concrete responses, conditions, tradeoffs and nextsteps in paragraphs; final decision distinguishes outcome and unresolved disagreements. No forced compromise. Provider now allows2200outputtokens by default (configured1000–4000) and45seconds total per slot; still one retry, same persisted daily budget, thinking disabled and no stored chain of thought. API/action schema, engine legality and compact layout unchanged.

New demo12messages mean345characters (274–418); still fixed scripts. New actual live observer trial:3rounds/12slots,11successful visible model actions,4final decisions, one Netherlands action in round2 rejected after two validation attempts and honestly skipped. Mean visible text804characters (646–980). Examples: USA proposed technical classification and verification; China raised evidence/necessary-data/confidentiality conditions; Netherlands made an alternative proposal with evidence threshold and review process. These are observed outputs from one trial, not a claim of predictive validity or superiority to WarAgent. No head-to-head controlled model comparison performed. Current single-action-per-role scheduling and1–5round limit remain.

Final typecheck,122/122tests (11files), build passed. Tests include prompt projection privacy, specific retry correction, grounded brief privacy/cloning and no public disclosure of private agreement existence. Browser completed new scripted3rounds, preserved12visiblemessages/fourfinaldecisions and rendered multi-paragraph text in the same compact layout. Screenshot artifacts/richer-diplomacy-demo.jpg, live result artifacts/live-rich-session.json and readable artifacts/真实推演样例.md remain ignored local evidence. Old user-view session was read only; new preview used for testing.
