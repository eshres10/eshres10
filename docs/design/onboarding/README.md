# Seams Club: Sign-up and onboarding with Pip

Put this folder in the repo at `docs/design/onboarding/`, then give Claude Code the text of `PROMPT.md`.

- `images/`: screenshots at 2× scale.
  - `m01`–`m11`: the mobile steps in order, plus extra states (email sent, email error, empty name).
  - `d01`–`d11`: desktop.
- `screens/`: static snapshots of each screen as standalone HTML pages. Open any of them in a browser.
- `source/`: the interactive mockups, for reference. `MOnboard00` is mobile; `OnboardDesk00` is desktop. Each one runs the whole flow.
- `assets/pip/`: Pip in 9 poses as SVG, plus `poses.json` with the values behind each pose.
