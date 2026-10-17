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
| Forum (all discussions) and forum thread | `screens/forum.html` | `pages/forum.tsx`, `pages/forum-topic.tsx` |
| Hashtag page | `screens/hashtag.html` | `pages/tag.tsx` |

Only the landing page has been rebuilt to match so far.
