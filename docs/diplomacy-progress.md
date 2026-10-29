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
