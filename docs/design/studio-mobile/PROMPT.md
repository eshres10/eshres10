# Phase S — My studio on mobile

Read `CLAUDE.md` first. Everything there still applies:
- the access rules
- additive-only migrations
- `scoped()`/`withUser`
- OpenAPI-first codegen
- design tokens
- "ask the owner before adding a dependency or paid service"

The product is called **Seams Club**. Name anything new the same way as the existing code, and don't rename anything that already exists.

If Phase F (the step-by-step form flows) isn't merged yet, build this on top of it. The + buttons here open the Phase F flows.

## Goal

Redesign the signed-in **My studio** section for phones (below 768 px), so it matches the new mobile screens. There are five screens:

1. **Overview** at `/studio`
2. **Fabric stash** at `/stash/fabrics`
3. **Thread drawer** at `/stash/threads`
4. **Pattern library** at `/patterns`
5. **Measurements** at `/measurements`

Keep the desktop layouts as they are. Every existing feature must keep working: search, edit, delete, download, visibility, catalog links and PDF import all stay reachable on mobile.

## Design reference

The files are in `docs/design/studio-mobile/`:

- `images/*.png`: screenshots at 390 px wide, 2× scale, including the interactive states (add idea sheet, filters, list view, inches). These are the spec.
- `screens/*.html`: static snapshots you can open in a browser.
- `source/M*.dc.html`: the interactive mockups. Their `renderVals()` has the exact labels, filters and state. They are for reference only. Don't copy their markup or photos (same rule as `docs/design/*.dc.html`). Build with the app's components, Tailwind tokens and generated hooks.

## Shared mobile studio layout

- **Full-width top bar:**
  - Pinned to the top, white, 64 px tall, with a 1 px `line` border underneath and no rounded corners or shadow.
  - On the left, a small "MY STUDIO" eyebrow above the page title (Poppins 700).
  - On the right, a search button and, on list pages, a yellow round **+** button.
  - On Fabric, Thread and Patterns, + opens the Add to stash flow for that kind. On Measurements, it opens a new measurement set.
- **Section pills:** a horizontal scrolling row under the top bar with Overview, Fabric, Thread, Patterns and Measurements. The current page is black; the others are white. These are links, with `aria-current="page"` on the current one.
- **Full-width bottom tab bar:**
  - Pinned to the bottom, white, with a 1 px line above it.
  - Add bottom padding with `env(safe-area-inset-bottom)` so it clears the phone's swipe bar.
  - Tabs: Home, Explore, New post (yellow), My studio (selected: black tile), Profile.
  - Use this full-width style only for the studio section in this phase. Elsewhere, keep the floating bar for now. **Ask the owner** before changing other screens.
- The content scrolls between the two bars and isn't hidden behind them.

## 1. Overview (`overview-*.png`)

From top to bottom:

1. **My ideas** (new feature)
   - **Header:** a count, and the line "Things you want to make, from patterns and fabric you already have."
   - **Row:** a horizontal row of cards. The first card is always a dashed **Add idea** card. After it come the idea cards, newest first.
   - **Each idea card shows:**
     - the pattern image and fabric image side by side
     - the pattern name, and "in {fabric name}" underneath
     - the optional note, in italics
     - a yellow **Start project** button
   - **Start project** opens Create project (Phase F2) with the pattern and fabric already chosen. After the project is created, ask "Remove this idea?" with the options Keep or Remove.
   - **Add idea** opens a bottom sheet with:
     - a pattern picker: the person's own patterns, as scrollable tiles
     - a fabric picker: the person's own fabrics, as scrollable tiles
     - a Note field (optional, at most 80 characters)
     - a **Save idea** button
     If the person saves without a pattern or a fabric, show the inline error "Pick a pattern and a fabric." The sheet follows the F0 sheet rules: ask before discarding, Escape closes it, and focus stays inside the sheet.
   - Long-pressing a card, or a … menu on it, offers Edit and Delete (Delete asks for confirmation).
   - **This list is only what the person adds.** No AI or automatic suggestions.
2. **On your table:** the person's in-progress projects as horizontal cards. Each card shows the cover photo, the name, the pattern and fabric, a progress bar from steps ("6 of 10 steps"), and links to the project. There's a "New project" link on the right.
3. **Add to your studio:** three tiles, Fabric (yellow), Thread (blue) and Pattern (peach). Each opens Add to stash for that kind.

Remove from the mobile overview: the greeting and date, the count cards, AI pairing suggestions, the "running low" list and the "Tune your space" modal. Settings already covers what that modal did.

