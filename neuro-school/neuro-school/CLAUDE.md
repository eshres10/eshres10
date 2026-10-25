# Neuro School: notes for Claude Code

A mobile-first web app (PWA): a "school for adults" with bite-sized daily lessons, starting with neuroscience. Lessons are swipeable full-screen cards that combine active recall, spaced repetition, and the Feynman technique. Content should be simple enough for a 12-year-old while the course covers what medical students learn. The audience is curious professionals on their commute.

## Stack
- Next.js (App Router) + React + TypeScript
- `motion` (Framer Motion) for swipe gestures and card transitions
- Plain CSS: design tokens in `app/globals.css`, CSS modules per screen. No Tailwind.
- Progress lives in localStorage (`lib/progress.ts`) until accounts are added (planned: Supabase).
- `/api/explain` grades "Explain it back" answers with Claude when `ANTHROPIC_API_KEY` is set and falls back to keyword matching (`lib/grade.ts`) otherwise.

## Where things live
- `content/types.ts`: content model (course > units > lessons > cards). Card types: review, recall, mystery, story, explain, mission. A lesson can have a `deeper` (med school mode) layer.
- `content/neuroscience.ts`: the course data. **Add lessons here; components should never hard-code lesson text.**
- `components/Illustrations.tsx`: all illustrations as inline SVG, referenced by id from content.
- `components/lesson/`: the lesson player and one component per card type.
- `public/sw.js`, `public/manifest.webmanifest`: offline support and installability.

## Design rules (keep the Imprint-like feel)
- Headings: Plus Jakarta Sans 700. Body: DM Sans.
- Colours: paper #FBFAF7, ink #16161A, indigo #4B3FE0 (learn), coral #FF6B4A (mystery), butter #FFD25A (streak, med school), mint #7FD8B5 (review), lavender #ECEAFF (explain). Pastel backgrounds always pair with the dark text of the same family (see tokens).
- Each card type has its own colour so the learner always knows what kind of moment they're in.
- Flat illustrations from simple shapes. No gradients or drop shadows. Big radii (cards 24–28px, pill buttons).
- Touch targets at least 44px. Question cards block forward swipes until answered.

## Next steps (planned)
- FSRS scheduling with `ts-fsrs` driven by `reviewLog` in `lib/progress.ts`
- Supabase auth and progress sync
- More lessons for the memory unit and the full curriculum map
- Stripe subscriptions
