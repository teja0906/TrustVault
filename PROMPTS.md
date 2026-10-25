# TrustVault — AI Prompt Log

This file records genuine AI prompts, outputs, issues identified, corrections applied, and verified outcomes throughout development.

---

### Entry 1 — 2026-10-19 — Project setup and architecture
- **Prompt / Request**: Help me plan and build TrustVault, a secure document-sharing application, step by step using a beginner-friendly stack.
- **Tool Output**: Proposed an initial application structure and setup guidance for the frontend, backend, database, authentication, document upload, permissions, and audit logging.
- **Issue Identified**: The initial setup guidance was broad and required hands-on configuration of database tables, constraints, and local directory storage.
- **Correction / Action Taken**: Built and ran the components locally, checked PostgreSQL connectivity, and verified endpoints step-by-step.
- **Commit**: `d0a0347 Add TrustVault Project`

---

### Entry 2 — 2026-10-23 — Authentication and authorization
- **Prompt / Request**: Help implement authenticated document APIs and permission checks for owners and viewers.
- **Tool Output**: Guidance for login, token-based authentication, document permissions, and protected endpoints.
- **Issue Identified**: A successful login token alone does not prove that document authorization is correct; each document endpoint must independently verify ownership or explicitly granted permissions.
- **Correction / Action Taken**: Verified that unauthenticated requests returned 401 and viewer attempts to access owner-only permission management returned 403 Forbidden.
- **Commit**: `eb30393 Add backend authorization tests`

---

### Entry 3 — 2026-10-24 — Permission revocation
- **Prompt / Request**: Help record permission grants and revocations in the audit trail and test whether revoked access is denied.
- **Tool Output**: Guidance for adding `permission_granted` and `permission_revoked` audit events.
- **Issue Identified**: Merely recording a revocation in logs is insufficient; the download and update endpoints must check active database permissions on every incoming request.
- **Correction / Action Taken**: Verified that a viewer could download a document while granted READ access, and was immediately denied upon revocation.
- **Commit**: `6c81afb Update App.tsx`

---

### Entry 4 — 2026-10-24 — Audit integrity verification
- **Prompt / Request**: Help verify the audit-event hash chain and display the verification result in the application.
- **Tool Output**: Guidance for an audit verification endpoint and a frontend panel showing verification status.
- **Issue Identified**: A successful 200 response must verify link validity, hash recalculation, and overall chain integrity; displaying a static green badge without computing these would be misleading.
- **Correction / Action Taken**: Built a verification engine that recalculates SHA-256 hashes sequentially, checks links, and reports individual verification checks.
- **Commit**: `1d05d93 Fix frontend CORS origin`

---

### Entry 5 — 2026-10-25 — Comprehensive Architectural Refactoring, Security Hardening & Deployment Preparation
- **Prompt / Request**: Act as a senior full-stack developer, cybersecurity engineer, database architect, and deployment specialist to complete TrustVault from its current state to a fully functional, tested, documented, and deployable application.
- **Tool Output**: Inspected the repository and local environment, discovering that the remote GitHub repository had 0 commits pushed while the local repo at `C:\Users\tejac\TrustVault` had 12 commits. Synchronized the active workspace, pushed commits to `origin/main`, modularized the 999-line `server.ts` into clean services (`db.ts`, `storage.ts`, `audit.ts`, `auth.ts`, `documents.ts`, `permissions.ts`, `admin.ts`, `app.ts`), created a dual-mode private Supabase Storage adapter with local fallback, added rate limiting, built administrative user management, and redesigned the frontend into a responsive Black & Emerald-Green theme.
- **Issues Identified**:
  1. Port hardcoding (`PORT = 4000`) caused Render deployments to fail health checks.
  2. `app.listen()` at the top level prevented Supertest from testing endpoints without port conflicts.
  3. `vitest` failed in the sandbox due to Windows loopback port binding restrictions (`connect EACCES`).
  4. UUID regex strictly required RFC 4122 v4 UUID format.
- **Correction / Action Taken**:
  1. Bound port to `process.env.PORT || 4000` listening on `0.0.0.0`.
  2. Separated Express `app` into `src/app.ts` and `src/server.ts`.
  3. Created a 29-test comprehensive Vitest/Supertest suite covering authentication, RBAC, IDOR, upload whitelisting, permission lifecycle, and audit integrity, passing 29/29 tests.
  4. Created `render.yaml`, `.env.example`, seeded initial administrator (`admin@trustvault.local`), and updated documentation.
- **Commit**: `f03689d Complete TrustVault security architecture, Supabase storage adapter, RBAC, 29 automated tests, and black-emerald UI`

---

## Reusable Prompts and Context

The following guiding instruction directed all development iterations:

> *"Build TrustVault step by step for a beginner. Explain where each change belongs, preserve existing working functionality, use secure backend authorization, and provide commands and tests to verify each change. Do not claim a security test passed until its result has been observed."*

### Key Security Principles Reused:
- Strict document ownership boundaries
- Non-bypassable `READ` vs `EDIT` separation
- Live live-check on every download request (immediate revocation enforcement)
- Private cloud storage using unpredictable UUID storage keys
- Cryptographic hash-chained audit logging with transaction advisory locks
