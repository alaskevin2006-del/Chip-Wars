# Preserved originals

Chip-Wars source: https://github.com/alaskevin2006-del/Chip-Wars , baseline `7733b0b11593b5c35e49a75ae14279f88e045284`, tag `backup/chip-wars-before-diplomacy-20261029`. All original gameplay modules remain in place. Restore safely in a new directory: `git worktree add ../Chip-Wars-restored backup/chip-wars-before-diplomacy-20261029`, then npm ci and npm run dev. No old gameplay code deleted.

MiroFish source: https://github.com/666ghj/MiroFish , commit `7657031ac01184afe2cb220f5ee3545573b5e843`. The dirty local script backend/scripts/run_parallel_simulation.py and untracked `.orig_lkx_20261020` backup are both preserved as found. A local branch backup/before-chip-diplomacy-20261029 preserves the upstream commit. Original checkout untouched except this backup branch.

mirofish-original preserves source structure, dependency manifests, Docker configuration, documentation, required frontend logo assets, license and notices. manifest.json records SHA-256 hashes. Environment template values intentionally blanked. Excluded: secrets, .git, dependencies, virtual environments, caches, uploads/generated data, static promotional media, binary documents, large temporary files. README promotional image links may therefore be absent. Source archive, not a bundled runtime. AGPL-3.0 terms remain in mirofish-original/LICENSE.

Restore by copying mirofish-original to a new directory, install per its README, configure fresh private .env. Complete promotional media available at upstream commit. Original commands: npm run setup:all, npm run dev; frontend 3000, backend 5001. Stop Chip Diplomacy first to free ports. Never overwrite the original checkout or push to third-party upstream.

WarAgent (https://github.com/agiresearch/WarAgent, Apache-2.0) informed the roles/Secretary/public-board design only; no implementation copied. OASIS, Zep and knowledge graph not needed for new simulation.