**Ideas: data and access** (additive migration):
- Add a new **ideas** table with these columns: `id`, `user_id`, `pattern_id`, `fabric_id`, `note`, `created_at`, `updated_at`.
  - `pattern_id` references patterns; `fabric_id` references fabrics.
  - When the pattern or fabric is deleted, delete the idea too (`on delete cascade`).
- Ideas are **private to their owner, always**. There's no visibility setting and no public API. Use RLS `owner_all`.
- `WITH CHECK`: the pattern and fabric must belong to the same user.
- Add these endpoints to `openapi.yaml`, then run codegen:
  - `GET /api/ideas` (returns pattern and fabric name and image)
  - `POST /api/ideas`
  - `PATCH /api/ideas/:id`
  - `DELETE /api/ideas/:id`
- Rate limit: 60 per hour.
- Add RLS tests and access-layer tests: another user can't read, write or point an idea at someone else's pattern or fabric.

## 2. Fabric stash (`fabric-*.png`)

- **Summary line:** "{n} fabrics · {total} in total", with an **m / yd** toggle that converts the amounts shown. It defaults to the profile's unit setting.
- **Type filter chips:** All, Linen, Cotton, Silk, Knit, Denim. Use the person's real types, plus "All".
- **Grid:**
  - A 2-column grid of photo cards.
  - Each card shows the name and "{type} · {amount}".
  - Top left: a privacy badge (lock icon "Only me", people icon "Followers", or globe icon "Public").
  - Top right: an "In your shop" badge, only once the marketplace exists. Hide it until then.
  - Tapping a card opens that fabric in the Add to stash flow in edit mode.
- **Empty filter:** shows "No {type} fabric yet."

## 3. Thread drawer (`thread-*.png`)

- **Summary line:** "{n} threads · {total} spools and cones", with a **colour wall / list** view toggle.
- **Type filter chips:** All, All-purpose, Topstitch, Serger, Embroidery.
- **Colour wall:**
  - A 4-column grid of spool circles in the thread colour, with a cream rim and the colour name underneath.
  - A thread with 1 spool or less gets a small red dot, and an aria-label that ends "running low".
  - Under the grid: a legend line for the red dot.
- **List view:** rows with a swatch, the name, the type and a quantity badge (red when 1 or less). Serger threads count "cones"; everything else counts "spools".

## 4. Pattern library (`patterns-*.png`)

- **Import banner:** a black "Import a pattern PDF" banner at the top that opens Add to stash for patterns, starting from the PDF option.
- **Status filter chips with counts:** All, Want to make, Bought, Making, Made it.
  - "Making" is a filter only, and doesn't need a new stored status: a pattern counts as Making while it's linked to an in-progress project.
  - Keep the existing status values. Show their labels as in the mockup ("Made it" = made, "Bought" = purchased).
- **Grid:**
  - A 2-column grid of cover cards.
  - Top left: a status badge.
  - Top right: a lock "PDF" badge, when a PDF is attached.
  - Under the cover: the name, and "{designer} · {difficulty}".
- **Footer note:** "Pattern PDFs always stay private, even if you share the pattern."

## 5. Measurements (`measurements-*.png`)

- **Privacy banner:** a black banner reading "Only you can see these. They never appear on shared makes."
- **Measurement set pills:**
  - Each pill shows the name and the date it was recorded.
  - A dashed "+ New set" pill opens the measurement form.
- **Comparison line:** "Compared with {previous set}", with a **cm / in** toggle. The toggle only changes how numbers are shown, rounded to ¼ inch. Values are stored the same way as now.
- **Grouped cards:**
  - **Upper body:** Bust, Underbust, Shoulder width, Neck, Upper arm.
  - **Waist & hips:** Waist, High hip, Full hip, Rise.
  - **Lengths:** Height, Back length, Front length, Arm length, Inseam, Wrist.
  - Each row shows the value on the right. Next to it, the change since the previous set: blue for smaller, red for larger, hidden when there's no change.
  - Map these to the existing measurement keys. Add no new keys without asking.
- **Update measurements:** a yellow button at the bottom.

## Order of work

Do one commit per step, then stop for review:

1. Shared mobile studio layout.
2. Overview, including the ideas table, API and tests.
3. Fabric stash and thread drawer.
4. Pattern library and measurements.

For each step:
- Run the typecheck and the tests.
- Check the screen at 390 px and 1440 px: mobile matches the screenshots, and desktop is unchanged.
- Update `CLAUDE.md`: add ideas to the access table, update "Where things live", and add Phase S to "Build order".

Don't add dependencies or paid services without asking.
