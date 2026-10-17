# Phase F — Step-by-step form flows

Read `CLAUDE.md` first. Everything there still applies: the access rules, additive-only migrations, `scoped()`/`withUser`, the OpenAPI-first codegen, design tokens, and "ask the owner before adding a dependency or paid service". The product is now called **Seams Club**. Internal names keep the `sewspace` prefix; don't rename anything.

## Goal

Replace the long single-screen forms with short, Instagram-style flows that go one step at a time. This phase covers four flows:

1. **New post**, with hashtags. **Edit post** reuses the same flow.
2. **Create a project**: one quick step, then a "Finish setting up" checklist on the project page.
3. **Add to stash** (fabric, thread, pattern), starting from a photo, a pattern PDF or by hand.
4. **Start a forum discussion**: pick the post type first.

Every existing feature must keep working. The old forms are replaced, not kept alongside.

**Routing gotcha:** `/posts/:id/edit` and `/forum/new` sit under prefixes the API artifact owns. Make sure `routes/seo.ts` serves the plain SPA `index.html` for them, with `noindex` and `Cache-Control: private, no-store`, and adds no meta tags. Check them in development and in production.

## Design reference

The design files are in `docs/design/flows/`:

- `images/*.png` are screenshots of every step. Mobile shots are 390 px wide at 2× scale. Desktop shots are 1440 px wide. Open them, because they are the spec for layout, copy and states.
- `screens/Flow*.dc.html` are the interactive mockups. Their `renderVals()` holds the exact step logic, labels and copy, so read them when a screenshot is ambiguous. They are mockups only:
  - Don't copy their markup.
  - Don't copy their photos (the same rule as `docs/design/*.dc.html`).
  - Build with the app's real components, Tailwind tokens and generated API hooks.

The file names are `<flow>-<m|d>-<n>-<state>.png`. `m` means mobile and `d` means desktop.

## Part F0 — shared form system (build this first, as one commit)

Build a small set of shared pieces in `src/components/flow/` that all four flows use. Don't add new dependencies.

- **`<FlowShell>`**
  - **Mobile:** a full-screen route. The floating header holds Close or Back, the title, a subtitle such as "Draft saved", and an optional Next button on the right. A 4-segment step bar sits under the header with labels. The main action is a sticky button at the bottom. Content scrolls between them.
  - **Desktop (≥ 1024 px):** the same content in a centred dialog (`max-w-[1080px]`, `rounded-[34px]`) over the dimmed page. Steps appear as pills in the header, with Back and Next in a footer. New post and Stash have a left preview pane: see `post-d-*` and `stash-d-*`.
  - Steps already completed are clickable. Future steps are not, except in edit mode, where every step is clickable.
  - The URL holds the step (`?step=details`), so the browser Back button goes to the previous step.
- **Validation:**
  - Errors appear inline under the field, in `text-red-ink` with a 2 px red outline on the card and `aria-invalid`.
  - They show only after the person presses Next. Then focus moves to the first invalid field.
  - Never use `window.alert`, and never leave a disabled button with no reason given.
  - A disabled button always has a visible line explaining why.
- **No silent defaults:** a select or chip group that needs an answer starts empty. The current resource form saves fabric type = linen and difficulty = beginner without anyone choosing them; that has to stop.
- **Drafts:**
  - Add a new table `sewspace_drafts` with these columns: `id`, `user_id`, `kind` (`post | project | stash | topic`), `payload jsonb`, `updated_at`.
  - Keep at most one draft per user per kind (a unique index on user and kind).
  - Access is owner-only: an RLS `owner_all` policy, served through `scoped()`.
  - Payload is limited to 64 KB.
  - Any upload referenced in a payload must belong to the caller. Reuse `findForeignObjectField`.
  - Autosave about 800 ms after the last change. The subtitle shows "Draft saved".
  - Delete the draft when the flow is submitted.
  - Opening a flow that has a draft resumes it, with a "Start over" link (see `post-d-1-drop`: "1 draft waiting").
