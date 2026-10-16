# SewSpace

A social space for the sewing community (feed, profiles, challenges, forum) built on top of a private sewing studio (projects, stash, patterns, measurements). Mobile-first. Public content is readable signed out, like Reddit; interacting needs an account.

Development happens in this repo; Replit runs and deploys it. Work is done in phases (0–8, see "Build order"); each phase is one commit, then stop for review.

## Stack
- pnpm monorepo, Node 24 on Replit, TypeScript 5.9.
- `artifacts/sewspace`: Vite + React 19 SPA, wouter, TanStack Query, Tailwind 4. Served statically in production.
- `artifacts/api-server`: Express 5, bundled with esbuild to `dist/index.mjs`.
- `lib/db`: Drizzle ORM + Postgres (`pg`). Schema in `src/schema/sewspace.ts`, SQL migrations in `migrations/`.
- `lib/api-spec/openapi.yaml`: **source of truth for the API.** Orval generates React Query hooks (`lib/api-client-react`) and Zod schemas (`lib/api-zod`).
- Auth: Clerk (`@clerk/express` + `@clerk/react`, proxied through `/api/__clerk` in production).
- Files: Replit Object Storage via presigned upload URLs (`artifacts/api-server/src/lib/objectStorage.ts`).
- AI: OpenAI `gpt-5-mini` through `lib/integrations-openai-ai-server` (Replit AI integration env vars).

## Commands
- `pnpm run typecheck` — everything. `pnpm run build` — typecheck + build.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate hooks and Zod after editing `openapi.yaml`.
- `pnpm --filter @workspace/db run migrate` — apply SQL migrations to `DATABASE_URL` (also runs automatically at API startup and in `scripts/post-merge.sh`).
- `TEST_DATABASE_URL=postgresql://user:pass@host:port/postgres pnpm --filter @workspace/db test` — RLS tests (SQL, `lib/db/test/*.test.sql`). The user must be allowed to create databases.
- `TEST_DATABASE_URL=… pnpm --filter @workspace/api-server test` — API tests (`node:test` + `tsx`, `artifacts/api-server/test`). Uses a test-only auth stub (`x-test-user` header) and a fake object store.

