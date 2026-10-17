# Phase O — Sign-up and onboarding with Pip

Read `CLAUDE.md` first. Everything there still applies:
- the access rules
- additive-only migrations
- `scoped()`/`withUser`
- OpenAPI-first codegen
- design tokens
- "ask the owner before adding a dependency or paid service"

The product is called **Seams Club**. Name anything new the same way as the existing code, and don't rename anything that already exists.

## Goal

When someone joins, they first create their account. Then a mascot called **Pip** asks 7 quick questions, one per screen, and sets up their studio from the answers. The style is inspired by period-tracker onboarding (friendly, one question at a time, a personal result at the end), but keep it light. Don't add any of these:
- a paywall
- fake "analysing" waits
- runs of fact screens

It's a web app, so build both layouts:
- **Mobile layout**, below 768 px
- **Desktop layout**, at 768 px and above

Every existing feature must keep working, including sign-in, sign-up and the current settings.

## Design reference

The files are in `docs/design/onboarding/`:

- `images/*.png`: screenshots at 2× scale. These are the spec.
  - `m01`–`m11`: the mobile steps, plus states such as email sent, email error and empty name.
  - `d01`, `d04`, `d06`, `d11`: desktop.
- `screens/*.html`: static snapshots you can open in a browser.
- `source/MOnboard00.dc.html` (mobile) and `source/OnboardDesk00.dc.html` (desktop): the full interactive flow.
  - Their `renderVals()` has the exact copy: every question, option, Pip line and the recommendation rules.
  - They are for reference only. Don't copy their markup or photos (same rule as `docs/design/*.dc.html`). Build with the app's components, Tailwind tokens and generated hooks.
- `assets/pip/`:
  - `pip-*.svg`: one SVG for each of Pip's 9 poses.
  - `poses.json`: the part-by-part values behind each pose.

## The flow

| # | Screen | Notes |
|---|---|---|
| 1 | **Join** (`/join`) | Shown to signed-out visitors. The "Join free" buttons across the site go here. |
| 2 | **Meet Pip** (`/welcome`) | "Welcome! I'm Pip." Two choices: **Let's go**, or **Skip for now** (goes to Home). |
| 3–9 | **Questions 1–7** (`/welcome/1` … `/welcome/7`) | See the table below. |
| 10 | **Setting up** | About 2.5 seconds. 3 checklist rows tick in turn, with a "Skip ahead" link. |
| 11 | **Ready** (`/welcome/ready`) | Personalised from the answers. Ends with **Go to my studio**, or "or browse the feed". |

### 1. Join

- "Join Seams Club", with the line "Free for everyone. No ads, and your stash stays private."
- Below that are the sign-in buttons. **Use only the sign-in methods the app already has.** The mockup shows Google, Apple and email link. Show a button only if that method already exists. **Ask the owner** before adding a new provider.
- If the app has email sign-in: "Continue with email" swaps the buttons for an email field.
  - The field needs a clear inline error: "Enter an email like name@example.com."
  - After sending, show the confirmation: "Check your inbox. We sent a link to {email}. Open it to carry on."
  - The dashed "Mockup only: pretend I opened the link" button is **not** part of the product.
- Also include "Already a member? Log in", and the Terms and Privacy links.
- Desktop: Pip and "A home for your sewing." on the left, with the sign-up card on the right.
- After the account is created, send new users to `/welcome`. Existing users signing in go wherever they go now.

### Questions

Each question screen has:
- a progress bar of 7 segments, with "Question n of 7" as its accessible label
- a back button
- Pip with a speech bubble
- the question as the `h1`
- optional helper text
- the options
- a Continue button at the bottom (Finish on the last question)

Continue stays disabled until the question is answered. Skip only appears on optional questions.