- **Leaving:** Close, Escape or tapping outside asks "Keep this as a draft?", with the choices Save draft, Discard and Keep editing (`post-m-6-keep-draft`). It only asks if something was entered. Use the same behaviour for every sheet and modal in this phase. Today some close on a tap outside and lose the text, and others ignore Escape.
- **Uploads:**
  - Show a photo preview right away.
  - Show a per-file progress bar (XHR `upload.onprogress` to the presigned URL), a remove button and an inline error with Retry.
  - People can carry on to the next step while an upload finishes. Only the final submit waits, and it says "Finishing upload…".
- **Accessibility:**
  - Chips and segmented controls are `button[aria-pressed]` or `role="radio"` inside a `radiogroup`.
  - The step bar is an `<ol>` with `aria-current="step"`.
  - Sheets get `role="dialog"` and `aria-modal`, with focus trapped inside and returned on close.
  - Touch targets are at least 44 px.

## Part F1 — New post and Edit post (`post-m-*`, `post-d-*`)

Replace `pages/compose.tsx` and the edit modal in `PostCard.tsx` (`OwnerMenu`) with one flow at `/new` and `/posts/:id/edit`. Keep the query parameters that already work: `?type=status`, `?make=`, `?challenge=`.

The steps are **Photos → Edit → Details → Share**:

- **Photos:**
  - On mobile, a large preview sits above a 3-column grid. Taps select photos in order and show numbered badges. The limit is 10.
  - "Write a status instead" switches to a big caption card, and the Edit step is skipped (it shows struck through in the step bar).
  - On desktop, the step is a drop zone with "Choose from computer".
- **Edit:**
  - Reorder with earlier and later buttons; the first photo is the cover.
  - Remove a photo, and set alt text per photo (a sheet on mobile, inline fields on desktop).
  - Choose the shape: 4:5, 1:1 or Original.
  - Uploads continue in the background.
- **Details:**
  - The caption has a counter out of 2,200.
  - **Hashtags** (below).
  - Tagging a make fills in the pattern and fabric.
  - The challenge toggle forces the audience to Public.
- **Share:**
  - The audience cards are Public, Followers and Only me, with a preview.
  - If the post is entered in a challenge and the audience isn't Public, show the inline error with a **Make it public** button. Share stays disabled until that's fixed.
  - Share is a sticky bottom button.
- **Done:** links to View post and Start another post.
- **Edit mode:**
  - It opens at Details, and every step is clickable.
  - The button says **Save changes** and the title says "Edit post".
  - Photos can be reordered, removed, added and given alt text.
  - Tags and challenge entry can change. Entering uses the existing enter and withdraw rules.
  - Status posts can't have an empty caption.

**Hashtags** (new; migration plus API):

- **Storage:**
  - Add the tables `sewspace_hashtags (id, tag unique)` and `sewspace_post_hashtags (post_id, hashtag_id, user_id)`.
  - Parse `#[a-z0-9_]{1,50}`, case-insensitively, from the caption on create and edit. Store tags in lower case. Allow at most 30 per post, enforced on the server too.
  - Post hashtags follow their post under RLS: only the owner writes them, and reads use the post's visibility.
- **`GET /api/hashtags/suggest?q=lin`:**
  - Returns the top 6 tags by prefix with a post count.
  - **Counts include public posts only, and blocks apply.** Followers-only and private posts must never show up in counts.
  - With no `q`, it suggests tags from the tagged make, pattern and fabric, the challenge tag, and the person's own recent tags.
- **Captions everywhere** (`PostCard`, the post page, previews) render hashtags as links to `/tags/:tag`.
- **Add a minimal public `/tags/:tag` page:**
  - It lists the public posts with that tag in a grid, newest first, using cursors, with blocks applied.
  - Add an SEO meta route for it. Add the `/tags` prefix to the API `artifact.toml`; it doesn't clash with any app route.
  - Follow-a-hashtag and the full hashtag page in `docs/design/Hashtag.dc.html` are a later phase. Don't build them now.
- **Composer autocomplete:**
  - When the word at the caret starts with `#` and has at least one more character, show matches (chips on mobile, a listbox on desktop).
  - Choosing one replaces the partial word and adds a space.
  - Show a "2 / 30 hashtags" counter.