## Decisions (agreed with the owner; don't re-ask)
- **Access control:** one server-side module (`artifacts/api-server/src/access/`) decides who can see what; every read goes through it. Postgres row-level security is a second layer: each request runs in a transaction as role `sewspace_app` with `app.user_id` set (`withUser` in `lib/db/src/index.ts`, `scoped()` in `artifacts/api-server/src/lib/scoped.ts`).
- **Migrations are additive only:** no renames, drops or data deletion. New visibility columns default to `private`. Hand-written SQL in `lib/db/migrations/NNNN_name.sql`; keep the Drizzle schema in sync by hand. `drizzle-kit push` is disabled (it would drop policies and views).
- **Never public, whatever the visibility setting:** measurements, pattern PDFs, AI visualisation images. Enforced by upload `purpose` (`pattern_pdf`, `visualization` can never be served to anyone but the owner, and can't be put in image fields).
- **Handles** are owned by SewSpace (not Clerk usernames): 3–30 chars of `a-z 0-9 _ .`, unique ignoring case (`lower(handle)` index), reserved words in `access/handles.ts`. Chosen on first visit at `/welcome`.
- **Admin:** Clerk user ids in `ADMIN_USER_IDS` (comma-separated) → `viewer.isAdmin`.
- **Images:** client downscales with canvas before upload (`src/lib/upload.ts`, 1600 px; avatars 512 px; re-encoding strips EXIF/GPS). Server-side `sharp` resize + 400 px thumbnails arrive in Phase 2 (`sharp` is the only pre-approved new dependency).
- **AI:** keep OpenAI `gpt-5-mini` via the existing integration. Assistant never available signed out.
- **No demo data** for new users. Existing `is_demo` rows stay as they are and stay private.
- **No private accounts or follow requests in v1:** followers-only content covers it.
- **Ask the owner first** before adding any other dependency or paid service (including image moderation).

## Access rules (current: Phase 1)
**Visibility** (`public` / `followers` / `private`, default `private`) exists on projects (makes), fabrics, threads and patterns. Measurements have none: never shared.

The rule (TypeScript `visibleTo()` in `access/visibility.ts`; SQL `sewspace_can_view()` in migration 0002 — **keep them identical**):
1. The owner always sees their own rows.
2. Private rows: owner only.
3. If the viewer and owner have blocked each other (either direction): nothing, even public.
4. Public: everyone, signed out included.
5. Followers-only: signed-in followers.

| Data | Owner | Follower | Other signed-in | Signed out | Blocked (either way) |
|---|---|---|---|---|---|
| Make / fabric / thread / pattern, `public` | read/write | read | read | read | nothing |
| … `followers` | read/write | read | nothing | nothing | nothing |
| … `private` | read/write | nothing | nothing | nothing | nothing |
| Steps and photos | follow their make | | | | |
| Measurements | read/write | never | never | never | never |
| Profile: name, handle, bio, avatar, joined | read/write | read | read | read | read (Phase 4 hides) |
| Profile: units, experience, garments | read/write | never | never | never | never |
| Image upload | read | when shown on a row they may see (or it's a public avatar) | | | |
| Pattern PDF / AI visualisation upload | read | never | never | never | never |

- Only owners write, whatever the visibility (RLS `owner_all`; `visible_read` policies are SELECT-only). Projects may only link the owner's own pattern/fabric/thread/measurements, and steps/photos only go on the owner's projects.
- Studio routes (`/api/fabrics`, `/api/projects/:id` …) always filter to the caller's own rows (`own()`); other people's shared items come only through `/api/public/*`.
- Public responses never include `measurementProfileId`, measurement values or `pdfUrl` (`access/makes.ts`).
- Storage downloads return **404, never 403**. File fields may only point at the caller's own uploads (`findForeignObjectField`).
- Follows and blocks tables exist (Phase 1) but are only written by tests until Phase 4 adds the actions. You only see follows you're part of and blocks you made; `sewspace_blocked_with(other)` answers block checks for pairs that include the caller.
- Tests: the SQL suite tests RLS alone; `api-server/test/access-layer.test.ts` runs the access module with RLS bypassed (`withoutRls`) so each layer is proven on its own. Keep both when adding rules.

## Where things live
- API routes: `artifacts/api-server/src/routes/` — `public.ts` (no sign-in: profiles, makes), `profile.ts`, `studio.ts`, `visibility.ts` (`PUT /api/visibility/:kind/:id`), `storage.ts` (`objectReadRouter` is mounted before `requireAuth` because public avatars must load signed out), `seo.ts` (HTML for `/@handle`, `/makes/:id`, `/sitemap.xml`, `/robots.txt`).
- Viewer: `req.viewer` set by `attachViewer` (`middlewares/auth.ts`); Clerk in production, header stub only via `createApp({ testUserId })` in tests.
- Web: `src/App.tsx` (routes), `src/components/shell/` (signed-in sidebar/header/tab bar, public header), `src/components/auth/` (`RequireSignIn`, `useRequireSignIn` sign-in sheet), `src/pages/*` (public: `public-profile.tsx`, `public-make.tsx`), `src/components/visibility.tsx` (picker + badge), design tokens in `src/index.css`.
- Design reference: `docs/design/*.dc.html` (mockups only; never copy their photos into the app).

## Design tokens (`src/index.css` → Tailwind classes)
`bg-yellow` #e6e51e (primary fills), `ink` #000, `red` #f34646 / `red-ink` #c42a2a (small text), `blue` #466cf3 / `blue-ink` #2f55d4 (text), `peach` #ff8562, `canvas` #f2f2f2 (20 px dot grid on body), `line` #e6e6e6 (card hairline), `subtle` #555. Poppins 700 headings (`font-display`, tight tracking), Inter body, `.eyebrow` 11 px uppercase .16em. Pill buttons (`.btn`, `.btn-primary` yellow, `.btn-line` outline), cards `rounded-[30px]`–`[40px]`, inputs `.field` (16 px radius, black border, yellow focus ring). One shadow: `shadow-float`, only on the floating header and nav. Touch targets ≥ 44 px; icon-only buttons need `aria-label`. Don't use hex colours in components.

## SEO and Replit path routing
Replit routes by path prefix. The web artifact serves `/` statically; the API artifact owns `/api`, and also `/@`, `/makes`, `/sitemap.xml` and `/robots.txt` (`artifacts/api-server/.replit-artifact/artifact.toml`). For `/@handle` and `/makes/:id` Express returns the SPA's `index.html` with title/description/og tags injected (`routes/seo.ts`). In production it reads `artifacts/sewspace/dist/public/index.html` (override with `WEB_INDEX_HTML`; falls back to fetching `/index.html` from the site). In development it fetches Vite's `index.html` and **forwards every other `/@…` path (e.g. `/@vite/client`) back to Vite** — that is why `vite`, `fs`, `id` are reserved handles. Set `PUBLIC_ORIGIN` if canonical URLs should use a custom domain.

## Gotchas
- Route handlers must use the `db` passed by `scoped()` (or `withUser`). Never import `ownerDb`/`pool` in `routes/` — a test enforces this. `ownerDb` bypasses RLS.
- `scoped()` sends the response only after the transaction commits. Don't call OpenAI inside it: read in a short `withUser`, call the model outside (see `/assistant/messages`).
- A Postgres RLS refusal (code 42501) surfaces as 404 via the app error handler.
- Page HTML for followers-only content is sent `Cache-Control: private, no-store` and `noindex`; only public pages for signed-out visitors are cacheable.
- When adding a SELECT policy that lets others read a table, re-check every WITH CHECK that used `EXISTS (SELECT … FROM that_table)` to mean "is mine": it now also matches visible rows (migration 0002 had to tighten these).
- In tests, import app code with `await import()` after `./harness`, so `DATABASE_URL` is set first.
- `PATCH` bodies for stash/patterns/projects are full objects (spec uses `allOf` of the input schema).
- `@workspace/integrations-openai-ai-server` throws on import without its env vars; tests set placeholders.
- Orval is pinned to emit react-query v5 hooks (`orval.config.ts`).
- The migration runner marks `0000_baseline.sql` as applied on databases created by the old `drizzle-kit push`.
- Emergency rollback for a migration lives in `lib/db/migrations/rollback/` (use with the previous API build).

## Build order
0. Foundations ✅ — file privacy fix, handles + settings, public/signed-in API split, access module + RLS, no demo seeding, sign-in that returns, robots/sitemap/meta.
1. Privacy controls and public read access ✅ — visibility on makes/stash/patterns, follows + blocks tables, `/makes/:id` public page with meta + sitemap, sharing panel. 2. Posts and feeds (image pipeline). 3. Profiles with tabs. 4. Likes, comments, follows, save, share, report/block, admin review. 5. Shared pattern/product pages and reviews. 6. Challenges. 7. Forum. 8. AI assistant upgrade.
