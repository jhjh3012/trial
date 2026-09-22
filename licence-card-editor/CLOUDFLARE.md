# Cloudflare Pages + Worker deployment

This artifact is ready for Cloudflare Pages with Pages Functions. Pages Functions run on the Cloudflare Worker runtime, so the React frontend and `/api` routes stay on the same domain.

## 1. Create the D1 database

From the `artifacts/licence-card-editor` directory:

```sh
npx wrangler d1 create licence-card-editor
npx wrangler d1 migrations apply licence-card-editor --remote
```

Copy the returned database ID into `wrangler.toml` as `database_id`.

## 2. Configure Cloudflare Pages

Use the repository root as the project root and set:

- Build command: `pnpm --filter @workspace/licence-card-editor run build:cloudflare`
- Build output directory: `artifacts/licence-card-editor/dist/public`
- Root directory: `/`

The root `wrangler.toml` and `functions/` entrypoint delegate to the Cloudflare files inside this artifact. If the Pages project is configured with `artifacts/licence-card-editor` as its root instead, use `dist/public` as the output directory and the artifact's local `wrangler.toml`.

## 3. Deploy

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/licence-card-editor run build:cloudflare
npx wrangler pages deploy artifacts/licence-card-editor/dist/public --project-name licence-card-editor
```

Cloudflare detects `functions/api/[[path]].ts` and deploys it with the Pages site. The D1 binding supplies persistent storage for keyword transfers and two-minute QR verification tokens.

## Notes

- The frontend continues using relative `/api/...` URLs, so no CORS or API base URL is needed.
- The current Express API remains the local Replit development API.
- Existing PostgreSQL data is not copied automatically into D1. Export any records that need to move before switching production traffic.