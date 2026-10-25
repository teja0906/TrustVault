# TrustVault — Comprehensive Threat Model & Security Architecture

## 1. Executive Summary & Assets to Protect

TrustVault is a confidential document repository providing fine-grained access control, isolated private cloud storage, and cryptographic tamper-evident audit logging.

### Critical Assets:
1. **Confidential Document Payloads**: Private files stored in private cloud storage (`trustvault-documents`).
2. **Access Control Integrity**: Strict ownership boundaries and non-bypassable `READ` vs `EDIT` permissions.
3. **Audit Trail Immutability**: Historical logs of document operations, permission grants, and security events.
4. **User Credentials & Cryptographic Secrets**: Passwords hashed with bcrypt (12 rounds) and JWT signing keys.
5. **Database Records**: Metadata linking users, document UUIDs, and permission entries.

---

## 2. Trust Boundaries & Architecture

```
[ Untrusted Internet / Client Browser ]
                 │
                 ▼  (HTTPS / TLS 1.3)
      [ Reverse Proxy & Rate Limiter ]
                 │
                 ▼
     [ TrustVault Backend (Express 5) ]
        ├── Auth & RBAC Middleware (JWT Token Verification)
        ├── Storage Service (Private Supabase Storage / Fallback)
        └── Cryptographic Audit Engine (SHA-256 Hash Chaining)
                 │
                 ▼  (Encrypted Internal Connection)
     [ Supabase / Render PostgreSQL ]
```

### Trust Boundary 1: External Client to API Server
- **Boundary**: All incoming HTTP traffic.
- **Assumptions**: Client input, headers, cookies, and file payloads are considered untrusted and potentially hostile.
- **Controls**: Helmet security headers, rate limiting (30 requests/15m), strict Zod/regex validation, Bearer token signature verification, whitelisted file extension inspection.

### Trust Boundary 2: Application Server to Private Storage
- **Boundary**: Server-side binary transfer to private Supabase Storage bucket.
- **Assumptions**: Storage bucket is strictly private (`Public = false`). No public URLs exist.
- **Controls**: Server generates unpredictable UUID storage keys. Binary streaming or short-lived signed URLs (60-second validity) are mediated strictly by authenticated backend endpoints.

### Trust Boundary 3: Application Server to Database
- **Boundary**: SQL connection to PostgreSQL.
- **Assumptions**: Potential for SQL injection or concurrent race conditions in audit logging.
- **Controls**: Parameterized SQL queries (`$1, $2, ...`), PostgreSQL advisory transaction locks (`pg_advisory_xact_lock`) ensuring serialized audit hash chain generation.

---

## 3. Threat Analysis & Mitigations (STRIDE Matrix)

| Threat & Risk | STRIDE Category | Mitigation Strategy | Implemented In | Verification / Test Case |
| :--- | :--- | :--- | :--- | :--- |
| **T1: Unauthenticated API Access** | Spoofing | Protected endpoints require valid Bearer JWT signed with minimum 32-character secret; verified issuer and audience. | `src/middleware/auth.ts` | Tested in `authorization.test.ts` (returns `401 Unauthorized`). |
| **T2: Self-Assigned Privilege Escalation** | Elevation of Privilege | Public registration strictly restricts `role` input to `owner` or `viewer`. Any attempt to register as `admin` is rejected with HTTP 400. Admin role updates restricted to `requireRole('admin')`. | `src/routes/auth.ts`, `src/routes/admin.ts` | Tested in `authorization.test.ts` (returns `400 Bad Request`). |
| **T3: Insecure Direct Object References (IDOR)** | Tampering / Information Disclosure | All document operations query document ownership AND active permission in the same database query. User cannot access another user's document by guessing or modifying the UUID. | `src/routes/documents.ts` | Tested in `authorization.test.ts` (returns `403 Forbidden` / `404 Not Found`). |
| **T4: Access After Permission Revocation** | Elevation of Privilege | Permissions are verified live against `document_permissions` on every single download/stream request. Revocations take effect immediately on subsequent requests. | `src/routes/documents.ts`, `src/routes/permissions.ts` | Tested in `authorization.test.ts` (download immediately fails post-revocation). |
| **T5: READ vs EDIT Boundary Violation** | Elevation of Privilege | Users with `READ` permission can only stream document content. Any attempt by a `READ` user to patch metadata, rename, or re-upload is blocked with `403 Forbidden`. | `src/routes/documents.ts` | Tested in `authorization.test.ts` (metadata modification rejected for `READ` user). |
| **T6: Malicious File Uploads & Executables** | Tampering / Denial of Service | File uploads validated by extension whitelist (`.pdf`, `.docx`, `.xlsx`, `.txt`, `.png`, etc.), size limit (10MB), and stored with random UUID filenames on disk/storage. Executable formats (`.exe`, `.sh`, `.bat`) rejected. | `src/routes/documents.ts` | Tested in `authorization.test.ts` (`payload.exe` rejected). |
| **T7: Audit Log Tampering & Deletion** | Repudiation / Tampering | Each audit event is cryptographically linked to the previous event via SHA-256 hash chaining: `event_hash = SHA256(canonicalPayload + previousHash)`. Writes serialized using transaction-level advisory locks. | `src/services/audit.ts` | Tested in `authorization.test.ts` (`integrityValid: true`, `linksValid: true`). |
| **T8: Credential Stuffing & Brute Force** | Denial of Service / Spoofing | `express-rate-limit` enforces rate limiting on `/api/login` and `/api/register` (max 30 requests per 15 minutes). Password complexity enforced (12–72 characters, bcrypt 12 rounds). | `src/middleware/auth.ts`, `src/routes/auth.ts` | Tested in `authorization.test.ts` (short passwords rejected). |
| **T9: SQL Injection** | Tampering | All database interactions utilize parameterized prepared statements through `pg`. Dynamic string interpolation is prohibited. | `src/routes/*.ts` | Verified by static analysis and database unit tests. |