| Q | Question | Type | Saves to | Skip |
|---|---|---|---|---|
| 1 | First, what should I call you? | Text, required | the existing display name field | No |
| 2 | What brings you to Seams Club? | Multi: stash, next project, learn, share, challenges, sell | `onboarding.goals` | Yes |
| 3 | How long have you been sewing? | Single, auto-advances | `onboarding.experience`, and the existing profile experience field (see mapping) | Yes |
| 4 | What do you love to make? | Multi, photo tiles: Dresses, Tops, Skirts, Trousers, Outerwear, Knits, Bags, Costume, Mending | the existing "Favourite things to make" field | Yes |
| 5 | What do you sew with? | Multi: sewing machine, overlocker or serger, coverstitch, embroidery machine, needle and thread | `onboarding.tools` | Yes |
| 6 | How big is your fabric stash? | Single, auto-advances: just getting started, a tidy drawer, a whole cupboard, "We don't talk about it" | `onboarding.stash_size` | Yes |
| 7 | Who should see your posts? | Single: Everyone, My followers, Only me | the existing default post visibility setting | No |

**Experience mapping** to the existing profile field:
- "Just starting out" → Beginner
- "A year or two" → Intermediate
- "Five years or more" → Advanced
- "I teach or sew for a living" → Advanced

Store the exact answer in `onboarding.experience`.

**Q7 helper text:** "Your stash, patterns and measurements are always private. This is only for things you post." Show a lock note under the options: "You can change this on any post, any time."

**Auto-advance:** on Q3 and Q6, picking an option with a pointer moves on after about 350 ms. Picking with the keyboard (arrow keys or Space) does **not** auto-advance; the user presses Continue. That stops keyboard users being moved on unexpectedly.

**Pip's speech bubble** reacts to the previous answer, for example "Nice to meet you, {name}!" or "Ha! Your secret's safe with me." The exact lines and the rules for choosing them are in the source `renderVals()`: `goalLead`, `expLead`, `makesLead` and `stashLead`.

### Ready screen

Everything here is built from the answers:
- **"You're all set, {name}!"**, followed by "Here's where I'd start. You can change any of this later."
- **Start here:** 3 numbered first steps, taken in order from the goals.
  - stash → "Add your first 3 fabrics to your stash"
  - next project → "Save a pattern you'd love to make"
  - learn → "Pick a beginner pattern and start a project"
  - share → "Post your latest make"
  - challenges → "Join this month's challenge"
  - sell → "Set up your pattern shop". Only include this one if seller onboarding exists; link to it.
  - If there are fewer than 3, fill the gaps with "Follow 3 sewists you like" and "Post your latest make".
  - Each step links to the matching screen.
- **Patterns for you:** 3 patterns from the existing public patterns or catalog.
  - Pick ones whose category matches the Q4 answers.
  - Use only Beginner difficulty if the person is "Just starting out" or skipped Q3.
  - Fill any gaps with popular patterns.
  - The title is "Beginner-friendly patterns" for beginners, or "Patterns for you" otherwise.
- **A challenge for you:** one active challenge.
  - Pick a mending challenge if Mending was chosen.
  - Otherwise pick a stash challenge if the "stash" goal was chosen.
  - Otherwise pick the most popular active challenge.
  - Hide the card if there are no active challenges.

## Pip (the mascot)

- **Component:** build Pip as one inline SVG React component, `<Pip pose="wave" size={140} />`. Copy the shapes from `assets/pip/pip-*.svg`. `poses.json` has the eye, mouth, arm, tilt and confetti values for each pose. Pip is our own original character, so the SVGs can be used directly.
- **Poses by screen:**

  | Screen | Pose |
  |---|---|
  | Join, Meet Pip | wave |
  | Name, Tools | curious |
  | Goals | wave |
  | Experience | thinking |
  | Makes | happy |
  | Stash | curious, or laugh when "We don't talk about it" is picked |
  | Post privacy | wink |
  | Setting up | focus |
  | Ready | cheer (with confetti) |

- **Accessibility:** give the SVG `role="img"` and an `aria-label` that says Pip's mood, e.g. "Pip, a tomato pincushion, looking curious".
- **Motion:** the gentle bob is a CSS animation (`.pip-bob`). Turn it off under `prefers-reduced-motion: reduce`.
- **Not a chatbot:** Pip has no AI behind it. The speech lines are fixed copy chosen by simple rules, and nothing is sent to an AI model.

## Layout

