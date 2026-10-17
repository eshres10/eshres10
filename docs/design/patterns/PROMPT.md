# Seams Club: Pattern directory and pattern page

**For Replit Agent.** First upload this folder to the project at `docs/design/patterns/`. Then paste everything below the line into Agent.

---

Build the **Pattern directory** (`/patterns`) and the **pattern page** (`/patterns/:slug`) for Seams Club, on both desktop and mobile. Match the design files in `docs/design/patterns/`.

## Ground rules (read first)

- **Project notes:** read `CLAUDE.md` and `replit.md` first. Follow the conventions in them:
  - data access goes through `scoped()`/`withUser`
  - OpenAPI-first codegen
  - Tailwind design tokens
- **Keep everything working.** Every existing feature must keep working. Don't rename or remove existing routes, tables, columns or components.
- **Database changes:**
  - Migrations are **additive only**: new tables or columns, never drops or type changes.
  - **Never weaken or disable row-level security** to make something work. If a query fails because of RLS, fix the query, not the policy.
  - Don't run anything against the production database.
- **Privacy:**
  - Private and followers-only content is never visible to signed-out visitors, and is never counted in public numbers.
  - Stash, measurements and pattern PDFs are always private to their owner.
- **Ask before adding:**
  - any new package, paid service or payment provider
  - any change to auth
- **Stop for review:** do the work in the steps at the end, and stop after each one so I can check it.

## Design reference

- `images/`: these are the spec.
  - Desktop at 1440 px: `d1`–`d7` (directory, filtered, no results, pattern page, size chart in inches, checkout, after buying).
  - Mobile at 390 px: `m1`–`m7` (directory, filter sheet, pattern page top, how it sews, size chart, makes and reviews, checkout).
- `screens/`: static HTML snapshots you can open in a browser.
- `source/*.dc.html`: interactive mockups. Their `renderVals()` has the exact labels, filters and sample data. They are for reference only. Rebuild with the app's own components, and don't copy their markup or the sample photos.
- **Brand:**
  - Colours: yellow `#e6e51e`, red `#f34646`, blue `#466cf3`, peach `#ff8562`, black, white, page grey `#f2f2f2`.
  - Fonts: Poppins for headings, Inter for text.
  - Large rounded white cards (24–32 px radius) and pill buttons.

## Check what exists first

Before writing code, look at what the app already has and tell me:
- any public pattern catalogue, shared pattern pages, or pattern references on posts and makes
- reviews and ratings
- pattern sales (from the indie pattern sales work)
- the unit preference
- saved measurements

Then build on what's there. Where something this design needs is missing, propose the smallest additive change and wait for my OK before migrating.

## 1. Pattern directory (`/patterns`)

Public: anyone can browse it signed out. The signed-in header shows the user's avatar; signed out, it shows Log in / Join free.

- **Header:**
  - a "Pattern directory" eyebrow, the **Patterns** heading, and the line "Every pattern the club has sewn, with real makes, fit notes and reviews."
  - a search box that matches pattern name, designer and garment type
- **Category pills:** All, Dresses, Tops, Skirts, Trousers, Outerwear, Knits, Bags. Use the real categories.
- **Filters:**
  - Desktop: a left-hand panel.
  - Mobile: a "Filters" button with a count, which opens a bottom sheet that also holds Sort and ends with a "Show n patterns" button.
  - **Difficulty:** Beginner, Intermediate, Advanced, each with a live count.
  - **Where to get it:** On Seams Club, Free, Designer's site, each with a live count.
  - **Rated 4.5 and up:** a switch.
  - **Clear all.**
- **Sort:** Most made (the default), Top rated, New.
- **Results:**
  - Show the result count.
  - Desktop is a 4-column grid; mobile is 2 columns.
  - Each card shows the cover photo, name, designer, ★ rating, makes count, a difficulty tag, a "New" tag where it applies, and a save heart.
  - The price pill shows where to get it: yellow "$16" if sold on Seams Club, blue "Free", or an outlined "$22" for the designer's site.
- **No results:** "No patterns match those filters", with a "Clear filters" button.
- **URL:** keep the filters, search and sort in the URL query so results can be shared and the back button works. Load more as the user scrolls (or with a "Load more" button), 24 patterns at a time.
- **Save heart:** needs sign-in. Signed out, it opens the existing sign-in prompt. Saved patterns are private.

## 2. Pattern page (`/patterns/:slug`)

Public, with private extras for the signed-in viewer.

