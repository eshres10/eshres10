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
- **Images:** client downscales with canvas before upload (`src/lib/upload.ts`, 1600 px; avatars 512 px; re-encoding strips EXIF/GPS). Post photos are then processed on the server with `sharp` (`api-server/src/lib/images.ts`): EXIF orientation applied, at most 1600 px WebP + 400 px thumbnail, no metadata written (so no EXIF/GPS), dominant colour as a placeholder. `sharp` is externalised in `build.mjs` and resolved from `node_modules` at runtime.
- **AI:** keep OpenAI `gpt-5-mini` via the existing integration. Assistant never available signed out.
- **No demo data** for new users. Existing `is_demo` rows stay as they are and stay private.
- **No private accounts or follow requests in v1:** followers-only content covers it.
- **Ask the owner first** before adding any other dependency or paid service (including image moderation).

## Access rules (current: Phase 7)
**Visibility** (`public` / `followers` / `private`, default `private`) exists on posts, projects (makes), fabrics, threads and patterns. Measurements have none: never shared. (The composer preselects Public for posts; the database default is still private.)

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
| Post (status or photos) | same as the make row above, by its own visibility | | | | |
| Post photos (`sewspace_media`, full + thumb files) | follow their post | | | | |
| Post tags (make/pattern/fabric) | shown only if the viewer may see the tagged item | | | | |
| Measurements | read/write | never | never | never | never |
| Profile: name, handle, bio, avatar, joined | read/write | read | read | read | nothing (404, avatar file too) |
| Profile counts: followers, following, followers-only posts/makes | read | read | read | read | nothing |
| Profile: units, experience, garments | read/write | never | never | never | never |
| Likes on a post | like/unlike as yourself | read count; like if they can see the post | same | read count | nothing |
| Comments (one level of replies) | delete any on your post | read + write if they can see the post; delete own | same | read | nothing either way (hidden and not counted) |
| Saves | private to the saver; only posts they can see | | | | |
| Reports | reporter sees own; admins see all and resolve | | | | |
| Catalog page (shared pattern/product) | anyone reads; any signed-in person adds; creator or admin corrects | | | read | read |
| Reviews | author writes one per page; reads all | read | read | read | nothing either way (hidden; still counted in the numbers) |
| Helpful votes | private to the voter; counts public | | | | |
| Challenge | host rewords (tag and dates fixed) | read | read | read | nothing (across a block with the host) |
| Challenge members | join/leave as yourself until it ends | read | read | read | hidden either way |
| Challenge entry (a post) | enter own **public** posts while running; withdraw own; host marks removed | read while live and the post is visible | same | same | nothing |
| Forum topic / reply | author edits/deletes own; asker accepts an answer | read + reply + upvote (not own) | same | read | nothing either way |
| Forum poll results | author always | after voting, or once closed | same | once closed | nothing |
| Forum votes, poll votes | private to the voter; counts public | | | | |
| Image upload | read | when shown on a row they may see (or it's a public avatar) | | | |
| Pattern PDF / AI visualisation upload | read | never | never | never | never |

- Only owners write, whatever the visibility (RLS `owner_all`; `visible_read` policies are SELECT-only). Projects may only link the owner's own pattern/fabric/thread/measurements, and steps/photos only go on the owner's projects.
- Studio routes (`/api/fabrics`, `/api/projects/:id` …) always filter to the caller's own rows (`own()`); other people's shared items come only through `/api/public/*`.
- Public responses never include `measurementProfileId`, measurement values or `pdfUrl` (`access/makes.ts`).
- Storage downloads return **404, never 403**. File fields may only point at the caller's own uploads (`findForeignObjectField`).
- Posts may only use the author's own media and tag the author's own items (RLS `owner_all` WITH CHECK + API checks). Posting needs a handle and is limited to 30 posts/hour.
- Feeds: Home = people you follow + you (`homeFeed`); Explore = public posts (`exploreFeed`, blocks still apply, `sort=recent|popular`); Saved = your saves you may still see (`savedFeed`). All use `visibleTo` and opaque cursors (`created_at|id`, base64url), 20 per page.
- You only see follows you're part of and blocks you made; `sewspace_blocked_with(other)` answers block checks for pairs that include the caller. The followee may also delete a follow (remove a follower; API not built yet).
- Profiles (Phase 3): `sewspace_public_profiles` hides profiles on the other side of a block, and `sewspace_is_public_avatar` hides their avatar (migration 0004). Header numbers come from SECURITY DEFINER `sewspace_follow_counts(uid)` and `sewspace_followers_only_counts(uid)`, which return numbers only (follows and others' followers-only rows stay unreadable). Posts/makes counts are what the viewer may see; private items are never counted, not even as "locked". Tabs (`access/profile-tabs.ts`): Posts = the person's visible posts; Makes = visible makes, finished first then in progress; Used = visible patterns/fabrics/threads linked from visible makes, each with those makes. An item hidden from the viewer is left out even if the make is visible (stash/patterns default to private, so the Used tab is often empty).
- Social (Phase 4, migration 0005): likes/comments/saves policies read `sewspace_posts` under its own RLS, so "can see the post" is the post rule. Reply depth is checked by a SECURITY DEFINER trigger (`sewspace_comment_check`), not a policy (a policy reading its own table recurses). Counts come from `sewspace_post_counts(ids)`; the viewer's own likes/saves from plain RLS reads. Follows: WITH CHECK requires the followee to be in `sewspace_public_profiles` (has a handle, not blocked either way). A block deletes follows both ways (trigger `sewspace_block_unfollow`). `sewspace_my_blocks()` lists your blocks (the view hides those people). Explore `sort=popular` = most liked public posts from the last 14 days, offset cursor, capped at 500.
- Admin: `withUser(userId, fn, { isAdmin })` sets `app.is_admin`; `sewspace_is_admin()` needs it and a user id. Admins read/resolve all reports and may read and delete only **reported** posts and comments (policies check `sewspace_reports`). Removing closes every open report on the same target; reports keep a snapshot (`snapshot` jsonb) of what was reported. Profiles can only be dismissed. API: `/api/admin/*` behind `requireAdmin` (403); the web page is `/admin/reports`, nav shown when `GET /profile` says `isAdmin`.
- Catalog (Phase 5, migration 0006, `access/catalog.ts`): `sewspace_catalog` rows are shared reference pages (`kind` pattern|product, `slug` = maker + name, unique per kind; creating a duplicate returns the existing page). `created_by` is never sent. Corrections use column-level UPDATE grants, so kind, slug and creator can't change. Your pattern/fabric/thread may set `catalog_id` (`PUT /api/catalog-links/:kind/:id`; patterns → pattern pages, fabrics/threads → product pages). A page shows a make only if the viewer may see the make **and** the linked item (`makesUsing`), so linking never reveals a private item. Review numbers (`sewspace_catalog_stats`) count every review; review lists hide blocked people (RLS + `notBlockedReview`). A review's make must be the author's own (WITH CHECK) and shows only if visible. Reviews are reportable (`target_kind` 'review'); admins delete only reported reviews. Materials on makes and the Used tab carry `catalog` refs. Public URLs: `/catalog`, `/catalog/:kind/:slug` (API-owned prefix for meta tags; `/patterns` stays the private library).
- Challenges (Phase 6, migration 0007, `access/challenges.ts`): slug = lower-case tag (3–30 letters/digits), at most 92 days, must end in the future. The host is a member automatically. Entering needs membership (the API joins you), an active challenge and your own public post (RLS WITH CHECK too). Host removal sets `removed_at`/`removed_by` (column grants only); removed entries are hidden from everyone but the entrant and host, can't be withdrawn or re-entered. Entries follow their post (`visibleTo`), so making the post private hides the entry. Counts (`sewspace_challenge_counts`) are numbers only. Posts carry `challenges` (live entries) and profiles `challengesEntered`. Challenges are reportable (`target_kind` 'challenge', target id = slug); admins delete only reported challenges. Public URLs `/challenges`, `/challenges/:slug` (API-owned prefix for meta tags). The composer enters a post after creating it (`/new?challenge=slug`).
- Forum (Phase 7, migration 0008, `access/forum.ts`): boards `fitting fabric machines patterns beginners mending meetups`, kinds `show_tell question recommendation info poll`. Topics/replies are public except across a block (RLS + `notBlockedTopic`/`notBlockedReply`). `vote_count`/`reply_count`/`last_activity_at` are kept by SECURITY DEFINER triggers and never granted for update; `pinned`/`locked` only change through `sewspace_forum_moderate()` (admins). Authors may update only title/body/tags/accepted_reply_id (column grants); the accepted answer must be a reply in that question (trigger). No upvoting your own posts (RLS). Locked topics take no replies (RLS). Polls: options added by the author; one vote per person, changeable while open (RLS checks the option belongs and the poll is open); results come only from `sewspace_poll_results()`, which hides counts until you vote, unless you wrote it or it closed (the total is always shown). Recommendation replies may name a catalog page (→ "Most recommended"). Topics can link a catalog page (→ "Discussions" on that page) and the author's make (shown only if visible; also "Discussions" on the make page). Show & tell can be shared to the feed as a public post (photos need that). Hot = (votes + 2·replies + 1) / (age h + 2)^1.5, pinned first; offset cursors. Reports: `topic`, `forum_reply`. URLs `/forum`, `/forum/topics/:id` (API-owned prefix for meta tags).
- Rate limits: 30 posts/hour, 60 comments/hour, 20 reports/day, 20 new catalog pages/day, 3 new challenges/day, 10 forum topics/hour, 60 forum replies/hour. Commenting and reporting need a handle (409).
- Tests: the SQL suite tests RLS alone; `api-server/test/access-layer.test.ts` runs the access module with RLS bypassed (`withoutRls`) so each layer is proven on its own. Keep both when adding rules.

## Where things live
- API routes: `artifacts/api-server/src/routes/` — `public.ts` (no sign-in: profiles, makes, posts, comments, explore), `social.ts` (likes, comments, saves, follows, blocks, reports), `admin.ts` (report review), `catalog.ts` (shared pages, reviews, links; public reads in `catalogPublicRouter`), `challenges.ts` (public reads in `challengesPublicRouter`), `forum.ts` (public reads in `forumPublicRouter`), `posts.ts` (`POST /api/media`, posts CRUD, `GET /api/feed`), `profile.ts`, `studio.ts`, `visibility.ts` (`PUT /api/visibility/:kind/:id`), `storage.ts` (`objectReadRouter` is mounted before `requireAuth` because public avatars must load signed out), `seo.ts` (HTML for `/@handle`, `/makes/:id`, `/posts/:id`, `/sitemap.xml`, `/robots.txt`).
- Viewer: `req.viewer` set by `attachViewer` (`middlewares/auth.ts`); Clerk in production, header stub only via `createApp({ testUserId })` in tests.
- Web: `src/App.tsx` (routes), `src/components/shell/` (signed-in sidebar/header/tab bar, public header), `src/components/auth/` (`RequireSignIn`, `useRequireSignIn` sign-in sheet), `src/pages/*` (public: `public-profile.tsx` (tabs via `?tab=posts|makes|used`), `public-make.tsx`, `explore.tsx`, `post.tsx`; signed in: `feed.tsx`, `compose.tsx`, `saved.tsx`, `admin-reports.tsx`; public `catalog.tsx`, `catalog-entry.tsx`, `challenges.tsx`, `challenge.tsx`, `forum.tsx`, `forum-topic.tsx`), `src/components/catalog/` (parts: Stars, ReviewForm, NewEntryForm; CatalogLink picker on studio cards), `src/components/challenges/` (cards, status, start form), `src/components/forum/` (parts: badges, Upvote, Poll, TopicCard; Composer; Discussions), `src/components/feed/` (PostCard, PostActions, FeedList), `src/components/social/` (Sheet, SafetyMenu = report/block, Comments, BlockedAccounts), `AdaptiveLayout` in `components/shell/Shell.tsx` (app shell when signed in, public header when not), `src/components/visibility.tsx` (picker + badge), design tokens in `src/index.css`.
- Design reference: `docs/design/*.dc.html` (mockups only; never copy their photos into the app).

## Design tokens (`src/index.css` → Tailwind classes)
`bg-yellow` #e6e51e (primary fills), `ink` #000, `red` #f34646 / `red-ink` #c42a2a (small text), `blue` #466cf3 / `blue-ink` #2f55d4 (text), `peach` #ff8562, `canvas` #f2f2f2 (20 px dot grid on body), `line` #e6e6e6 (card hairline), `subtle` #555. Poppins 700 headings (`font-display`, tight tracking), Inter body, `.eyebrow` 11 px uppercase .16em. Pill buttons (`.btn`, `.btn-primary` yellow, `.btn-line` outline), cards `rounded-[30px]`–`[40px]`, inputs `.field` (16 px radius, black border, yellow focus ring). One shadow: `shadow-float`, only on the floating header and nav. Touch targets ≥ 44 px; icon-only buttons need `aria-label`. Don't use hex colours in components.

## SEO and Replit path routing
Replit routes by path prefix. The web artifact serves `/` statically; the API artifact owns `/api`, and also `/@`, `/makes`, `/posts`, `/catalog`, `/challenges`, `/forum`, `/sitemap.xml` and `/robots.txt` (`artifacts/api-server/.replit-artifact/artifact.toml`). For `/@handle`, `/makes/:id`, `/posts/:id`, `/catalog/:kind/:slug`, `/challenges/:slug` and `/forum/topics/:id` Express returns the SPA's `index.html` with title/description/og tags injected (`routes/seo.ts`). In production it reads `artifacts/sewspace/dist/public/index.html` (override with `WEB_INDEX_HTML`; falls back to fetching `/index.html` from the site). In development it fetches Vite's `index.html` and **forwards every other `/@…` path (e.g. `/@vite/client`) back to Vite** — that is why `vite`, `fs`, `id` are reserved handles. Set `PUBLIC_ORIGIN` if canonical URLs should use a custom domain.

## Gotchas
- Route handlers must use the `db` passed by `scoped()` (or `withUser`). Never import `ownerDb`/`pool` in `routes/` — a test enforces this. `ownerDb` bypasses RLS.
- `scoped()` sends the response only after the transaction commits. Don't call OpenAI inside it: read in a short `withUser`, call the model outside (see `/assistant/messages`).
- A Postgres RLS refusal (code 42501) surfaces as 404 via the app error handler.
- **One connection per request transaction:** never `Promise.all` queries on the scoped `db` (pg warns, pg 9 rejects). Await them in turn, or use `sequence([() => q1, () => q2])` from `lib/sequence.ts`. Drizzle builders are lazy, so a list of builders awaited one by one is fine; `.then()` makes them eager.
- Policies on two tables must not read each other (Postgres: "infinite recursion detected in policy"). Use a small SECURITY DEFINER helper instead (see `sewspace_owns_media`, `sewspace_media_on_visible_post` in 0003).
- New public URL prefixes must not be prefixes of app routes (Replit routes by prefix): posts live at `/posts/:id`, not `/p/:id` (which would capture `/patterns`, `/projects`, `/privacy`).
- Page HTML for followers-only content is sent `Cache-Control: private, no-store` and `noindex`; only public pages for signed-out visitors are cacheable.
- When adding a SELECT policy that lets others read a table, re-check every WITH CHECK that used `EXISTS (SELECT … FROM that_table)` to mean "is mine": it now also matches visible rows (migration 0002 had to tighten these).
- In tests, import app code with `await import()` after `./harness`, so `DATABASE_URL` is set first.
- `.field` is unlayered CSS and beats Tailwind padding utilities; inputs with a leading icon use `pl-9`, which has its own `.field.pl-9` rule in `index.css`.
- The SEO router caches `index.html` in production; restart the API after a new web build (Replit deploys do this).
- YAML flow mappings in `openapi.yaml`: quote any description containing a comma, or Orval fails and deletes the generated Zod files.
- `PATCH` bodies for stash/patterns/projects are full objects (spec uses `allOf` of the input schema).
- `@workspace/integrations-openai-ai-server` throws on import without its env vars; tests set placeholders.
- Operations with both path and query parameters get a Zod schema and a TS type with the same name in `lib/api-zod`; re-export the Zod one explicitly in `lib/api-zod/src/index.ts` (see `GetProfilePostsParams`, `GetChallengeEntriesParams`).
- Orval is pinned to emit react-query v5 hooks (`orval.config.ts`).
- The migration runner marks `0000_baseline.sql` as applied on databases created by the old `drizzle-kit push`.
- Emergency rollback for a migration lives in `lib/db/migrations/rollback/` (use with the previous API build).

## Build order
0. Foundations ✅ — file privacy fix, handles + settings, public/signed-in API split, access module + RLS, no demo seeding, sign-in that returns, robots/sitemap/meta.
1. Privacy controls and public read access ✅ — visibility on makes/stash/patterns, follows + blocks tables, `/makes/:id` public page with meta + sitemap, sharing panel.
2. Posts and feeds ✅ — status and multi-photo posts with tags and visibility, sharp image pipeline, Home (Following/Discover) and public Explore feeds, `/posts/:id` with meta + sitemap, composer, mobile tab bar.
3. Profiles with tabs ✅ — header with counts, Posts grid with followers-only notice, Makes (finished + on the table), Used products linking to makes, blocked profiles 404.
4. Likes, comments, follows, save, share, report/block, admin review ✅ — plus Popular on Explore, Saved page, blocked accounts in settings.
5. Shared pattern/product pages and reviews ✅ — catalog browse/search, pages with ratings, fit/sizing, fabrics used, makes and reviews (helpful votes, reports), save to library, link studio items, meta + sitemap.
6. Challenges ✅ — start/join/enter, entries by most liked/newest/following, host removes entries, countdown, rules, post and profile badges, reports, meta + sitemap.
7. Forum ✅ — boards and post types, Hot/New/Unanswered, filters with counts, search, upvotes, one level of replies, accepted answers (Solved), inline polls with hidden results, recommendations, Show & tell to feed, admin pin/lock, Discussions on pattern/product and make pages, reports, meta + sitemap.
8. AI assistant upgrade.
