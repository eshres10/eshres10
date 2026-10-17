# SewSpace (Seams Club)

A social space for the sewing community built on a private sewing studio. The product name is **Seams Club**; internal names keep the `sewspace` prefix. **Read `CLAUDE.md` first**: it has the stack, the agreed decisions, access rules and gotchas.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run migrate` — apply SQL migrations in `lib/db/migrations` (runs automatically at API startup). Do not use `drizzle-kit push`.
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

See "Where things live" in `CLAUDE.md`. Step-by-step forms (Phase F) are built from the shared pieces in `artifacts/sewspace/src/components/flow/` (New post / Edit post: `components/post-flow/`; Create a project: `/projects/new` and the "Finish setting up" list on project pages; hashtag pages: `/tags/:tag`, served by the API for meta tags); their designs are in `docs/design/flows/` (the step screenshots in `images/` are kept out of git).

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

See "Gotchas" in `CLAUDE.md`. In short: migrations are additive SQL files (never `drizzle-kit push`), route handlers use the `db` from `scoped()`, and drafts/measurements/pattern PDFs are never visible to anyone but their owner.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
