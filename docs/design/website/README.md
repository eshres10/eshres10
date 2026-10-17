# Public website (signed out)

The owner's "Seams Club · Website + App" design: the screens a signed-out visitor sees.

The screen files embed mockup photos, so they live in `screens/`, which is git-ignored. Keep them locally and never copy their photos into the app.

| Screen | Local file | App |
|---|---|---|
| Landing (signed out) | `screens/landing.html` | `src/pages/landing.tsx` at `/`. Garment line drawings (`MAKE_ART`) stand in for the photos. "Fresh from the community" shows live public photo posts and "Something to sew this month" shows live challenges; both are hidden when empty. |
| Explore (signed out) | `screens/explore.html` | `pages/explore.tsx` |
| Public profile | `screens/profile.html` | `pages/public-profile.tsx` |
| Shared pattern page | `screens/pattern.html` | `pages/catalog-entry.tsx` |
| Challenge page | `screens/challenge.html` | `pages/challenge.tsx` |
| Forum (all discussions) | `screens/forum.html` | `pages/forum.tsx` |
| Forum thread | `screens/forum-thread.html` | `pages/forum-topic.tsx` |
| Hashtag page | `screens/hashtag.html` | `pages/tag.tsx` |

All eight are rebuilt to match. The design's phone renders are the desktop pages squeezed, so the profile keeps its compact phone card, and the other pages stack their desktop parts.

Left out because nothing behind them exists yet (the owner's call):
- Explore: category chips (Dresses, Tops…) and "Sewists to follow". The kind chips (All, Photos, Makes, Words) stay.
- Profile: "Sewing since" and experience. Experience is private.
- Pattern page: Common alterations, the assistant card, and the Near my size sort.
- Challenge: nothing.
- Forum: "people online", Top this month, Latest activity sort, and numbered pages. Load more stays.
- Thread: views, Save, and helper titles ("Tailor · 48 accepted answers").
- Hashtag: Follow hashtag, Shop, Top/Recent, and makes or forum-topic counts.
- Header: the search field in the header and the "Shop" link. The search icon stays.
