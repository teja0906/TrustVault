TrustVault — Secure Document Sharing with a Real Audit Trail

1. Project Overview

TrustVault is a secure document-sharing web application designed to help users upload, download, and share documents with controlled access permissions. It maintains an audit trail of important activities so that document operations and permission changes can be reviewed.

2. Problem Statement

Sharing documents digitally can create security risks when access is not properly controlled or when activities are difficult to trace. TrustVault addresses these challenges through authentication, permission-based access control, and audit-log integrity verification.

3. Objectives

- Provide user registration and login.
- Allow authenticated users to upload and download documents.
- Enable document owners to grant and revoke access.
- Restrict unauthorized document access.
- Record important actions in audit logs.
- Verify audit-log integrity using hashes and linked events.

4. Technology Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express
- Database: PostgreSQL
- Authentication: JSON Web Tokens (JWT)
- API testing: Postman
- Development tools: Visual Studio Code, Git

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

- Unauthenticated access to the documents API was denied.
- A viewer was prevented from accessing owner-only permission information.
- A viewer could download a document while read permission was granted.
- Download access was denied after permission revocation.
- Audit verification reported valid links, hashes, and overall integrity.

7. Conclusion

TrustVault demonstrates a document-sharing workflow that combines authentication, permission management, and an integrity-verifiable audit trail. The tested features provide a foundation for further security hardening and deployment.

8. Future Enhancements

- Deploy the application to a production environment.
- Add stronger file validation and malware scanning.
- Improve the user interface and accessibility.
- Add automated tests and monitoring.
- Implement secure backup and recovery procedures.