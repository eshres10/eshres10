---
name: Manual web build environment
description: Required environment variables when building the Vite artifact outside its managed workflow.
---

Set the artifact's `PORT` and `BASE_PATH` environment variables when invoking its Vite build directly from a shell. For Sewspace, the web service uses `PORT=23614` and `BASE_PATH=/`.

**Why:** the Vite configuration throws if either value is missing; managed artifact workflows provide them automatically, but one-off shell commands do not.

**How to apply:** for a manual build, pass both values in the command environment (for example, `PORT=23614 BASE_PATH=/ pnpm --filter @workspace/sewspace run build`).