- **Top section:**
  - Photo gallery: thumbnails plus a main photo on desktop, swipe with dots on mobile. Covers come from **public** makes only.
  - An eyebrow showing where to get it, the name, and the designer with a Follow button.
  - The description and tags: category, difficulty, size range, fabric type, yardage.
  - 3 stats: ★ rating with the review count, public makes, and the share who say "true to size".
- **Get it:**
  - **Sold on Seams Club:** the price, a save heart and **Buy pattern**. Buying opens the existing checkout from pattern sales. After paying, the button becomes **In your library** (Download PDF). Below it, show "{Designer} keeps 90%. The PDF goes to your private library."
  - **Free:** "Download from the designer" (opens their site in a new tab).
  - **Designer's site:** "Get it from {designer}" with the price.
  - If pattern sales aren't built yet, every pattern uses the designer link. Don't add a payment provider.
  - **I've made this:** starts the existing "new make" flow with this pattern filled in.
- **How it sews:**
  - Fit, difficulty and instruction scores as bars.
  - Sizing split: runs small / true to size / runs large.
- **Common alterations:** the top 4, as percentages of makes.
- **Fabrics people used:** chips with counts.
- **In your stash:** signed-in only, with a lock icon and "only you see this". Lists the viewer's own fabrics that are long and wide enough for this pattern. It's worked out on the server for that viewer only and never cached publicly.
- **Size chart:**
  - Bust, waist and hip for every size, with a **cm / in** switch. Inches are rounded to the nearest ¼ and shown as fractions (e.g. 30¾).
  - The switch starts on the viewer's saved unit preference.
  - Signed in with saved measurements: highlight the closest size, with the note "Size 14 is closest to your saved measurements. Only you see this."
  - Work out the closest size on the server and send back **only the size label**. The measurements themselves never leave the server.
  - Mobile: the chart scrolls sideways.
- **What's in the PDF:** list the included files. Only show this for patterns sold on Seams Club.
- **Makes:**
  - The count, plus "Most liked / Newest / Near my size" switches.
  - Near my size needs sign-in and uses the same closest-size logic.
  - Desktop shows 6; mobile is a sideways scrolling row with "See all".
  - Each card shows the handle, size and fabric. Only public makes, with followers-only ones added when the viewer follows the maker.
- **Reviews:**
  - A summary: overall rating and a 5-to-1 star breakdown.
  - Review cards with the reviewer, the size they made, fit / difficulty / instructions scores, the text, "See the make", and a "found this helpful" button (one vote per user).
  - "Write a review" uses the existing review form if there is one. Otherwise ask me before adding one.
- **Mobile:** a sticky bottom bar with the price and Buy (or the right "get it" button). It shows "Download PDF" once owned.

## Data and access

- **Public numbers:** all public counts, ratings, alteration percentages and fabric counts are worked out from **public** data only. Use a view or query that filters by visibility. Never use a cached number that includes private or followers-only content.
- **Endpoints:** add these to `openapi.yaml` and run codegen.
  - `GET /api/patterns`: filters, search, sort and paging. Public.
  - `GET /api/patterns/:slug`: public details.
  - `GET /api/patterns/:slug/me`: signed-in only. Returns stash matches, closest size, owned, saved and made, for the caller only.
  - `GET /api/patterns/:slug/makes`
  - `POST`/`DELETE /api/patterns/:slug/save`
  - `POST /api/reviews/:id/helpful`
- **Rate limits:** 120 per hour per user on the write endpoints.
- **Tests:**
  - signed-out requests never return private or followers-only makes, or counts that include them
  - `/me` returns only the caller's data
  - measurements are never in any response
  - the "helpful" vote is one per user

## Accessibility

- Filters are real checkboxes and switches. Sort and units are radio groups. The result count is announced (`role="status"`).
- The size chart has table semantics: column headers for sizes, row headers for measurements.
- The gallery thumbnails have labels. Every button is at least 44 px tall on mobile.
- The filter sheet and checkout keep focus inside them while open and close with Escape.

## Order of work

Stop after each step for review:

1. Check what exists and propose any additive data changes. **Wait for my OK.**
2. The `/patterns` directory, desktop and mobile, with filters, sort, search and paging.
3. The pattern page's public sections: gallery, stats, how it sews, alterations, fabrics, size chart, makes and reviews.
4. The private extras and actions: the `/me` endpoint, stash match, closest size, save, "I've made this", the Buy and owned states, and helpful votes.
5. Tests, a pass at 390 px and 1440 px against `images/`, and notes added to `replit.md` / `CLAUDE.md`.
