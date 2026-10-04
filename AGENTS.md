
## Gym product boundaries

- The gym application is https://gym.readysix.app; player state, readiness, complaints and permitted training load come from https://readysix.app. Preserve ReadySix as the authoritative source; gym workout logs and reaction reports do not replace that assessment.
- Deploy the gym container on the existing Russian server; the former Vercel gym project is retired. Preserve the runtime secrets, isolated Valkey storage and provider gateway.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
