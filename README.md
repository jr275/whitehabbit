# whitehabbit

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_0n9Cl9jz8u3HQbzAUOLKrk6pKsZ6)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Testing

```bash
pnpm test
```

Runs the full suite (`vitest`) against a real PostgreSQL database — set
`DATABASE_URL` to a real, reachable Postgres instance first (locally:
`sudo service postgresql start && createdb whitehabbit_test`, then
`DATABASE_URL=postgres://postgres:postgres@localhost:5432/whitehabbit_test`,
which is also the default `vitest.config.ts` falls back to). The suite's
global setup applies every migration under `migrations/` automatically and
truncates all tenant-owned tables before each run — see
`tests/setup/global-setup.ts`. Tests never silently skip for a missing
database; they fail loudly with the reason, matching this codebase's
"never fake success" convention (see `ARCHITECTURE.md`).

Includes real unit tests (SSRF guard, entity resolution, opportunity
scoring, information gain, robots.txt/HTML extraction), a tenant-isolation
integration suite (`tests/integration/`), and one deterministic end-to-end
test that runs the entire Website → Crawl → Knowledge Graph → Opportunity →
Page → Publish → Public render vertical slice against a fixture website
(`tests/e2e/`).

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
