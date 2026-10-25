# TrustVault — Secure Document Management with Cryptographic Audit Trails

TrustVault is an enterprise-grade document security platform providing fine-grained access control, isolated cloud document storage, and tamper-evident cryptographic audit trails.

---

## 1. Project Overview & Architecture

TrustVault enables organizations to store, share, and track sensitive documents under a strict Zero-Trust model:
- **Private Document Lifecycle**: Documents are stored in private cloud storage (Supabase Storage) under randomized UUID keys, never exposed publicly.
- **Granular RBAC & Sharing**: Multi-role support (`ADMIN`, `OWNER`, `VIEWER`) with document-level `READ` vs `EDIT` separation.
- **Immediate Revocation**: Permissions are evaluated in real-time on every stream/download request; access is terminated immediately upon revocation.
- **Cryptographic Audit Trail**: Every sensitive activity (logins, uploads, downloads, edits, permissions, access denials) is linked into a SHA-256 hash chain with serialized concurrency protection.
- **Black & Emerald-Green Design System**: Modern, responsive user interface built for high usability and clarity.

```
+-------------------------------------------------------------------------+
|                         TrustVault Client (React 19)                    |
|             (Black & Emerald Dashboard, Live Stats, Permission UI)      |
+------------------------------------+------------------------------------+
                                     |  HTTPS / Bearer JWT (15m expiry)
                                     v
+-------------------------------------------------------------------------+
|                    TrustVault Backend (Node.js / Express 5)             |
|  - Rate Limiter (30 req/15m)            - Dual-Mode Storage Adapter     |
|  - Auth & RBAC Middleware               - SHA-256 Hash Chaining Engine  |
|  - Document Lifecycle & Validation      - Advisory Lock Concurrency     |
+-------------------+---------------------------------+-------------------+
                    |                                 |
                    v                                 v
+------------------------------------+   +--------------------------------+
|    Supabase / Render PostgreSQL    |   |     Supabase Private Storage   |
|  - app_users (bcrypt 12 rounds)    |   |  - Bucket: trustvault-documents|
|  - documents (metadata & keys)     |   |  - Private access only         |
|  - document_permissions            |   |  - Server-side streaming       |
|  - audit_events (hash chained)     |   |    & signed download URLs      |
+------------------------------------+   +--------------------------------+
```

---

## 2. Technology Stack

- **Backend**: Node.js (v24), TypeScript, Express 5, `pg`, `bcrypt` (12 rounds), `jsonwebtoken`, `multer`, `helmet`, `cors`, `express-rate-limit`, `@supabase/supabase-js`.
- **Frontend**: React 19, TypeScript, Vite, Custom Emerald Design System, native Fetch with Bearer Auth.
- **Database**: PostgreSQL with `pgcrypto` extension and transaction-level advisory locks (`pg_advisory_xact_lock`).
- **Cloud Storage**: Supabase Storage (`trustvault-documents` private bucket) with fallback to secure local disk.
- **Testing**: Vitest, Supertest (29 automated unit and security integration tests).
- **Deployment**: Render Web Service (Backend) + Render Static Site (Frontend).

---

## 3. Security Features & RBAC Matrix

### Role Permissions:

| Capability | ADMIN | OWNER (Document Creator) | VIEWER (with READ) | VIEWER (with EDIT) |
| :--- | :---: | :---: | :---: | :---: |
| **Upload Documents** | Yes | Yes | Yes (owns uploaded doc) | Yes |
| **Download Authorized Documents** | Yes | Yes | Yes | Yes |
| **Modify Document Metadata (Name/Category)** | Yes | Yes | No (`403 Forbidden`) | Yes |
| **Grant & Revoke Sharing Permissions** | Yes | Yes | No (`403 Forbidden`) | No (`403 Forbidden`) |
| **Delete Document** | Yes | Yes | No (`403 Forbidden`) | No (`403 Forbidden`) |
| **View Audit Trail** | Full System | Own & Owned Docs | Own Actions | Own Actions |
| **Verify Audit Hash Chain** | Yes | Yes | Yes | Yes |
| **User Management & Role Assignment** | Yes | No | No | No |

---

## 4. API Reference

All protected endpoints require `Authorization: Bearer <token>`.

### Authentication & Account:
- `POST /api/register` — Public user registration (role restricted to `owner` or `viewer`, rate-limited).
- `POST /api/login` — Authenticates user, issues 15-minute JWT, logs to audit trail.
- `GET /api/user/profile` — Returns user profile and document statistics.
- `PUT /api/user/password` — Authenticated password change requiring current password verification.
- `POST /api/logout` — Records logout audit event and clears session.

### Document Lifecycle:
- `POST /api/documents/upload` — Uploads document (validates MIME/extension, max 10MB, stores under UUID key).
- `GET /api/documents` — Lists accessible documents (supports `?search=...&category=...&ownership=...`).
- `GET /api/documents/:id/download` — Strictly verifies ownership or active permission before streaming.
- `PATCH /api/documents/:id` — Updates document name or category (requires `OWNER` or `EDIT` permission).
- `DELETE /api/documents/:id` — Soft deletes document (requires `OWNER` or `ADMIN`).

### Sharing & Permissions:
- `GET /api/documents/:id/permissions` — Lists users granted access (`OWNER` or `ADMIN` only).
- `POST /api/documents/:id/permissions` — Grants `read` or `edit` permission to a user by email.
- `DELETE /api/documents/:id/permissions/:userId` — Revokes permission (effective immediately).

