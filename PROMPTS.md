TrustVault — AI Prompt Log

This file records how AI assistance was used during development. Entries describe the request, the output, issues identified, and the correction. Commit references will be added after the corresponding fixes are committed.

Entry 1 — 2026-10-19 — Project setup and architecture

Prompt / request: Help me plan and build TrustVault, a secure document-sharing application, step by step using a beginner-friendly stack.

What the tool produced: A proposed application structure and setup guidance for the frontend, backend, database, authentication, document upload, permissions, and audit logging.

Issue identified: The initial setup guidance did not immediately produce a working end-to-end application; configuration and integration needed to be checked locally.

What I did instead: Built and ran the components locally, checked database connectivity, and tested API endpoints before continuing.

Fix commit: TODO — add the actual commit URL.

Entry 2 — 2026-10-23 — Authentication and authorization

Prompt / request: Help implement authenticated document APIs and permission checks for owners and viewers.

What the tool produced: Guidance for login, token-based authentication, document permissions, and protected endpoints.

Issue identified: A successful login alone does not prove that authorization is correct. Each document operation must independently verify ownership or granted permission.

What I checked: Tested protected API access without a token, attempted to inspect permissions as a viewer, and checked document download access.

What I did instead: Kept authorization checks in the backend and verified that unauthenticated requests were rejected and viewer permission-management requests returned 403.

Fix commit: TODO — add the actual commit URL.

Entry 3 — 2026-10-24 — Permission revocation

Prompt / request: Help record permission grants and revocations in the audit trail and test whether revoked access is denied.

What the tool produced: Guidance for adding "permission_granted" and "permission_revoked" audit events.

Issue identified: Recording a revocation is not sufficient by itself; the download endpoint must check the current permission instead of relying on a previous authorization result.

What I checked: Granted read access to a viewer, tested downloading, revoked access, and tested downloading again.

What I did instead: Verified that the viewer could download while authorized and received a denial after revocation. I also checked the resulting audit events.

Fix commit: TODO — add the actual commit URL.

Entry 4 — 2026-10-24 — Audit integrity verification

Prompt / request: Help verify the audit-event hash chain and display the verification result in the application.

What the tool produced: Guidance for an audit verification endpoint and a frontend panel showing verification status.

Issue identified: A successful response must be checked for link validity, hash validity, and overall integrity; displaying a green status without checking these values would be misleading.

What I checked: Ran the verification endpoint and observed "linksValid: true", "hashesValid: true", and "integrityValid: true" for the tested events.

What I did instead: Displayed the verification fields and recorded the observed result. I also noted that a hash chain alone cannot prevent a privileged attacker from rewriting the entire chain.

Fix commit: TODO — add the actual commit URL.

Entry 5 — 2026-10-24 — Frontend integration and error handling

Prompt / request: Help connect the frontend to the document and audit APIs and show useful messages for failed operations.

What the tool produced: Frontend integration guidance for loading documents, downloading files, and displaying audit logs and verification results.

Issue identified: Directly opening a protected API URL in a browser does not send the application's bearer token, so it can return an authentication error even when the API is working correctly.

What I did instead: Tested protected endpoints with an authorization token and used the application's authenticated requests to load data.

Fix commit: TODO — add the actual commit URL.

Reusable prompts and context

The following reusable instruction guided development:

«Build TrustVault step by step for a beginner. Explain where each change belongs, preserve existing working functionality, use secure backend authorization, and provide commands and tests to verify each change. Do not claim a security test passed until its result has been observed.»

Additional context reused:

- Project: TrustVault — secure document sharing with an audit trail.
- Frontend: React with Vite and TypeScript.
- Backend: API server with token-based authentication.
- Database: use the database configuration actually present in the project.
- Security priorities: document ownership, least-privilege permissions, revocation, private file storage, and audit integrity.

Accuracy note

The entries above summarize the development work and observed test results. Replace any date or description that does not match the actual work. Add real commit URLs for the corresponding fixes; do not invent commits or claim that an unexecuted test passed.