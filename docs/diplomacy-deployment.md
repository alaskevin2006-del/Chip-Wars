# Chip Diplomacy runtime

New code is separate from legacy Chip-Wars. Do NOT use the old ops/deploy.sh archive format or chip-wars service for this application without a new reviewed deployment plan. No remote service was replaced during this work; legacy deployment records describe only Chip-Wars.

Local verified entry: http://127.0.0.1:3000 with Vite forwarding /api to http://127.0.0.1:5001. These are the inspected MiroFish configured ports; neither was listening before this task. No old process was stopped to claim them. Only this task's new backend was restarted during testing.

Install Node22.16+/24, npm ci. Configure private .env from template. npm start loads only this project's .env on the server. npm run dev starts frontend with strictPort. Model keys are never VITE variables. npm run build creates new index.html and old legacy.html. Production-style local server serves dist and API from5001; original frontend dev entry stays3000.

For a future remote deployment, use a new isolated directory/service and explicitly reviewed target port, preserve unrelated services/default sites, set actual PUBLIC_ORIGIN, HOST and PORT, and protect .env/ledger directory. Node server needs no npm runtime dependencies after build, but must include all server/diplomacy/*.mjs files and server/diplomacy-index.mjs. Serve behind HTTPS for public access. Current session bearer tokens are capability tokens, not account authentication; do not publish a shared provider without additional access protection and appropriate provider account limits. Keep persistent quota ledger writable and private; active simulation memory is intentionally ephemeral.

Rollback locally: stop only these two development processes; start original MiroFish from its untouched directory, or create a fresh Chip-Wars worktree at backup/chip-wars-before-diplomacy-20261029. See archive/README.md. Credentials are excluded from source archives and must be configured separately.
