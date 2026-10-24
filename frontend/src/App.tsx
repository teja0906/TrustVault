import { useEffect, useState } from "react";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "https://trustvault-bpft.onrender.com"
).replace(/\/+$/, "");

type DocumentItem = {
  id: string;
  name: string;
  category: string;
  mime_type: string;
  size_bytes: number | string;
};

type AuditLogItem = {
  id: string | number;
  actor_id: string;
  action: string;
  document_id: string | null;
  target_user_id: string | null;
  outcome: string;
  details: Record<string, unknown>;
  occurred_at: string;
};

type PermissionItem = {
  user_id: string;
  email: string;
  permission: string;
  granted_at: string;
};

type AuditVerification = {
  status?: string;
  totalEvents?: number;
  linksValid?: boolean;
  hashesValid?: boolean;
  integrityValid?: boolean;
};

async function readResponse(response: Response): Promise<any> {
  const text = await response.text();

  let data: any = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
        data.error ||
        `Request failed: ${response.status}`
    );
  }

  return data;
}

function App() {
  const [activeTab, setActiveTab] = useState("Dashboard");

  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState("General");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  const [downloadError, setDownloadError] = useState("");
  const [downloadingId, setDownloadingId] = useState("");

  const [permissionDocumentId, setPermissionDocumentId] = useState("");
  const [permissionEmail, setPermissionEmail] = useState("");
  const [permissionLevel, setPermissionLevel] =
    useState<"read" | "edit">("read");
  const [permissionRows, setPermissionRows] = useState<PermissionItem[]>([]);
  const [permissionMessage, setPermissionMessage] = useState("");
  const [permissionLoading, setPermissionLoading] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditLogsError, setAuditLogsError] = useState("");

  const [auditVerification, setAuditVerification] =
    useState<AuditVerification | null>(null);
  const [auditVerificationLoading, setAuditVerificationLoading] =
    useState(false);

  const tabs = [
    "Dashboard",
    "Documents",
    "Permissions",
    "Audit Logs",
  ];

  const authHeaders = () => ({
    Authorization: `Bearer ${token.trim()}`,
  });

  // Login
  const handleLogin = async () => {
    setLoginMessage("");

    if (!email.trim() || !password) {
      setLoginMessage("Please enter email and password.");
      return;
    }

    setLoggingIn(true);

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await readResponse(response);

      if (!data.token) {
        throw new Error("Login succeeded, but no token was returned.");
      }

      setToken(data.token);
      setPassword("");
      setLoginMessage(
        `Login successful${data.user?.email ? `: ${data.user.email}` : "!"}`
      );
      setDocumentsError("");
      setActiveTab("Documents");
    } catch (error) {
      setLoginMessage(
        error instanceof Error
          ? error.message
          : "Login failed. Please try again."
      );
    } finally {
      setLoggingIn(false);
    }
  };

  // Load documents
  const loadDocuments = async () => {
    setDocumentsLoading(true);
    setDocumentsError("");

    try {
      const response = await fetch(`${API_URL}/api/documents`, {
        headers: authHeaders(),
      });

      const data = await readResponse(response);

      if (!Array.isArray(data.documents)) {
        throw new Error("Unexpected documents response from server.");
      }

      setDocuments(data.documents);
    } catch (error) {
      setDocumentsError(
        error instanceof Error
          ? error.message
          : "Unable to load documents."
      );
    } finally {
      setDocumentsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "Documents" && token.trim()) {
      void loadDocuments();
    }
    // loadDocuments is intentionally called when tab/token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token]);

  // Upload document
  const uploadDocument = async () => {
    setUploadMessage("");

    if (!token.trim()) {
      setUploadMessage("Please log in first.");
      return;
    }

    if (!selectedFile) {
      setUploadMessage("Please choose a file first.");
      return;
    }

    if (selectedFile.size === 0) {
      setUploadMessage("The selected file is empty.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setUploadMessage("File must be 10 MB or smaller.");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("document", selectedFile);
      formData.append("category", category.trim() || "General");

      const response = await fetch(`${API_URL}/api/documents/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });

      const data = await readResponse(response);

      setUploadMessage(data.message || "Document uploaded successfully!");
      setSelectedFile(null);

      const fileInput = document.getElementById(
        "document-file-input"
      ) as HTMLInputElement | null;

      if (fileInput) fileInput.value = "";

      await loadDocuments();
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "Upload failed."
      );
    } finally {
      setUploading(false);
    }
  };

  // Download document
  const downloadDocument = async (doc: DocumentItem) => {
    setDownloadError("");
    setDownloadingId(doc.id);

    try {
      const response = await fetch(
        `${API_URL}/api/documents/${encodeURIComponent(doc.id)}/download`,
        {
          headers: authHeaders(),
        }
      );

      if (!response.ok) {
        await readResponse(response);
        throw new Error("Download failed.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "Unable to download document."
      );
    } finally {
      setDownloadingId("");
    }
  };

  // Load permissions
  const loadPermissions = async () => {
    setPermissionMessage("");

    if (!token.trim() || !permissionDocumentId) {
      setPermissionMessage("Log in and select a document first.");
      return;
    }

    setPermissionLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/documents/${encodeURIComponent(
          permissionDocumentId
        )}/permissions`,
        {
          headers: authHeaders(),
        }
      );

      const data = await readResponse(response);

      if (!Array.isArray(data.permissions)) {
        throw new Error("Unexpected permissions response.");
      }

      setPermissionRows(data.permissions);
      setPermissionMessage("Permissions loaded.");
    } catch (error) {
      setPermissionMessage(
        error instanceof Error
          ? error.message
          : "Could not load permissions."
      );
    } finally {
      setPermissionLoading(false);
    }
  };

  // Grant permission
  const grantPermission = async () => {
    setPermissionMessage("");

    if (!permissionDocumentId || !permissionEmail.trim()) {
      setPermissionMessage("Select a document and enter the user's email.");
      return;
    }

    setPermissionLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/documents/${encodeURIComponent(
          permissionDocumentId
        )}/permissions`,
        {
          method: "POST",
          headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: permissionEmail.trim(),
            permission: permissionLevel,
          }),
        }
      );

      const data = await readResponse(response);

      setPermissionMessage(data.message || "Permission granted.");
      await loadPermissions();
    } catch (error) {
      setPermissionMessage(
        error instanceof Error
          ? error.message
          : "Could not grant permission."
      );
    } finally {
      setPermissionLoading(false);
    }
  };

  // Revoke permission
  const revokePermission = async (userId: string) => {
    if (!permissionDocumentId) return;

    if (!window.confirm("Revoke this user's document access?")) return;

    setPermissionMessage("");
    setPermissionLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/documents/${encodeURIComponent(
          permissionDocumentId
        )}/permissions/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      const data = await readResponse(response);

      setPermissionMessage(data.message || "Permission revoked.");
      await loadPermissions();
    } catch (error) {
      setPermissionMessage(
        error instanceof Error
          ? error.message
          : "Could not revoke permission."
      );
    } finally {
      setPermissionLoading(false);
    }
  };

  // Load audit logs
  const loadAuditLogs = async () => {
    setAuditLogsError("");
    setAuditLogsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/audit-logs`, {
        headers: authHeaders(),
      });

      const data = await readResponse(response);

      if (!Array.isArray(data.auditLogs)) {
        throw new Error("Unexpected audit logs response.");
      }

      setAuditLogs(data.auditLogs);
    } catch (error) {
      setAuditLogsError(
        error instanceof Error
          ? error.message
          : "Could not load audit logs."
      );
    } finally {
      setAuditLogsLoading(false);
    }
  };

  // Verify audit integrity
  const verifyAuditLogs = async () => {
    setAuditLogsError("");
    setAuditVerificationLoading(true);
    setAuditVerification(null);

    try {
      const response = await fetch(
        `${API_URL}/api/audit-logs/verify`,
        {
          headers: authHeaders(),
        }
      );

      const data = await readResponse(response);
      setAuditVerification(data);
    } catch (error) {
      setAuditLogsError(
        error instanceof Error
          ? error.message
          : "Could not verify audit logs."
      );
    } finally {
      setAuditVerificationLoading(false);
    }
  };

  return (
    <div className="trustvault">
      <aside className="sidebar">
        <h2>🔐 TrustVault</h2>
        <p className="nav-label">WORKSPACE</p>

        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "nav-item active" : "nav-item"}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}

        <div className="sidebar-footer">
          Secure document management
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">TRUSTVAULT WORKSPACE</p>
            <h1>{activeTab}</h1>
          </div>
          <span className="status">● Connected to API</span>
        </header>

        <section className="panel">
          <h3>Login to TrustVault</h3>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleLogin();
            }}
          >
            <label style={{ display: "block", marginTop: "12px" }}>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@example.com"
                autoComplete="username"
                required
                style={{
                  display: "block",
                  width: "100%",
                  maxWidth: "500px",
                  padding: "12px",
                  marginTop: "8px",
                  boxSizing: "border-box",
                }}
              />
            </label>

            <label style={{ display: "block", marginTop: "12px" }}>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                style={{
                  display: "block",
                  width: "100%",
                  maxWidth: "500px",
                  padding: "12px",
                  marginTop: "8px",
                  boxSizing: "border-box",
                }}
              />
            </label>

            <button
              type="submit"
              disabled={loggingIn}
              style={{ marginTop: "16px", padding: "10px 18px" }}
            >
              {loggingIn ? "Logging in..." : "Login"}
            </button>
          </form>

          {loginMessage && (
            <p role="status" aria-live="polite">
              {loginMessage}
            </p>
          )}
        </section>

        {activeTab === "Dashboard" ? (
          <>
            <section className="welcome">
              <p className="eyebrow">WELCOME BACK</p>
              <h2>Your documents, protected.</h2>
              <p>
                Manage documents, control access, and review activity
                from one workspace.
              </p>
            </section>

            <section className="stats">
              <article className="stat-card">
                <span>Documents</span>
                <strong>{documents.length}</strong>
                <small>Documents available to your account</small>
              </article>

              <article className="stat-card">
                <span>Permissions</span>
                <strong>{permissionRows.length}</strong>
                <small>Permissions currently loaded</small>
              </article>

              <article className="stat-card">
                <span>Audit events</span>
                <strong>{auditLogs.length}</strong>
                <small>Audit events currently loaded</small>
              </article>
            </section>

            <section className="panel">
              <h3>Getting started</h3>
              <p>
                Open Documents to upload, view, and download your files.
              </p>
            </section>
          </>
        ) : activeTab === "Documents" ? (
          <>
            <section className="panel">
              <h2>Upload a document</h2>

              <label style={{ display: "block", marginTop: "12px" }}>
                Choose file
                <input
                  id="document-file-input"
                  type="file"
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] ?? null);
                    setUploadMessage("");
                  }}
                  style={{ display: "block", marginTop: "8px" }}
                />
              </label>

              <label style={{ display: "block", marginTop: "16px" }}>
                Category
                <input
                  type="text"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  maxLength={100}
                  placeholder="General"
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: "400px",
                    padding: "10px",
                    marginTop: "8px",
                    boxSizing: "border-box",
                  }}
                />
              </label>

              {selectedFile && (
                <p>
                  Selected: {selectedFile.name} (
                  {selectedFile.size.toLocaleString()} bytes)
                </p>
              )}

              <button
                type="button"
                onClick={() => void uploadDocument()}
                disabled={uploading || !selectedFile || !token.trim()}
                style={{ marginTop: "16px", padding: "10px 16px" }}
              >
                {uploading ? "Uploading..." : "Upload Document"}
              </button>

              {uploadMessage && (
                <p role="status">{uploadMessage}</p>
              )}
            </section>

            <section className="panel">
              <h2>Your Documents</h2>

              {!token.trim() ? (
                <p>Please log in to load your documents.</p>
              ) : documentsLoading ? (
                <p>Loading documents...</p>
              ) : documentsError ? (
                <p role="alert">Error loading documents: {documentsError}</p>
              ) : documents.length === 0 ? (
                <p>No documents found for this account.</p>
              ) : (
                <div className="document-list">
                  {documents.map((doc) => (
                    <article className="stat-card" key={doc.id}>
                      <strong>{doc.name}</strong>
                      <small>Category: {doc.category}</small>
                      <small>Type: {doc.mime_type}</small>
                      <small>
                        Size: {Number(doc.size_bytes).toLocaleString()} bytes
                      </small>

                      <button
                        type="button"
                        onClick={() => void downloadDocument(doc)}
                        disabled={downloadingId === doc.id}
                        style={{ marginTop: "12px", padding: "8px 12px" }}
                      >
                        {downloadingId === doc.id
                          ? "Downloading..."
                          : "Download"}
                      </button>
                    </article>
                  ))}
                </div>
              )}

              {downloadError && (
                <p role="alert">Download error: {downloadError}</p>
              )}
            </section>
          </>
        ) : activeTab === "Permissions" ? (
          <section className="panel">
            <h2>Document Permissions</h2>
            <p>Select a document and manage access for another user.</p>

            {!token.trim() ? (
              <p>Please log in first.</p>
            ) : documents.length === 0 ? (
              <p>Open the Documents tab first to load your documents.</p>
            ) : (
              <>
                <label style={{ display: "block", marginTop: "16px" }}>
                  Select document
                  <select
                    value={permissionDocumentId}
                    onChange={(event) => {
                      setPermissionDocumentId(event.target.value);
                      setPermissionRows([]);
                      setPermissionMessage("");
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      maxWidth: "500px",
                      padding: "10px",
                      marginTop: "8px",
                    }}
                  >
                    <option value="">-- Choose a document --</option>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "block", marginTop: "16px" }}>
                  User email
                  <input
                    type="email"
                    value={permissionEmail}
                    onChange={(event) =>
                      setPermissionEmail(event.target.value)
                    }
                    placeholder="viewer@example.com"
                    style={{
                      display: "block",
                      width: "100%",
                      maxWidth: "500px",
                      padding: "10px",
                      marginTop: "8px",
                      boxSizing: "border-box",
                    }}
                  />
                </label>

                <label style={{ display: "block", marginTop: "16px" }}>
                  Permission level
                  <select
                    value={permissionLevel}
                    onChange={(event) =>
                      setPermissionLevel(
                        event.target.value as "read" | "edit"
                      )
                    }
                    style={{
                      display: "block",
                      padding: "10px",
                      marginTop: "8px",
                    }}
                  >
                    <option value="read">Read — can view and download</option>
                    <option value="edit">
                      Edit — check backend support before relying on edit access
                    </option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => void grantPermission()}
                  disabled={
                    permissionLoading ||
                    !permissionDocumentId ||
                    !permissionEmail.trim()
                  }
                  style={{ marginTop: "16px", padding: "10px 16px" }}
                >
                  Grant Access
                </button>

                <button
                  type="button"
                  onClick={() => void loadPermissions()}
                  disabled={permissionLoading || !permissionDocumentId}
                  style={{
                    marginTop: "16px",
                    marginLeft: "8px",
                    padding: "10px 16px",
                  }}
                >
                  View Permissions
                </button>

                {permissionMessage && (
                  <p role="status" style={{ marginTop: "16px" }}>
                    {permissionMessage}
                  </p>
                )}

                <h3 style={{ marginTop: "24px" }}>Users with access</h3>

                {permissionRows.length === 0 ? (
                  <p>No permissions loaded yet. Click View Permissions.</p>
                ) : (
                  permissionRows.map((permission) => (
                    <article
                      className="stat-card"
                      key={permission.user_id}
                      style={{ marginTop: "12px" }}
                    >
                      <p>Email: {permission.email}</p>
                      <p>Access: {permission.permission}</p>
                      <button
                        type="button"
                        onClick={() =>
                          void revokePermission(permission.user_id)
                        }
                        disabled={permissionLoading}
                      >
                        Revoke Access
                      </button>
                    </article>
                  ))
                )}
              </>
            )}
          </section>
        ) : activeTab === "Audit Logs" ? (
          <section className="panel">
            <h2>Audit Logs</h2>
            <p>Review document activity and verify audit integrity.</p>

            {!token.trim() ? (
              <p>Please log in first.</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void loadAuditLogs()}
                  disabled={auditLogsLoading}
                >
                  {auditLogsLoading ? "Loading..." : "Load Audit Logs"}
                </button>

                <button
                  type="button"
                  onClick={() => void verifyAuditLogs()}
                  disabled={auditVerificationLoading}
                  style={{ marginLeft: "8px" }}
                >
                  {auditVerificationLoading
                    ? "Verifying..."
                    : "Verify Integrity"}
                </button>

                {auditLogsError && (
                  <p role="alert">{auditLogsError}</p>
                )}

                {auditVerification && (
                  <article className="stat-card" style={{ marginTop: "16px" }}>
                    <h3>Integrity Verification</h3>
                    <p>Status: {auditVerification.status ?? "Unknown"}</p>
                    <p>
                      Total events: {auditVerification.totalEvents ?? "—"}
                    </p>
                    <p>
                      Links valid:{" "}
                      {String(auditVerification.linksValid ?? "Unknown")}
                    </p>
                    <p>
                      Hashes valid:{" "}
                      {String(auditVerification.hashesValid ?? "Unknown")}
                    </p>
                    <p>
                      Integrity valid:{" "}
                      {String(auditVerification.integrityValid ?? "Unknown")}
                    </p>
                  </article>
                )}

                {auditLogsLoading ? (
                  <p>Loading audit records...</p>
                ) : auditLogs.length === 0 ? (
                  <p>No audit records loaded. Click Load Audit Logs.</p>
                ) : (
                  <div className="document-list">
                    {auditLogs.map((log) => (
                      <article className="stat-card" key={log.id}>
                        <strong>{log.action}</strong>
                        <p>Event ID: {log.id}</p>
                        <p>Actor ID: {log.actor_id}</p>
                        <p>Outcome: {log.outcome}</p>
                        <p>Document ID: {log.document_id ?? "—"}</p>
                        <p>
                          Target user ID: {log.target_user_id ?? "—"}
                        </p>
                        <p>
                          Time:{" "}
                          {new Date(log.occurred_at).toLocaleString()}
                        </p>
                        <p>Details: {JSON.stringify(log.details)}</p>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <section className="panel">
            <h2>{activeTab}</h2>
            <p>This section will be connected in a later step.</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;