- **Mobile:**
  - Full-height screens with no app bars.
  - The progress bar sits at the top with back and Skip.
  - Small Pip with a speech bubble, then the question.
  - A Continue button pinned to the bottom with a fade above it, padded with `env(safe-area-inset-bottom)`.
- **Desktop:**
  - Logo top left. On the right: "Already a member? Log in" on Join, or **Finish setup later** during the questions.
  - Questions use a 2-column grid: Pip and the speech bubble on the left, and a white question card on the right with progress, back and "Question n of 7".
  - List options sit in 2 columns, and the photo tiles in 5.
  - Ready has Pip, the title and the button on the left, with the 3 cards on the right.
- **Backgrounds:**
  - Join: page grey
  - Meet Pip: yellow
  - Questions: page grey
  - Setting up: peach
  - Ready: yellow
- **Selected options:**
  - Selected: yellow fill, a black 2 px border and a black tick mark.
  - Not selected: a white card.
  - Multi-select uses rounded-square marks; single-select uses round marks.

## Data and access (additive migration)

- **New table `user_onboarding`:**
  - Columns: `user_id` (primary key, references users, `on delete cascade`), `current_step` (smallint), `goals` (text[]), `experience`, `tools` (text[]), `stash_size`, `completed_at`, `skipped_at`, `created_at`, `updated_at`.
  - Enforce the allowed values with check constraints or enums that match the source options.
- **Access:** answers are **private to their owner, always**. Use RLS `owner_all`, with no public read and no visibility setting.
- **Existing profile fields:** name, experience, favourite things to make and default post visibility are written to the fields that already exist, through their existing endpoints and existing access rules. **Don't add new profile keys without asking.**
- **Endpoints:** add these to `openapi.yaml`, then run codegen.
  - `GET /api/onboarding`: the current answers and step.
  - `PATCH /api/onboarding`: partial answers plus `current_step`. Validate every value against the allowed options.
  - `POST /api/onboarding/complete`: sets `completed_at`.
  - `POST /api/onboarding/skip`: sets `skipped_at`.
  - `GET /api/onboarding/recommendations`: first steps, 3 patterns and 1 challenge. It only uses public patterns and challenges, plus the caller's own answers.
- **Rate limit:** 120 per hour per user on the write endpoints.
- **Saving and resuming:** save after every step. Someone who leaves halfway comes back to their `current_step`. Going back keeps their answers.
- **Gate:** a signed-in user who has not completed or skipped setup, and lands on Home, is sent to `/welcome` **once per session at most**. Never send them there from deep links. **Skip for now** and **Finish setup later** set `skipped_at`. After that, show a small dismissible "Finish setting up with Pip" card on Home, and add a "Run setup again" link in Settings.
- **Tests:** add RLS tests and access-layer tests:
  - another user can't read or write someone's onboarding row
  - invalid values are rejected
  - the recommendations endpoint never returns private or followers-only content

## Accessibility

- When the step changes, move focus to the new `h1`. Pip's speech bubble is `aria-live="polite"`.
- The progress bar is `role="progressbar"`, with `aria-valuenow` and `aria-valuetext` set to "Question n of 7".
- Options are real buttons:
  - multi-select: `role="checkbox"` inside a `role="group"`
  - single-select: `role="radio"` inside a `role="radiogroup"`
  - every option has `aria-checked`
- Disabled Continue stays visible, with sufficient contrast for its label.
- Tap targets are at least 44 px.

## Order of work

Do one commit per step, then stop for review:

1. Migration, RLS, the API and tests.
2. The Pip component and the onboarding shell (mobile and desktop layouts, progress, back and skip, saving and resuming).
3. The Join page and the routing gate.
4. Questions 1–7, including auto-advance and Pip's reactions.
5. Setting up, Ready, the recommendations, the Home card and the Settings link.

For each step:
- Run the typecheck and the tests.
- Check every screen at 390 px and 1440 px against `images/`.
- Update `CLAUDE.md`: add `user_onboarding` to the access table, update "Where things live", and add Phase O to "Build order".

Don't add dependencies or paid services without asking. That includes animation libraries and new sign-in providers.