**Database changes (additive):**
- `sewspace_media.alt_text text` (at most 500 characters), returned wherever media is returned and used as the `<img alt>`.
- `sewspace_posts.aspect text` (`4:5 | 1:1 | original`, default `4:5`).
- The display crops with `object-fit: cover` at that ratio. Don't re-crop the stored image.

## Part F2 — Create a project (`project-m-*`, `project-d-*`)

Replace `ProjectForm.tsx` for creating a project.

- **Quick start** (a sheet on mobile, a dialog on desktop):
  - **Project name** is the only required field. Its error says "Give it a name. You can change it any time."
  - The optional fields are a row of the person's patterns (choosing one fills an empty name), garment chips and a cover photo.
  - Pressing **Create project** creates the project with private visibility and goes to `/projects/:id`, with a toast.
- **Project page — "Finish setting up · n/7":** a progress ring and 7 rows: Pattern, Fabric, Thread, Measurements, Size you're making, Steps, and Who can see it.
  - Each row opens **one question**, as a sheet on mobile or in the right-hand panel on desktop.
  - Each question has **Skip** and **Save and next**, which jumps to the next unanswered row.
  - The card disappears once all 7 are answered or the person dismisses it. "Who can see it" counts as done once it has been chosen explicitly.
- **The questions:**
  - **Fabric:** compare each stash fabric's `quantity`/`unit` with the pattern's `yardage`, converting metres and yards. Show an **Enough** or **Short 0.4 m** badge. With no pattern or no yardage, just show the amount.
  - **Size:** chips taken from the pattern's `sizes` text where it can be parsed (`6–24`, `XS–XL` or a comma list), otherwise a free text field. The "fits you" badge in the mockup needs size charts, which we don't have, so **leave it out**.
  - **Steps** has three choices:
    - "Use the pattern's steps": shown only if the pattern has step data. See the note below.
    - "Add my own"
    - "No steps"
- **Progress:**
  - Progress is **derived from steps**: completed steps ÷ total steps. Stop asking for a progress %.
  - Keep the `progress` column and write the derived value to it, so nothing that reads it breaks.
  - Stage is still editable from the project page.
- **The journal** (the four notes fields) moves out of the form. It stays on the project page, with a visible "Saved" or error state per field, and the text must refresh after a save. Remove the second copy of these fields.
- **Pattern steps:**
  - Add the additive column `sewspace_patterns.steps jsonb` (an array of strings).
  - Extend the existing `analyze-pdf` call to also return a short list of construction steps when the PDF has one. Use the same model and the same request, with no new service.
  - Patterns without steps don't show that choice.

## Part F3 — Add to stash (`stash-m-*`, `stash-d-*`)

Replace the shared `Resource` modal's add and edit form for fabric, thread and pattern with one flow at `/stash/new?kind=fabric|thread|pattern`. Editing an item opens the same flow at Details with every step clickable, and the button says Save changes.

The steps are **Start → Details → More (skippable) → Save**:

- **Start:**
  - Choose **Fabric**, **Thread** or **Pattern** with three big cards.
  - Then choose where to start from:
    - **Fabric:** Take a photo, Choose a photo, or Fill in by hand.
    - **Thread:** Photo of the spool label, or Fill in by hand.
    - **Pattern:** Upload the pattern PDF, Photo of the envelope, or Fill in by hand.
- **Reading screen** (`stash-m-3`, `stash-m-6`): shows the upload with its progress and a "Here's what we found" list. Every value found is highlighted yellow on the next step and can be edited.
  - **Pattern PDF:** reuse `analyzePatternPdf` as it is, filling only empty fields. **The PDF stays private as it does today.**
  - **Fabric or thread photo: no AI in this phase.** Extract 4 dominant colours on the server with `sharp`, which is already a dependency: resize to 64 px, then run a simple k-means in plain TypeScript. Return them as swatches. Nothing else is guessed.