### Audit & Administration:
- `GET /api/audit-logs` — Fetches role-scoped audit logs.
- `GET /api/audit-logs/verify` — Recalculates and verifies SHA-256 hash chain integrity.
- `GET /api/admin/users` — Lists all registered users and document counts (`ADMIN` only).
- `PATCH /api/admin/users/:id/role` — Changes user role (`ADMIN` only).
- `GET /api/admin/system-stats` — System metrics and storage provider status (`ADMIN` only).
- `GET /api/health` — Service health check and storage mode.

---

## 5. Local Development Setup

### Prerequisites:
- Node.js 20+ and npm
- PostgreSQL 15+ running locally (or Supabase connection URL)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/teja0906/TrustVault.git
cd TrustVault

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` in `backend/`:
```bash
cp .env.example .env
```
Update `.env` with your PostgreSQL database credentials and a secure `JWT_SECRET`:
```env
PORT=4000
DATABASE_URL=postgresql://postgres:password@localhost:5432/trustvault
JWT_SECRET=replace_with_a_secure_random_string_at_least_32_chars_long
FRONTEND_URL=http://localhost:5173
UPLOAD_DIR=./uploads
```

### 3. Initialize Database Schema
Apply the idempotent schema to your PostgreSQL database:
```bash
psql -U postgres -d trustvault -f backend/sql/schema.sql
```

### 4. Seed Initial Administrator Account (Optional)
```bash
cd backend
npm run seed:admin admin@trustvault.local AdminVault2026!
```

### 5. Run the Application
In terminal 1 (Backend API):
```bash
cd backend
npm run dev
```

In terminal 2 (Frontend Client):
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 6. Automated Security & Integration Testing

TrustVault includes a comprehensive Vitest & Supertest suite covering all 29 security scenarios:

```bash
cd backend
npx vitest run
```

### Verified Test Results (29/29 Passing):
- **Health & System Status**: Verifies `/api/health` returns status `ok` and active storage mode.
- **Authentication Gateways**: Validates token requirements, rejects invalid credentials, prevents passwords <12 chars, and blocks self-assigned admin privileges at registration.
- **RBAC Boundaries**: Proves non-admins are rejected with `403 Forbidden` from `/api/admin/*`, viewers cannot view permissions, edit metadata, or delete files.
- **File Upload Security**: Enforces 10MB limit and rejects dangerous executable files (`.exe`).
- **Document & Sharing Lifecycle**: Uploads document, verifies viewer is blocked prior to grant, grants `READ`, verifies successful download, verifies `READ` cannot edit metadata, upgrades to `EDIT`, verifies metadata edit succeeds, revokes permission, and verifies subsequent download is **immediately blocked**.
- **Audit Chain Verification**: Validates sequential SHA-256 hash recalculation and link integrity across all recorded events.

---

## 7. Supabase Storage Setup (Production)

For deployment on Render, private files must be stored in Supabase Storage rather than Render's ephemeral filesystem:

1. Log into your [Supabase Dashboard](https://supabase.com).
2. Go to **Storage** -> Click **New Bucket**.
3. Name the bucket: `trustvault-documents`.
4. Ensure **Public bucket is toggled OFF** (private bucket).
5. In **Project Settings** -> **API**, copy:
   - **Project URL** (`SUPABASE_URL`)
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY` — server-side only; never expose in frontend).

---

## 8. Render Deployment Guide

### Option A: Automated Blueprint (`render.yaml`)
1. Push your repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** -> **Blueprint**.
3. Connect your GitHub repository (`https://github.com/teja0906/TrustVault.git`).
4. Render will detect `render.yaml` and configure both the backend web service and frontend static site.
5. Provide your `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the environment prompts.

### Option B: Manual Service Configuration
1. **Backend Web Service**:
   - Environment: `Node`
   - Build Command: `cd backend && npm install && npm run build`
   - Start Command: `cd backend && npm start`
   - Health Check Path: `/api/health`
   - Environment Variables:
     - `NODE_ENV`: `production`
     - `PORT`: `10000` (or leave default; server binds dynamically to `process.env.PORT`)
     - `DATABASE_URL`: Hosted Supabase PostgreSQL connection string
     - `JWT_SECRET`: Random 64-character secret
     - `FRONTEND_URL`: URL of your deployed frontend (e.g. `https://trustvault-frontend.onrender.com`)
     - `SUPABASE_URL`: Supabase project URL
     - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role secret
     - `SUPABASE_STORAGE_BUCKET`: `trustvault-documents`
2. **Frontend Static Site**:
   - Environment: `Static Site`
   - Build Command: `cd frontend && npm install && npm run build`
   - Publish Directory: `frontend/dist`
   - Environment Variables:
     - `VITE_API_URL`: URL of your deployed backend (e.g. `https://trustvault-api.onrender.com`)

---

## 9. Live Deployed Application URLs

- **Frontend Live URL**: [https://trustvault-frontend-xop8.onrender.com](https://trustvault-frontend-xop8.onrender.com)
- **Backend API Live URL**: [https://trustvault-api-mib1.onrender.com](https://trustvault-api-mib1.onrender.com)
- **API Health Check**: [https://trustvault-api-mib1.onrender.com/api/health](https://trustvault-api-mib1.onrender.com/api/health)
- **Database**: Hosted PostgreSQL on Render (`oregon` region)

---

## 10. Demo Accounts

For evaluation and testing:

| Account Type | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@trustvault.local` | `AdminVault2026!` | Full administrative user management, metrics, audit review |
| **Owner** | `owner@example.com` | `VaultTestPass123!` | Uploads, full ownership, sharing grant & revocation |
| **Viewer** | `viewer@example.com` | `VaultTestPass123!` | Accesses only explicitly granted documents (READ/EDIT) |