---

## 4. Cryptographic Audit Trail Architecture & Honest Limitations

### Hash Chaining Mechanism:
1. **Advisory Lock**: `SELECT pg_advisory_xact_lock(742019, 1)` serializes all audit write operations during high concurrency.
2. **Deterministic Canonicalization**: Event payload keys and nested objects are sorted alphabetically before serialization to guarantee identical JSON strings regardless of runtime property ordering.
3. **Payload Structure**:
   ```json
   {
     "actorId": "uuid",
     "action": "document_download",
     "documentId": "uuid",
     "targetUserId": null,
     "outcome": "success",
     "details": { "name": "report.pdf" },
     "previousHash": "sha256-hex-of-previous-event",
     "occurredAt": "2026-10-25T09:10:00.000Z"
   }
   ```
4. **Integrity Verification**:
   - The `/api/audit-logs/verify` endpoint retrieves all records ordered by ID ascending.
   - For each event $i$:
     - Checks if $event_i.previous\_hash == event_{i-1}.event\_hash$.
     - Recalculates $SHA256(canonicalPayload_i + previousHash)$ and compares with $event_i.event\_hash$.
   - Any missing, modified, reordered, or truncated record breaks the link and hash checks.

### Honest Security Limitation Note:
> **Important**: While cryptographic hash chaining provides strong evidence of unauthorized tampering or record deletion by application users, it **does not provide absolute protection against a rogue database superuser**. An attacker with direct PostgreSQL write access could modify an audit record and recompute all downstream hashes across the table. True immutability against database administrators requires off-site write-once storage (WORM) or external trusted timestamping authority checkpoints.

---

## 5. Security Test Suite Execution Evidence

All 29 automated tests executed against the real PostgreSQL database and Express application:

```
 RUN  v5.0.5 backend
 ✓ src/__tests__/authorization.test.ts (29 tests) 988ms
   ✓ Health & System Status (1)
     ✓ should return the API health status and storage mode
   ✓ Authentication Gateways & Input Validation (8)
     ✓ should reject requests without a token for documents
     ✓ should reject requests without a token for audit logs
     ✓ should reject requests without a token for user profile
     ✓ should return user profile and statistics when authorized
     ✓ should reject login attempts with invalid credentials
     ✓ should reject registration attempts with self-assigned admin privileges
     ✓ should reject passwords shorter than 12 characters
     ✓ should reject password change when current password is invalid
   ✓ Role-Based Access Control (RBAC) & Administrative Boundaries (5)
     ✓ should forbid non-admin users from accessing administrative user lists
     ✓ should allow administrators to access system metrics
     ✓ should forbid viewers from viewing document permissions
     ✓ should forbid viewers from modifying document metadata
     ✓ should forbid viewers from deleting documents
   ✓ File Upload Restrictions & Validation (2)
     ✓ should reject uploading unauthorized or executable file extensions
     ✓ should reject upload requests without any attached file
   ✓ Document Lifecycle & Permission Sharing Flow (12)
     ✓ should allow an owner to upload a valid text document
     ✓ should allow the owner to view permissions of the uploaded document
     ✓ should prevent viewer from downloading document before permission is granted
     ✓ should allow owner to grant READ permission to the viewer
     ✓ should allow viewer to download document after READ permission is granted
     ✓ should prevent viewer with READ permission from modifying document metadata
     ✓ should allow owner to upgrade viewer permission to EDIT
     ✓ should allow viewer with EDIT permission to modify document metadata
     ✓ should allow owner to revoke sharing permission from the viewer
     ✓ should immediately deny download to the viewer after revocation
     ✓ should allow owner to delete the document
     ✓ should not return deleted document in subsequent queries
   ✓ Audit Trail & Integrity Verification (1)
     ✓ should verify audit chain integrity and link validity across all recorded events

 Test Files  1 passed (1)
      Tests  29 passed (29)
   Duration  1.97s
```