- **Details** (required fields are marked, and errors follow F0):
  - **Fabric:**
    - Name (required) and Type chips (required, no default).
    - Colour as swatches: from the photo if there is one, otherwise a common palette, plus a "Custom" swatch that opens `<input type="color">`. **No hex text field.**
    - Amount with − and + buttons, and a metres/yards toggle that converts the number.
  - **Thread:**
    - Colour name or number (required) and Type chips (required).
    - Colour swatches, as for fabric.
    - Number of spools with − and + buttons.
    - Brand becomes optional and moves to More. The column is NOT NULL, so save an empty string.
  - **Pattern:** Name (required), Designer, Garment chips (required), Difficulty chips (optional, can be left empty) and Sizes.
- **More** (all optional, with a Skip button):
  - **Fabric:** width chips (110, 140, 150 cm or Other), weight, stretch, composition and notes.
  - **Pattern:** status chips, format, notes, and a suggested **Seams Club page** to link to. Use the existing catalog search on name and designer, with a Link button.
- **Save:**
  - A summary card, then "Who can see this?", which defaults to **Only me**. The copy says "Nothing in your stash goes public unless you choose it." For patterns, add: "The pattern PDF itself always stays private."
  - The done screen offers **Use it in a new project** (goes to Create project with this item pre-linked) and **Add another**.
- **Desktop:** a dialog with a left pane titled "How it will look" that updates live as the person types (`stash-d-2`).

**Ask the owner before building these** (not part of this phase; leave a clean hook):
- AI fabric-type guesses from a photo ("looks like linen").
- Reading a thread label with OCR or vision.

Both would use the existing OpenAI integration, but they cost credits for every photo.

## Part F4 — Start a forum discussion (`forum-m-*`, `forum-d-*`)

Replace `components/forum/Composer.tsx` with a flow at `/forum/new` (`?board=` and `?kind=` still preselect). Sign-in works the same way as now.

The steps are **Type → Write → Where → Preview**:

- **Type:** five big cards, each with a one-line description: Show & tell, Question, Recommendation, Info & guide, Poll. Tapping one goes straight to Write.
- **Write:** the labels change with the type (copy is in the mockup's `KINDS`).
  - **Title:** required, at least 3 characters, with a counter out of 140.
  - **Question:** once the title has at least 3 words, show **"Already asked? These might help"**, the top 2 or 3 matches from the existing forum search (300 ms delay), with Solved or Open badges.
  - **Poll:** 2 to 6 option inputs with add and remove buttons. The error says "Fill in at least 2 options" and counts only filled options; check this on the server too. The closing time is 1 day, 3 days or 1 week.
  - **Show & tell:** a photo strip (at least one photo) and "Also share to my feed", which stays on as the default.
- **Where:**
  - Board as 7 radio tiles, with the **Suggested** board marked. The suggestion comes from the type plus title keywords, using a simple keyword map.
  - Tags as chips with an input (Enter or comma adds one) and suggestions. **At most 5, enforced in the UI and the API** (today the limit isn't enforced).
  - An optional link to a pattern or product page.
- **Preview:** the topic card exactly as it will appear, plus the note "Forum posts are public…". The button reads **Ask** for questions, **Post poll** for polls and **Post** for everything else.
- **Done:** goes to the new thread.
- **Desktop:** a live preview pane on the right during Write and Where.
- **Fix while you're there:** deleting a reply needs a confirmation, like deleting a topic.

## Order of work

Do one part per commit, then stop for review, as in earlier phases: **F0 → F1 → F2 → F3 → F4**. Each part:

1. Additive SQL migration(s) in `lib/db/migrations/`, with the Drizzle schema updated by hand and a rollback file.
2. `openapi.yaml`, then run codegen. Remember the YAML comma gotcha.
3. Access rules:
   - Add drafts and hashtags to the access table in `CLAUDE.md`.
   - Add RLS tests (`lib/db/test`) and access-layer tests. Hashtag counts must ignore followers-only and private posts and respect blocks. A draft is never readable by anyone else.
4. UI, to match the screenshots at 390 px and 1440 px.
5. `pnpm run typecheck`, the tests, and a manual run through each flow on mobile and desktop widths, including: leaving and resuming a draft, an upload failing and being retried, and the validation errors.
6. Update `CLAUDE.md` ("Where things live", "Build order": add Phase F) and `replit.md`.

Don't add dependencies or paid services without asking. Everything here can be built with what's installed.
