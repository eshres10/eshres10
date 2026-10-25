# Neuro School

Learn neuroscience in six minutes a day: swipeable lesson cards, mystery questions, a "med school mode" depth layer, and an explain-it-back tutor.

## Run it

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. It's designed for a phone, so open it on your phone (same Wi-Fi, use your computer's IP address) or use your browser's mobile view.

## Optional: AI tutor feedback

Create a file called `.env.local` with:

```
ANTHROPIC_API_KEY=your-key-here
```

Without a key, the explain-it-back card uses simple keyword checks instead.

## Keep building with Claude Code

Open this folder in Claude Code. `CLAUDE.md` explains the structure and design rules, so you can ask for things like "add Day 15 about Patient H.M." or "add FSRS scheduling to the review cards".

## Deploy

Push to GitHub and import the repo on Vercel. Add `ANTHROPIC_API_KEY` in the project's environment variables if you want AI feedback.
