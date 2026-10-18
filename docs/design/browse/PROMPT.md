# Seams Club: "Browse by" on Explore

**For Replit Agent.** Upload this folder to the project at `docs/design/browse/` first, then paste everything below the line into Agent.

---

On the Explore/Discover page, **replace the "{n} ideas" count with a "Browse by" button** that opens a large browse modal. Match the design files in `docs/design/browse/`:

- `images/`: these are the spec.
  - Desktop at 1440 px:
    - `d1`: the modal
    - `d2`: lower sections
    - `d3`: searching "linen"
    - `d4`: a filter applied
    - `d5`: the button in the row
  - Mobile at 390 px:
    - `m1`: the browse sheet
    - `m2`: lower sections
    - `m3`: the Browse chip
    - `m4`: a filter applied
- `interactive/`: open these HTML files in a browser and click around. They work offline once the images in `interactive/img` load.
- `source/*.dc.html`: the mockup source. `renderVals()` has the exact labels, sections and behaviour.

All of these are reference only. Rebuild with the app's own components and don't copy the mockup markup. Photos, counts and names are placeholders.

## Ground rules

- **Project notes:** read `CLAUDE.md` / `replit.md` first and follow their conventions (`scoped()` / `withUser`, OpenAPI-first codegen, Tailwind tokens).
- **Keep everything working.** Don't remove or rename existing routes, tables or components.
- **Database:** additive migrations only. Never weaken RLS. Nothing against production.
- **Privacy:**
  - Counts and suggestions use **public** content only.
  - Private and followers-only posts are never counted or surfaced to people who can't see them.
  - "Picked for you" is computed on the server for the signed-in viewer only and never cached publicly.
- **Ask first** before adding packages, paid services or auth changes.
- Stop for review after each step.

## The button

- **Desktop:** at the right end of the sub-filter row, an outlined pill with a grid icon and the label **Browse by**.
- **Mobile:** the first chip in the sub-filter row, labelled **Browse**.
- **Keep the result count for screen readers:** a visually hidden `role="status"` element announcing it.
- **Applied filter:** choosing something in the modal adds a blue chip, e.g. "#stashbusting ✕", next to the sub-filters. ✕ clears it. The filter is kept in the URL query.

## The modal

- **Shell:**
  - Desktop: a centred card about 1080 × 800 px, with rounded corners and a dimmed backdrop.
  - Mobile: a full-screen sheet.
  - Header: "Browse by", a search field ("Search categories, hashtags, sewists") that filters every section as you type, and a close button.
- **Sections** (hide any section with no matches while searching; if nothing matches, show "Nothing matches…"):
  1. **Clothing & makes:** photo tiles, 6 per row on desktop and 3 on mobile, each with a white label: Dresses, Shirts & blouses, Tops, Pants & trousers, Skirts, Outerwear, Knitwear, Bags, Quilts & home, Kids, Upcycled, Formal.
     - Use real categories and tags, and tell me where you had to add any.
     - Each tile's cover is the most-saved public post in that category this week.
     - A tile that matches an existing sub-filter (Dresses, Tops, Outerwear, Bags, Upcycle) selects that sub-filter. The others apply a category filter chip.
  2. **Trending hashtags:** chips showing the tag and its post count, ranked by public use in the last 7 days.
  3. **Picked for you:** signed-in only. Hashtags based on what the viewer saves and follows, with the line "Because you save {top garments}".
  4. **Ways to browse:** coloured brand cards:
     - Popular this week (most saved in 7 days)
     - Beginner-friendly
     - Quick makes (under 3 hours)
     - Zero waste
     - Pattern hacks
     - Free patterns
     - Each one applies its matching filter. Use existing tags or fields where they exist and propose the rest.
  5. **By fabric:** thumbnail chips for Linen, Denim, Cotton, Knit, Satin and Wool.
  6. **Popular sewists to follow:**
     - Each row shows an avatar, name, @handle and specialty, plus a Follow / Following toggle using the existing follow system.
     - Exclude people the viewer already follows, people they've blocked, and private accounts.
     - Signed out, Follow opens the sign-in prompt.
- **Choosing anything** closes the modal, applies the filter, scrolls the feed to the top and switches to the Explore tab if needed.

## Data

- **Endpoint:** `GET /api/discover/browse` returns every section in one call. The public parts are cacheable. "Picked for you" comes from a separate signed-in call or is added on the server per request.
- **Discover feed:** `GET /api/discover` accepts `tag`, `category`, `fabric` and `collection` filters alongside `tab` and `sub`.
- **Rate limit:** follows from this modal use the existing limits.

## Accessibility

- The modal is a `role="dialog"` with `aria-modal`, labelled by its title.
- Focus moves to the search field on open, stays inside the modal while it's open, and Escape closes it.
- Each tile is a button labelled with its category.
- Follow buttons use `aria-pressed`.
- Touch targets are at least 44 px.

## Order of work

1. Check existing tags, categories and follows, and propose any data changes. **Wait for my OK.**
2. The button, the modal and its sections, using real data.
3. Applying filters: chip, URL and feed query.
4. Tests (no private content in counts or suggestions, "Picked for you" visible only to its owner) and a pass at 390 px and 1440 px.
