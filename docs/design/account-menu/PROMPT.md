# Phase M — Account menu (desktop and mobile)

Read `CLAUDE.md` first. Everything there still applies:
- the access rules
- additive-only migrations
- `scoped()`/`withUser`
- OpenAPI-first codegen
- design tokens
- "ask the owner before adding a dependency or paid service"

The product is called **Seams Club**. Name anything new the same way as the existing code, and don't rename anything that already exists.

## Goal

Add a compact account menu, similar to Reddit's, that opens from the signed-in user's avatar at the top right. It must fit in a single screen with no scrolling:
- at 1440×900 on desktop
- at 390×844 on mobile

It's for signed-in users only. Signed-out visitors keep the existing "Log in / Join free" buttons.

Every existing feature must keep working. The sidebar's "Profile & settings" link and the mobile Profile tab stay as they are.

## Design reference

The files are in `docs/design/account-menu/`:

- `images/*.png`: screenshots at 2× scale. These are the spec.
  - `d1`–`d3`: desktop (open, closed, log-out confirm).
  - `m1`–`m3`: mobile (open, closed, log-out confirm).
- `screens/*.html`: static snapshots you can open in a browser.
- `source/AccountMenuDesk.dc.html` and `source/MAccountMenu.dc.html`: the interactive mockups.
  - Their `renderVals()` has the exact labels and icons.
  - They are for reference only. Don't copy their markup or photos (same rule as `docs/design/*.dc.html`). Build with the app's components, Tailwind tokens and generated hooks.
  - The page behind the menu in the mockups is filler. Only the menu and its trigger are in scope.

## Trigger

- **Desktop (768 px and up):** add an avatar button at the right end of the top bar, after "New post".
  - It shows the user's avatar (36 px) and a small chevron.
  - It turns yellow while the menu is open.
- **Mobile (below 768 px):** add the avatar (34 px) at the right of the top bar, after notifications.
- **Accessible name:** "Account menu", with `aria-expanded` and `aria-controls`.

## Layout

- **Desktop:** a popover 320 px wide, anchored under the avatar and aligned to its right edge.
  - White, 24 px corner radius, 12 px padding, with a soft shadow and a hairline outline.
  - No backdrop; the page stays usable.
- **Mobile:** a drawer that slides in from the right.
  - 328 px wide, full height, 28 px radius on the left corners only.
  - A 45% black backdrop behind it.
  - A round close button (✕) at the top right.
  - Respect `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- **Rows:** at least 44 px tall, with an 19 px icon, a 14 px semibold label and 12 px rounded hover/focus states. Hairline dividers separate the groups.

## Contents, top to bottom

1. **Header:**
   - avatar (46 px), display name
   - a "View profile · @handle" link to the user's own profile
   - on mobile only, the close button
2. **Your account:**

   | Row | Goes to | Badge |
   |---|---|---|
   | My studio | Studio overview | none |
   | Saved posts | Saved posts | count of saved posts, grey pill. Hide the badge at 0. |
   | My challenges | the user's challenges | "n active", yellow pill. Hide the badge at 0. |
   | Pattern sales | designer sales page | earnings in the last 24 hours, e.g. "+$13.78", black pill |

   - Pattern sales: show the row **only** if pattern selling exists and the user is a seller. Hide the badge at $0.
   - Saved posts and My challenges: if either feature doesn't exist yet, leave that row out. Don't build the feature here.
3. **Quick settings:**
   - **Measure in: cm / in.** A two-option segmented control bound to the **existing** unit preference. Changing it saves right away through the existing settings endpoint, with optimistic UI that rolls back if the save fails. Don't add a new preference.
   - **Posts visible to: {current default}.** Reads the existing default post visibility setting and links to the privacy section of Settings. It's display-only here.
4. **More:**
   - **Support Seams Club:** yellow row with "$5/mo" on the right. Links to the membership page. Show it only once the membership feature exists. If the user is already a supporter, show "Supporter ♥" instead of the price, linking to manage membership.
   - **Settings & privacy:** Settings.
   - **Help & feedback:** the existing help or feedback link. If there isn't one, leave the row out.
   - **Log out:** opens a confirmation inside the menu. The row expands into a grey box reading "Log out of Seams Club?" with **Cancel** and **Log out**. Confirming uses the existing sign-out, then goes to the landing page.
5. **Footer:** "Terms · Privacy · Community guidelines" (existing pages), then "© {year} Seams Club", all in 11 px grey.

## Data and access

- **One endpoint:** add `GET /api/me/menu-summary` to `openapi.yaml`, then run codegen. It returns:
  - `savedCount`
  - `activeChallengeCount`
  - `salesLast24h` (or null when the user isn't a seller)
  - `isSupporter`

  It only reads the **caller's own** data through `scoped()`/`withUser`, never anyone else's. Cache it per request and refetch when the menu opens. Rate limit: 120 per hour per user.
- **No new tables, columns or settings.** If something you need doesn't exist yet, leave the row out and list it in your summary.

## Behaviour and accessibility

- **Desktop:** treat the popover as a non-modal dialog (`role="dialog"`, labelled "Account menu"). It contains links and controls, so don't use `role="menu"`.
  - It closes on Escape, a click outside, or choosing a link.
  - Focus moves to the first link when it opens, and returns to the avatar when it closes.
- **Mobile:** a modal dialog (`aria-modal="true"`) with focus kept inside.
  - It closes with the ✕, a backdrop tap or Escape.
  - Lock page scrolling while it's open.
- **Motion:** a 150 ms fade and scale on desktop, and a 200 ms slide on mobile. Turn both off under `prefers-reduced-motion`.
- **Grouping:** the unit switch is a `radiogroup` labelled "Measure in". Each group of links is a `nav` with its own label.
- **Text size:** everything must still fit on one screen at 100% zoom. At 200% zoom the panel may scroll.

## Order of work

Do one commit per step, then stop for review:

1. The trigger and the empty panel shell (desktop popover and mobile drawer), with open/close behaviour and focus handling.
2. The rows, quick settings and the log-out confirm, with the existing settings and sign-out wired in.
3. `menu-summary` with its badges, plus tests:
   - another user's counts never leak
   - Pattern sales and Support only appear when their features exist

For each step:
- Run the typecheck and the tests.
- Check 390×844 and 1440×900 against `images/`, and confirm nothing scrolls.
- Update `CLAUDE.md`: add the endpoint to "Where things live", and Phase M to "Build order".

Don't add dependencies or paid services without asking.
