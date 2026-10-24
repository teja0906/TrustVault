TrustVault — Threat Model

1. Project Overview

TrustVault is a secure document-sharing application that allows authenticated users to upload, download, and share documents with controlled permissions. It maintains an audit trail for important document and permission activities.

2. Assets to Protect

- User accounts and password hashes
- Authentication tokens
- Uploaded documents and their contents
- Document ownership and sharing permissions
- Audit events and their integrity
- Database credentials and application secrets

3. Threats and Mitigations

Threat 1: Unauthenticated API Access

Risk: An attacker may attempt to access protected endpoints without logging in.

Mitigation: Protected endpoints require a valid authentication token.

Verification: Send a request to a protected endpoint without a token and confirm that access is denied.

Threat 2: Cross-User Document Access

Risk: A user may try to access another user's documents by changing a document ID.

Mitigation: The backend must verify document ownership or an explicitly granted permission for each document operation.

Verification: Log in as two different users and test whether one user can access the other user's documents without permission.

Threat 3: Unauthorised Permission Management

Risk: A viewer may attempt to grant or revoke permissions or inspect another user's sharing settings.

Mitigation: Permission-management endpoints must enforce owner-only authorization.

Verification: Call the permissions endpoint using a viewer's token and confirm that the request is rejected.

Threat 4: Access After Permission Revocation

Risk: A user may continue downloading a document after their permission has been revoked.

Mitigation: Recheck current permissions on every download request.

Verification: Grant read access, verify that the viewer can download the document, revoke access, and verify that a subsequent download is denied.

Threat 5: Malicious or Oversized Uploads

Risk: An attacker may upload an oversized file or a file intended to exploit the application.

Mitigation: Enforce upload size limits, validate file handling on the server, and avoid trusting client-provided filenames or MIME types alone.

Verification: Test oversized uploads and unsupported file types. Record the actual results.

Threat 6: Credential and Token Exposure

Risk: Database credentials, signing secrets, or tokens could be exposed through source control or logs.

Mitigation: Store secrets in environment variables, exclude ".env" files from Git, and never commit real credentials.

Verification: Inspect tracked files and repository history for secrets before publishing.

Threat 7: Audit Trail Tampering

Risk: An attacker or application defect could modify or remove audit events without detection.

Mitigation: Link audit events using hashes and verify event links and hashes. Restrict access to audit data.

Verification: Run the audit verification endpoint and record the returned status, link validation, hash validation, and integrity result. A hash chain alone does not prevent a privileged attacker from rewriting the entire chain.

Threat 8: SQL Injection

Risk: Malicious input could alter database queries.

Mitigation: Use parameterized SQL queries and validate user input.

Verification: Review database queries and test invalid input against relevant endpoints.

4. Security Limitations

- Hash-chain verification detects certain modifications but does not provide absolute protection against a privileged attacker who can rewrite the database and recompute hashes.
- Production deployment requires HTTPS, secure secret management, restricted database access, and private file storage.
- File type validation, rate limiting, backup procedures, and additional automated security tests should be reviewed before production use.

5. Testing Evidence

Record the date, test setup, expected result, actual result, and screenshot or test output for each security test. Only mark a test as passed after it has actually been executed.