TrustVault — Secure Document Sharing with a Real Audit Trail

1. Project Overview

TrustVault is a secure document-sharing web application designed to help users upload, download, and share documents with controlled access permissions. It maintains an audit trail of important activities so that document operations and permission changes can be reviewed.

2. Problem Statement

Sharing documents digitally can create security risks when access is not properly controlled or when activities are difficult to trace. TrustVault addresses these challenges through authentication, permission-based access control, and audit-log integrity verification.

3. Objectives
* Provide user registration and login.
* Allow authenticated users to upload and download documents.
* Enable document owners to grant and revoke access.
* Restrict unauthorized document access.
* Record important actions in audit logs.
* Verify audit-log integrity using hashes and linked events.
4. Technology Stack
* Frontend: React, TypeScript, Vite
* Backend: Node.js, Express
* Database: PostgreSQL
* Authentication: JSON Web Tokens (JWT)
* API testing: Postman
* Development tools: Visual Studio Code, Git
5. Main Features

Authentication

Users log in to access protected application features.

Document Management

Authenticated users can upload documents and download documents they own or are authorized to access.

Permission Management

Document owners can grant read access and revoke previously granted permissions.

Audit Trail

Important activities, including document uploads and permission changes, are recorded as audit events.

Audit Integrity Verification

The application checks audit-log links and hashes to detect inconsistencies in the recorded event chain.

6. Security and Testing

The following tests were performed during development:

* Unauthenticated access to the documents API was denied.
* A viewer was prevented from accessing owner-only permission information.
* A viewer could download a document while read permission was granted.
* Download access was denied after permission revocation.
* Audit verification reported valid links, hashes, and overall integrity.
7. Conclusion

TrustVault demonstrates a document-sharing workflow that combines authentication, permission management, and an integrity-verifiable audit trail. The tested features provide a foundation for further security hardening and deployment.

8. Future Enhancements
* Deploy the application to a production environment.
* Add stronger file validation and malware scanning.
* Improve the user interface and accessibility.
* Add automated tests and monitoring.
* Implement secure backup and recovery procedures.

9. Prerequisites

Install the following before running TrustVault:

- Node.js and npm
- PostgreSQL
- Git
- Visual Studio Code (recommended)

10. Local Setup

Clone the repository

git clone https://github.com/teja0906/TrustVault.git
cd TrustVault

Backend setup

cd backend
npm install

Create a ".env" file in the backend directory. Configure the database connection, JWT secret, server port, and upload directory according to the variables used in the backend source code.

Important: Never commit ".env" files, database passwords, or production secrets to GitHub.

Run the backend using the start command configured in "backend/package.json".

Frontend setup

Open a second terminal:

cd frontend
npm install
npm run dev

Open the local URL printed by Vite in the terminal.

Database setup

1. Install and start PostgreSQL.
2. Create a database for TrustVault.
3. Apply the database schema and setup scripts included in the repository.
4. Configure the backend environment variables to connect to that database.

«The exact database commands and environment variable names must match the project's actual configuration files.»

11. API Access Rules

Endpoint| Allowed user
"POST /api/register"| Public registration
"POST /api/login"| Public login
"GET /api/health"| Health-check access, as configured
"GET /api/documents"| Authenticated user; only authorized documents
"POST /api/documents/upload"| Authenticated user
"GET /api/documents/:id/download"| Owner or user with valid permission
"GET /api/documents/:id/permissions"| Document owner only
"POST /api/documents/:id/permissions"| Document owner only
"DELETE /api/documents/:id/permissions/:userId"| Document owner only
"GET /api/audit-logs"| Authenticated user, subject to backend authorization
"GET /api/audit-logs/verify"| Authenticated user, subject to backend authorization

All protected endpoints must receive a valid bearer token. Confirm the authorization rules against the current backend code before submission.

12. Security Test Results

The following checks were performed during development:

Test| Expected result| Observed result
Request without authentication| Access denied| Passed
Viewer requests owner-only permissions| "403 Forbidden"| Passed
Viewer downloads a document with read permission| Download allowed| Passed
Viewer downloads after permission revocation| Access denied| Passed
Audit chain verification| Links and hashes valid| Passed

These are manual test results. Automated tests should also be included and run before final submission.

13. Demo Accounts

Add credentials here only after creating dedicated test accounts in the deployed application.

- Owner account: Add the demo email and password.
- Viewer account: Add the demo email and password.

Use non-sensitive demo credentials only. Never publish personal passwords or production secrets.

14. Deployment

The application must be deployed before a public live URL can be provided.

- Frontend URL: Add the deployed frontend URL.
- Backend URL: Add the deployed backend URL.
- Database: Configure a hosted PostgreSQL database.
- Environment variables: Configure secrets through the hosting provider's environment-variable settings.

Do not describe the application as deployed until the public URLs have been tested successfully.

15. Repository

GitHub: https://github.com/teja0906/TrustVault

