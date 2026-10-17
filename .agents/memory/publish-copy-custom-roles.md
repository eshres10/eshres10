---
name: Publish copy and custom roles
description: Diagnose managed PostgreSQL copy failures caused by RLS policies referencing missing custom roles.
---

A publish build failed during the development-to-production database copy when `pg_restore` tried to create an RLS policy for a custom role that existed in development but not in the production target. Replit's official documentation notes role-related restore failures when custom PostgreSQL roles, policies, or permissions are absent from the new production environment and directs users to Replit Support.

**Why:** PostgreSQL roles are cluster-level objects, while a database copy can restore policies that reference those roles without provisioning the roles in the target environment.

**How to apply:** Check role existence in development and production with read-only queries, identify the build phase and exact restore error, and do not work around it with production DDL, deploy-time role creation, or broader RLS policies. Ask Replit Support to resolve the managed-database copy issue.
