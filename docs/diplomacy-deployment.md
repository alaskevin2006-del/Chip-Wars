# Chip Diplomacy V1 runtime

The current application implements docs/game-rules-v1.md: four roles, four rounds, private goals, negotiated action commitments and deterministic settlement. Old Chip-Wars and the earlier text-only Diplomacy sources remain available in Git and their original modules. Do not use the old ops/deploy.sh for this application.

## Local runtime

Use Node22.16+/24 and npm ci. Configure a private .env from .env.example. npm start serves the application and API on5001; npm run dev serves Vite on3000 and forwards /api to5001. npm run build builds the new index.html and preserved legacy.html. Keys must never use VITE_ variables. The production server has no npm runtime dependencies; package server/diplomacy-index.mjs, server/v1/*.mjs and server/diplomacy/*.mjs along with dist/ and the deployment scripts.

All production sessions require the configured real DeepSeek provider. Requests for demo mode, injected goals or configurable rounds are rejected. Unit tests and the network-disabled deployment probe inject an internal provider fixture through the server factory; this fixture is not a production API mode or runtime fallback. Missing/invalid model actions become explicitly labeled timeout PASS, never model success. The backend advances independently of browser polling. Human stages default to5minutes; reports auto-advance after20seconds. Games live only in backend memory and are lost on process restart; quota persists separately.

## Isolated release procedure

Keep the existing public address and4187 port. Use the isolated chip-diplomacy.service, container, immutable releases/current directory and private runtime ledger. Never change unrelated applications, proxy/default site, firewall, services or ports. No global restarts or upgrades.

A release archive contains only dist/, the server modules above, ops/diplomacy-probe.mjs, ops/diplomacy-release.py and VERSION. Exclude .env, node_modules, source archives, private connection data and chat logs. Record the exact Git SHA and archive SHA256. Transfer the package and deployment script by authenticated SSH/SFTP, then run:

```text
python3 /tmp/diplomacy-release.py install /tmp/chip-diplomacy-<sha>.tar.gz <sha> <sha256>
```

The script validates ownership, archive paths/digest, and uses the existing official Node image by its exact local image ID without pulling or upgrading. A temporary read-only, network-disabled container first verifies the built frontend and all four V1 rounds with four final results. A successful offline probe does not verify provider access or public reachability. After it passes, only this project's service changes. Repeating the active version preserves quota and rollback metadata.

Provider credentials remain in the existing private server environment, directory700/file600. Timeout45seconds, maximum output2200tokens. Daily allowance defaults to60; the user authorized removing this cap on2026-10-30. Set LLM_DAILY_LIMIT=unlimited, or Infinity for compatibility with prior Diplomacy releases. Both keep persistent finite attempt counters and bounded concurrency/timeouts; zero still disables the provider. The deployed environment uses Infinity so a rollback remains compatible. Legacy quota migration converts integer UTC days to ISO dates and preserves the maximum current-day usage. Corrupt/uncertain quota is closed rather than reset. Capability tokens are per-game access tokens, not user accounts; never expose them or keys in deployment evidence.

After deployment verify the public homepage/assets, /api/health rulesVersion1.0, model configuration, a complete four-round real-provider game, privacy boundaries, and unchanged unrelated container start/restart counts. Distinguish successful LLM choices from timeout PASS in the report. Compare only key hashes inside the server when checking credential activation; never print environment contents. Run npm run typecheck, npm run test, npm run build and the four deployment regression tests with python -m unittest discover -s ops -p test_diplomacy_release.py before release.

## Rollback

```text
python3 ~/chip-diplomacy/current/ops/diplomacy-release.py rollback
```

Later updates restore the previous Diplomacy release and wait for HTTP readiness. The first migration can restore the original Chip-Wars service and autostart state. Failed health checks attempt the same project-only restoration automatically. Old source, releases, service unit and private environment are retained. A text-only prior release does not expose rulesVersion1.0; use that release's health contract when validating rollback. The new V1 backup tag is backup/text-diplomacy-before-v1-20261030.
