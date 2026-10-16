#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Apply SQL migrations (lib/db/migrations). Never use drizzle-kit push: it would
# drop the row-level security policies and views that the migrations create.
pnpm --filter @workspace/db run migrate
