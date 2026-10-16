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
