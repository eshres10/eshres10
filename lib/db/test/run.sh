#!/usr/bin/env bash
# Runs the RLS test suite against a throwaway database.
# Needs TEST_DATABASE_URL pointing at a server where the user can create databases,
# e.g. TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/postgres
set -euo pipefail
cd "$(dirname "$0")/.."
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a Postgres server you can create databases on}"
name="sewspace_test_$$"
case "$TEST_DATABASE_URL" in *\?*) echo "TEST_DATABASE_URL must not have query parameters" >&2; exit 1;; esac
url="${TEST_DATABASE_URL%/*}/$name"
psql "$TEST_DATABASE_URL" -qc "CREATE DATABASE $name" >/dev/null
trap 'psql "$TEST_DATABASE_URL" -qc "DROP DATABASE IF EXISTS $name WITH (FORCE)" >/dev/null' EXIT
DATABASE_URL="$url" pnpm exec tsx ./src/migrate-cli.ts >/dev/null
for f in test/*.test.sql; do
  echo "• $f"
  psql "$url" -q -o /dev/null -v ON_ERROR_STOP=1 -f "$f"
done
echo "All RLS tests passed"

# Replit's Publish copies the schema without migration records or grants. A
# copy must be finished by the migration runner and then pass every test again.
copy="${name}_copy"
psql "$TEST_DATABASE_URL" -qc "CREATE DATABASE $copy" >/dev/null
trap 'psql "$TEST_DATABASE_URL" -qc "DROP DATABASE IF EXISTS $name WITH (FORCE)" -qc "DROP DATABASE IF EXISTS $copy WITH (FORCE)" >/dev/null' EXIT
copy_url="${TEST_DATABASE_URL%/*}/$copy"
pg_dump --schema-only --no-owner --no-privileges "$url" | grep -v '^\\\(un\)\?restrict ' | psql "$copy_url" -q -v ON_ERROR_STOP=1 >/dev/null
DATABASE_URL="$copy_url" pnpm exec tsx ./src/migrate-cli.ts >/dev/null
for f in test/*.test.sql; do
  psql "$copy_url" -q -o /dev/null -v ON_ERROR_STOP=1 -f "$f"
done
echo "A copied schema (as Replit's Publish makes) is completed by the migrations and passes too"
