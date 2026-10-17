---
name: Publish diff and custom checks
description: An observed Replit managed-Postgres Publish diff issue with CHECK constraints that call user-defined functions.
---

A valid PostgreSQL `CHECK` that calls a user-defined function was emitted by Publish's schema diff as a nested `CHECK (CHECK (...` expression. The generated diff also omitted the helper function definition, so leaving the constraint function-backed would still leave a production dependency unresolved.

**Why:** the Publish diff is generated from database introspection and may not serialize custom check functions like native PostgreSQL does.

**How to apply:** When a publish validation error points at a custom-function `CHECK`, inspect the live development constraint and recompute the diff. Prefer a behavior-equivalent expression made from built-in SQL operations, apply it to development with a numbered migration, and confirm the regenerated diff no longer contains malformed nesting or a missing function reference before advising another publish attempt.
