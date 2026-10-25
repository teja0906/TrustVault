import React, { useEffect, useState } from "react";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:4000"
).replace(/\/+$/, "");

interface CurrentUser {
  id: string;
  email: string;
  role: "admin" | "owner" | "viewer";
}

interface DocumentItem {
  id: string;
  name: string;
  category: string;
  mime_type: string;
  size_bytes: number | string;
  created_at: string;
  updated_at: string;
  owner_id: string;
  owner_email?: string;
  user_permission: "owner" | "read" | "edit";
}

interface PermissionItem {
  user_id: string;
  email: string;
  permission: "read" | "edit";
  granted_at: string;
}

interface AuditLogItem {
  id: string | number;
  actor_id: string | null;
  actor_email?: string;
  action: string;
  document_id: string | null;
  document_name?: string;
  target_user_id: string | null;
  target_email?: string;
  outcome: "success" | "denied" | "failure";
  details: Record<string, unknown>;
  occurred_at: string;
}

interface VerificationResult {
  status: string;
  totalEvents: number;
  linksValid: boolean;
  hashesValid: boolean;
  integrityValid: boolean;
}

interface AdminUserItem {
  id: string;
  email: string;
  role: "admin" | "owner" | "viewer";
  created_at: string;
  document_count: number | string;
}

interface AdminSystemStats {
  totalUsers: number;
  admins: number;
  owners: number;
  viewers: number;
  totalDocuments: number;
  totalAuditEvents: number;
  storageMode: string;
}

async function apiRequest(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${API_URL}${path}`;
  const response = await fetch(url, options);
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
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }

  return data;
}

export function App() {
  // Authentication State
  const [token, setToken] = useState<string>(() => localStorage.getItem("tv_token") || "");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    const saved = localStorage.getItem("tv_user");
    return saved ? JSON.parse(saved) : null;
  });

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [roleInput, setRoleInput] = useState<"owner" | "viewer">("owner");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Workspace Navigation
  const [activeTab, setActiveTab] = useState<
    "Dashboard" | "MyDocuments" | "SharedWithMe" | "Permissions" | "AuditLogs" | "Profile" | "Admin"
  >("Dashboard");

  // Document Management State
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("General");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Edit Document Modal State
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Permissions State
  const [permissionDocId, setPermissionDocId] = useState("");
  const [permissionEmail, setPermissionEmail] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<"read" | "edit">("read");
  const [permissionList, setPermissionList] = useState<PermissionItem[]>([]);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);

  // Audit Logs & Integrity State
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditVerification, setAuditVerification] = useState<VerificationResult | null>(null);
  const [verifyingAudit, setVerifyingAudit] = useState(false);

  // Profile & Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [userStats, setUserStats] = useState<{ ownedDocuments: number; sharedDocuments: number } | null>(null);

  // Admin Panel State
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
  const [adminStats, setAdminStats] = useState<AdminSystemStats | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
  });

  // Handle Login & Registration
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);
    setAuthLoading(true);

    try {
      if (authMode === "login") {
        const data = await apiRequest("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailInput.trim(), password: passwordInput }),
        });

        setToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem("tv_token", data.token);
        localStorage.setItem("tv_user", JSON.stringify(data.user));
        setPasswordInput("");
        setAuthMessage({ type: "success", text: `Welcome back, ${data.user.email}!` });
        setActiveTab("Dashboard");
      } else {
        await apiRequest("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: emailInput.trim(),
            password: passwordInput,
            role: roleInput,
          }),
        });

        setAuthMessage({
          type: "success",
          text: "Registration successful! You can now log in with your credentials.",
        });
        setAuthMode("login");
        setPasswordInput("");
      }
    } catch (err: any) {
      setAuthMessage({ type: "error", text: err.message });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await apiRequest("/api/logout", {
          method: "POST",
          headers: authHeaders(),
        });
      } catch {
        // Continue logout even if server unreachable
      }
    }
    setToken("");
    setCurrentUser(null);
    localStorage.removeItem("tv_token");
    localStorage.removeItem("tv_user");
    setActiveTab("Dashboard");
  };

  // Load Documents
  const loadDocuments = async () => {
    if (!token) return;
    setDocsLoading(true);
    try {
      let query = "/api/documents?";
      if (searchQuery.trim()) query += `search=${encodeURIComponent(searchQuery.trim())}&`;
      if (selectedCategory !== "All") query += `category=${encodeURIComponent(selectedCategory)}&`;

      const data = await apiRequest(query, { headers: authHeaders() });
      setDocuments(data.documents || []);
    } catch (err: any) {
      console.error("Load documents error:", err);
    } finally {
      setDocsLoading(false);
    }
  };

  // Load Audit Logs
  const loadAuditLogs = async () => {
    if (!token) return;
    setAuditLoading(true);
    try {
      const data = await apiRequest("/api/audit-logs", { headers: authHeaders() });
      setAuditLogs(data.auditLogs || []);
    } catch (err: any) {
      console.error("Load audit error:", err);
    } finally {
      setAuditLoading(false);
    }
  };

  // Verify Audit Chain Integrity
  const handleVerifyAuditChain = async () => {
    if (!token) return;
    setVerifyingAudit(true);
    setAuditVerification(null);
    try {
      const data = await apiRequest("/api/audit-logs/verify", { headers: authHeaders() });
      setAuditVerification(data);
    } catch (err: any) {
      alert("Verification failed: " + err.message);
    } finally {
      setVerifyingAudit(false);
    }
  };

  // Upload Document
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedFile) return;

    setUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append("document", selectedFile);
    formData.append("category", uploadCategory.trim() || "General");

    try {
      const data = await apiRequest("/api/documents/upload", {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });

      setUploadStatus(`Document "${data.document.name}" uploaded successfully!`);
      setSelectedFile(null);
      const fileInput = document.getElementById("file-upload-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      await loadDocuments();
    } catch (err: any) {
      setUploadStatus(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Download Document
  const handleDownload = async (doc: DocumentItem) => {
    try {
      const response = await fetch(`${API_URL}/api/documents/${doc.id}/download`, {
        headers: authHeaders(),
      });

      if (!response.ok) {
        const text = await response.text();
        let msg = "Download failed.";
        try {
          msg = JSON.parse(text).message || msg;
        } catch {}
        alert(msg);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Download error: " + err.message);
    }
  };

  // Save Document Edits (Name & Category)
  const handleSaveEdit = async () => {
    if (!editingDoc) return;
    setEditSaving(true);
    try {
      await apiRequest(`/api/documents/${editingDoc.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), category: editCategory.trim() }),
      });
      setEditingDoc(null);
      await loadDocuments();
    } catch (err: any) {
      alert("Failed to update document: " + err.message);
    } finally {
      setEditSaving(false);
    }
  };

  // Delete Document
  const handleDeleteDocument = async (docId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This action is logged.`)) {
      return;
    }
    try {
      await apiRequest(`/api/documents/${docId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      await loadDocuments();
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  // Permissions Management
  const loadPermissionsForDoc = async (docId: string) => {
    if (!docId) return;
    setPermissionLoading(true);
    setPermissionStatus(null);
    try {
      const data = await apiRequest(`/api/documents/${docId}/permissions`, {
        headers: authHeaders(),
      });
      setPermissionList(data.permissions || []);
    } catch (err: any) {
      setPermissionStatus(`Could not load permissions: ${err.message}`);
    } finally {
      setPermissionLoading(false);
    }
  };

  const handleGrantPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissionDocId || !permissionEmail.trim()) return;

    setPermissionLoading(true);
    setPermissionStatus(null);
    try {
      const res = await apiRequest(`/api/documents/${permissionDocId}/permissions`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          email: permissionEmail.trim(),
          permission: permissionLevel,
        }),
      });
      setPermissionStatus(res.message);
      setPermissionEmail("");
      await loadPermissionsForDoc(permissionDocId);
    } catch (err: any) {
      setPermissionStatus(`Failed to grant permission: ${err.message}`);
    } finally {
      setPermissionLoading(false);
    }
  };

  const handleRevokePermission = async (userId: string, email: string) => {
    if (!window.confirm(`Revoke document access for ${email}?`)) return;

    setPermissionLoading(true);
    try {
      await apiRequest(`/api/documents/${permissionDocId}/permissions/${userId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      await loadPermissionsForDoc(permissionDocId);
      setPermissionStatus(`Access revoked for ${email}.`);
    } catch (err: any) {
      setPermissionStatus(`Failed to revoke access: ${err.message}`);
    } finally {
      setPermissionLoading(false);
    }
  };

  // User Profile & Password Change
  const loadUserProfile = async () => {
    if (!token) return;
    try {
      const data = await apiRequest("/api/user/profile", { headers: authHeaders() });
      setCurrentUser(data.user);
      setUserStats(data.stats);
    } catch (err) {
      console.error("Profile load error:", err);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);
    setPasswordLoading(true);
    try {
      const data = await apiRequest("/api/user/password", {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordStatus({ type: "success", text: data.message });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPasswordStatus({ type: "error", text: err.message });
    } finally {
      setPasswordLoading(false);
    }
  };

  // Admin Management
  const loadAdminData = async () => {
    if (!token || currentUser?.role !== "admin") return;
    setAdminLoading(true);
    try {
      const [usersData, statsData] = await Promise.all([
        apiRequest("/api/admin/users", { headers: authHeaders() }),
        apiRequest("/api/admin/system-stats", { headers: authHeaders() }),
      ]);
      setAdminUsers(usersData.users || []);
      setAdminStats(statsData.stats || null);
    } catch (err: any) {
      console.error("Admin data error:", err);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await apiRequest(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      await loadAdminData();
    } catch (err: any) {
      alert("Role update failed: " + err.message);
    }
  };

  // Tab change trigger
  useEffect(() => {
    if (token) {
      void loadDocuments();
      void loadUserProfile();
      if (activeTab === "AuditLogs") void loadAuditLogs();
      if (activeTab === "Admin") void loadAdminData();
    }
  }, [activeTab, token]);

  // If not logged in, render the Emerald Authentication Portal
  if (!token) {
    return (
      <div className="tv-app" style={{ alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div className="tv-panel" style={{ maxWidth: "440px", width: "100%", padding: "36px" }}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div className="tv-brand-icon" style={{ margin: "0 auto 16px auto", width: "48px", height: "48px" }}>
              🔐
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: "800", color: "#fff" }}>TrustVault</h1>
            <p style={{ color: "var(--emerald-primary)", fontSize: "13px", fontWeight: "600", marginTop: "4px" }}>
              SECURE DOCUMENT VAULT & AUDIT TRAIL
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", background: "var(--bg-panel)", padding: "4px", borderRadius: "8px" }}>
            <button
              type="button"
              className={`tv-btn ${authMode === "login" ? "tv-btn-primary" : "tv-btn-secondary"}`}
              style={{ flex: 1, padding: "8px" }}
              onClick={() => { setAuthMode("login"); setAuthMessage(null); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`tv-btn ${authMode === "register" ? "tv-btn-primary" : "tv-btn-secondary"}`}
              style={{ flex: 1, padding: "8px" }}
              onClick={() => { setAuthMode("register"); setAuthMessage(null); }}
            >
              Register
            </button>
          </div>

          {authMessage && (
            <div className={`tv-alert ${authMessage.type === "success" ? "tv-alert-success" : "tv-alert-error"}`} style={{ marginBottom: "16px" }}>
              {authMessage.text}
            </div>
          )}

          <form className="tv-form" onSubmit={handleAuthSubmit}>
            <div className="tv-form-group">
              <label>Email Address</label>
              <input
                type="email"
                required
                className="tv-input"
                placeholder="name@company.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
            </div>

            <div className="tv-form-group">
              <label>Password</label>
              <input
                type="password"
                required
                className="tv-input"
                placeholder={authMode === "register" ? "At least 12 characters" : "Enter your password"}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
              />
            </div>

            {authMode === "register" && (
              <div className="tv-form-group">
                <label>Requested Role</label>
                <select
                  className="tv-select"
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value as "owner" | "viewer")}
                >
                  <option value="owner">Owner — Upload, manage & share documents</option>
                  <option value="viewer">Viewer — Access explicitly shared documents</option>
                </select>
                <small style={{ color: "var(--text-dim)", fontSize: "11px", marginTop: "4px" }}>
                  Administrator role cannot be self-assigned.
                </small>
              </div>
            )}

            <button type="submit" className="tv-btn tv-btn-primary" style={{ marginTop: "8px" }} disabled={authLoading}>
              {authLoading ? "Processing..." : authMode === "login" ? "Sign In to Vault" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Filtered document subsets
  const ownedDocs = documents.filter((d) => d.user_permission === "owner");
  const sharedDocs = documents.filter((d) => d.user_permission !== "owner");

  return (
    <div className="tv-app">
      {/* Sidebar Navigation */}
      <aside className="tv-sidebar">
        <div className="tv-brand">
          <div className="tv-brand-icon">🔐</div>
          <div className="tv-brand-text">
            <h2>TrustVault</h2>
            <p>Private & Audited</p>
          </div>
        </div>

        <nav className="tv-nav">
          <div className="tv-nav-section-title">WORKSPACE</div>
          <button
            type="button"
            className={`tv-nav-btn ${activeTab === "Dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("Dashboard")}
          >
            <span>📊</span> Dashboard
          </button>
          <button
            type="button"
            className={`tv-nav-btn ${activeTab === "MyDocuments" ? "active" : ""}`}
            onClick={() => setActiveTab("MyDocuments")}
          >
            <span>📁</span> My Documents
            <span className="badge-pill">{ownedDocs.length}</span>
          </button>
          <button
            type="button"
            className={`tv-nav-btn ${activeTab === "SharedWithMe" ? "active" : ""}`}
            onClick={() => setActiveTab("SharedWithMe")}
          >
            <span>🔗</span> Shared With Me
            <span className="badge-pill">{sharedDocs.length}</span>
          </button>
          <button
            type="button"
            className={`tv-nav-btn ${activeTab === "Permissions" ? "active" : ""}`}
            onClick={() => setActiveTab("Permissions")}
          >
            <span>🛡️</span> Permissions
          </button>
          <button
            type="button"
            className={`tv-nav-btn ${activeTab === "AuditLogs" ? "active" : ""}`}
            onClick={() => setActiveTab("AuditLogs")}
          >
            <span>📜</span> Audit Trail
          </button>

          <div className="tv-nav-section-title">ACCOUNT</div>
          <button
            type="button"
            className={`tv-nav-btn ${activeTab === "Profile" ? "active" : ""}`}
            onClick={() => setActiveTab("Profile")}
          >
            <span>👤</span> Profile & Security
          </button>

          {currentUser?.role === "admin" && (
            <>
              <div className="tv-nav-section-title">ADMINISTRATION</div>
              <button
                type="button"
                className={`tv-nav-btn ${activeTab === "Admin" ? "active" : ""}`}
                onClick={() => setActiveTab("Admin")}
              >
                <span>⚙️</span> System Admin
              </button>
            </>
          )}
        </nav>

        <div className="tv-sidebar-footer">
          <div className="tv-user-pill">
            <div className="tv-user-avatar">
              {currentUser?.email.charAt(0).toUpperCase()}
            </div>
            <div className="tv-user-meta">
              <div className="tv-user-email">{currentUser?.email}</div>
              <div className="tv-user-role">{currentUser?.role}</div>
            </div>
          </div>
          <button type="button" className="tv-btn tv-btn-secondary tv-btn-sm" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="tv-main">
        <header className="tv-topbar">
          <div className="tv-topbar-title">
            <span>TRUSTVAULT ENVIRONMENT</span>
            <h1>
              {activeTab === "Dashboard" && "Overview & Statistics"}
              {activeTab === "MyDocuments" && "My Document Repository"}
              {activeTab === "SharedWithMe" && "Documents Shared With Me"}
              {activeTab === "Permissions" && "Sharing & Access Control"}
              {activeTab === "AuditLogs" && "Tamper-Evident Audit Trail"}
              {activeTab === "Profile" && "User Profile & Security Settings"}
              {activeTab === "Admin" && "System Administration"}
            </h1>
          </div>
          <div className="tv-topbar-status">
            <span className="status-dot"></span>
            Connected to API
          </div>
        </header>

        <div className="tv-content">
          {/* TAB: DASHBOARD */}
          {activeTab === "Dashboard" && (
            <>
              <div className="tv-stats-grid">
                <div className="tv-stat-card">
                  <span className="stat-label">Accessible Documents</span>
                  <span className="stat-value">{documents.length}</span>
                  <span className="stat-desc">Total documents in your repository</span>
                </div>
                <div className="tv-stat-card">
                  <span className="stat-label">Owned by You</span>
                  <span className="stat-value">{ownedDocs.length}</span>
                  <span className="stat-desc">Full ownership and sharing rights</span>
                </div>
                <div className="tv-stat-card">
                  <span className="stat-label">Shared with You</span>
                  <span className="stat-value">{sharedDocs.length}</span>
                  <span className="stat-desc">Granted by other team members</span>
                </div>
                <div className="tv-stat-card">
                  <span className="stat-label">Active Role</span>
                  <span className="stat-value" style={{ textTransform: "uppercase", fontSize: "24px" }}>
                    {currentUser?.role}
                  </span>
                  <span className="stat-desc">Server-enforced access boundary</span>
                </div>
              </div>

              <div className="tv-panel">
                <div className="tv-panel-header">
                  <h3>Quick Action Repository</h3>
                  <button
                    type="button"
                    className="tv-btn tv-btn-primary tv-btn-sm"
                    onClick={() => setActiveTab("MyDocuments")}
                  >
                    + Upload New Document
                  </button>
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                  TrustVault secures confidential files using isolated storage, fine-grained access control,
                  and SHA-256 cryptographic hash-chained audit trails.
                </p>
              </div>
            </>
          )}

          {/* TAB: MY DOCUMENTS */}
          {activeTab === "MyDocuments" && (
            <>
              {/* Document Upload Form */}
              <div className="tv-panel">
                <div className="tv-panel-header">
                  <h3>Upload Confidential Document</h3>
                </div>
                {uploadStatus && (
                  <div
                    className={`tv-alert ${uploadStatus.includes("successfully") ? "tv-alert-success" : "tv-alert-error"}`}
                  >
                    {uploadStatus}
                  </div>
                )}
                <form className="tv-form" onSubmit={handleUpload}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: "16px" }}>
                    <div className="tv-form-group">
                      <label>Select Document File (Max 10MB)</label>
                      <input
                        id="file-upload-input"
                        type="file"
                        className="tv-input"
                        required
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      />
                    </div>
                    <div className="tv-form-group">
                      <label>Classification Category</label>
                      <select
                        className="tv-select"
                        value={uploadCategory}
                        onChange={(e) => setUploadCategory(e.target.value)}
                      >
                        <option value="General">General</option>
                        <option value="Financial">Financial</option>
                        <option value="Legal">Legal</option>
                        <option value="Personal">Personal</option>
                        <option value="Confidential">Confidential</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <button type="submit" className="tv-btn tv-btn-primary" disabled={uploading || !selectedFile}>
                      {uploading ? "Encrypting & Uploading..." : "Upload Document"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Filter & Search Bar */}
              <div className="tv-panel">
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <input
                    type="text"
                    className="tv-input"
                    placeholder="Search documents by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <select
                    className="tv-select"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={{ width: "180px" }}
                  >
                    <option value="All">All Categories</option>
                    <option value="General">General</option>
                    <option value="Financial">Financial</option>
                    <option value="Legal">Legal</option>
                    <option value="Personal">Personal</option>
                    <option value="Confidential">Confidential</option>
                  </select>
                  <button type="button" className="tv-btn tv-btn-secondary" onClick={loadDocuments}>
                    Filter
                  </button>
                </div>

                {docsLoading ? (
                  <p style={{ color: "var(--text-muted)" }}>Loading repository documents...</p>
                ) : ownedDocs.length === 0 ? (
                  <p style={{ color: "var(--text-dim)", padding: "24px 0", textAlign: "center" }}>
                    No owned documents matching the filter criteria.
                  </p>
                ) : (
                  <div className="tv-table-wrapper">
                    <table className="tv-table">
                      <thead>
                        <tr>
                          <th>Document Name</th>
                          <th>Category</th>
                          <th>Size</th>
                          <th>Uploaded</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ownedDocs.map((doc) => (
                          <tr key={doc.id}>
                            <td style={{ fontWeight: 600 }}>{doc.name}</td>
                            <td>
                              <span className="tv-badge badge-owner">{doc.category}</span>
                            </td>
                            <td>{(Number(doc.size_bytes) / 1024).toFixed(1)} KB</td>
                            <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                            <td>
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button
                                  type="button"
                                  className="tv-btn tv-btn-secondary tv-btn-sm"
                                  onClick={() => handleDownload(doc)}
                                >
                                  ⬇ Download
                                </button>
                                <button
                                  type="button"
                                  className="tv-btn tv-btn-secondary tv-btn-sm"
                                  onClick={() => {
                                    setEditingDoc(doc);
                                    setEditName(doc.name);
                                    setEditCategory(doc.category);
                                  }}
                                >
                                  ✏ Edit
                                </button>
                                <button
                                  type="button"
                                  className="tv-btn tv-btn-danger tv-btn-sm"
                                  onClick={() => handleDeleteDocument(doc.id, doc.name)}
                                >
                                  🗑 Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB: SHARED WITH ME */}
          {activeTab === "SharedWithMe" && (
            <div className="tv-panel">
              <div className="tv-panel-header">
                <h3>Documents Shared With You</h3>
              </div>
              {sharedDocs.length === 0 ? (
                <p style={{ color: "var(--text-dim)", padding: "24px 0", textAlign: "center" }}>
                  No documents have been shared with your account yet.
                </p>
              ) : (
                <div className="tv-table-wrapper">
                  <table className="tv-table">
                    <thead>
                      <tr>
                        <th>Document Name</th>
                        <th>Owner</th>
                        <th>Category</th>
                        <th>Your Permission</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sharedDocs.map((doc) => (
                        <tr key={doc.id}>
                          <td style={{ fontWeight: 600 }}>{doc.name}</td>
                          <td style={{ color: "var(--text-muted)" }}>{doc.owner_email || "System User"}</td>
                          <td>
                            <span className="tv-badge badge-owner">{doc.category}</span>
                          </td>
                          <td>
                            <span className={`tv-badge ${doc.user_permission === "edit" ? "badge-edit" : "badge-read"}`}>
                              {doc.user_permission.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                type="button"
                                className="tv-btn tv-btn-secondary tv-btn-sm"
                                onClick={() => handleDownload(doc)}
                              >
                                ⬇ Download
                              </button>
                              {doc.user_permission === "edit" && (
                                <button
                                  type="button"
                                  className="tv-btn tv-btn-secondary tv-btn-sm"
                                  onClick={() => {
                                    setEditingDoc(doc);
                                    setEditName(doc.name);
                                    setEditCategory(doc.category);
                                  }}
                                >
                                  ✏ Edit
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: PERMISSIONS MANAGEMENT */}
          {activeTab === "Permissions" && (
            <div className="tv-panel">
              <div className="tv-panel-header">
                <h3>Document Access Control & Sharing</h3>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                Select an owned document to grant READ or EDIT access to another registered user, or revoke access immediately.
              </p>

              {permissionStatus && (
                <div
                  className={`tv-alert ${permissionStatus.includes("Success") || permissionStatus.includes("revoked") ? "tv-alert-success" : "tv-alert-info"}`}
                >
                  {permissionStatus}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="tv-form-group">
                  <label>Select Owned Document</label>
                  <select
                    className="tv-select"
                    value={permissionDocId}
                    onChange={(e) => {
                      setPermissionDocId(e.target.value);
                      void loadPermissionsForDoc(e.target.value);
                    }}
                  >
                    <option value="">-- Choose a document to inspect or share --</option>
                    {ownedDocs.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name} ({doc.category})
                      </option>
                    ))}
                  </select>
                </div>

                {permissionDocId && (
                  <>
                    <form className="tv-form" onSubmit={handleGrantPermission} style={{ background: "var(--bg-panel)", padding: "16px", borderRadius: "8px" }}>
                      <h4 style={{ color: "#fff", fontSize: "14px", fontWeight: "600" }}>Grant New Access</h4>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px 140px", gap: "12px" }}>
                        <input
                          type="email"
                          required
                          className="tv-input"
                          placeholder="recipient@example.com"
                          value={permissionEmail}
                          onChange={(e) => setPermissionEmail(e.target.value)}
                        />
                        <select
                          className="tv-select"
                          value={permissionLevel}
                          onChange={(e) => setPermissionLevel(e.target.value as "read" | "edit")}
                        >
                          <option value="read">READ — View & Download</option>
                          <option value="edit">EDIT — View, Download & Update</option>
                        </select>
                        <button type="submit" className="tv-btn tv-btn-primary" disabled={permissionLoading}>
                          Grant
                        </button>
                      </div>
                    </form>

                    <div>
                      <h4 style={{ color: "#fff", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                        Active Permissions for this Document
                      </h4>
                      {permissionList.length === 0 ? (
                        <p style={{ color: "var(--text-dim)", fontSize: "13px" }}>
                          No external users have been granted access to this document.
                        </p>
                      ) : (
                        <div className="tv-table-wrapper">
                          <table className="tv-table">
                            <thead>
                              <tr>
                                <th>Recipient Email</th>
                                <th>Access Level</th>
                                <th>Granted At</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {permissionList.map((p) => (
                                <tr key={p.user_id}>
                                  <td style={{ fontWeight: 600 }}>{p.email}</td>
                                  <td>
                                    <span className={`tv-badge ${p.permission === "edit" ? "badge-edit" : "badge-read"}`}>
                                      {p.permission.toUpperCase()}
                                    </span>
                                  </td>
                                  <td>{new Date(p.granted_at).toLocaleString()}</td>
                                  <td>
                                    <button
                                      type="button"
                                      className="tv-btn tv-btn-danger tv-btn-sm"
                                      onClick={() => handleRevokePermission(p.user_id, p.email)}
                                      disabled={permissionLoading}
                                    >
                                      Revoke Access
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB: AUDIT LOGS & INTEGRITY VERIFICATION */}
          {activeTab === "AuditLogs" && (
            <div className="tv-panel">
              <div className="tv-panel-header">
                <div>
                  <h3>Cryptographic Audit Trail</h3>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Every document access, upload, grant, and revocation is recorded with a SHA-256 hash chain.
                  </span>
                </div>
                <button
                  type="button"
                  className="tv-btn tv-btn-primary tv-btn-sm"
                  onClick={handleVerifyAuditChain}
                  disabled={verifyingAudit}
                >
                  {verifyingAudit ? "Computing Chain..." : "🛡️ Verify Chain Integrity"}
                </button>
              </div>

              {auditVerification && (
                <div
                  className={`tv-alert ${auditVerification.integrityValid ? "tv-alert-success" : "tv-alert-error"}`}
                  style={{ display: "flex", flexDirection: "column", gap: "6px" }}
                >
                  <strong>
                    {auditVerification.integrityValid
                      ? "✓ Hash Chain Integrity Verified Successfully"
                      : "⚠ Tampering Detected in Audit Log Chain"}
                  </strong>
                  <span style={{ fontSize: "12px" }}>
                    Total Events Verified: {auditVerification.totalEvents} | Link Hashes Valid:{" "}
                    {String(auditVerification.linksValid)} | Event Payload Hashes Valid:{" "}
                    {String(auditVerification.hashesValid)}
                  </span>
                </div>
              )}

              {auditLoading ? (
                <p style={{ color: "var(--text-muted)" }}>Loading audit entries...</p>
              ) : auditLogs.length === 0 ? (
                <p style={{ color: "var(--text-dim)", padding: "24px 0", textAlign: "center" }}>
                  No audit logs recorded for your account.
                </p>
              ) : (
                <div className="tv-table-wrapper">
                  <table className="tv-table">
                    <thead>
                      <tr>
                        <th>Event ID</th>
                        <th>Action</th>
                        <th>Actor</th>
                        <th>Document</th>
                        <th>Outcome</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td style={{ color: "var(--text-dim)", fontFamily: "monospace" }}>#{log.id}</td>
                          <td style={{ fontWeight: 600 }}>{log.action}</td>
                          <td style={{ color: "var(--text-muted)" }}>{log.actor_email || log.actor_id || "System"}</td>
                          <td>{log.document_name || (log.document_id ? log.document_id.slice(0, 8) + "..." : "—")}</td>
                          <td>
                            <span className={`tv-badge badge-${log.outcome}`}>
                              {log.outcome.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ fontSize: "12px" }}>{new Date(log.occurred_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: PROFILE & SECURITY */}
          {activeTab === "Profile" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              <div className="tv-panel">
                <div className="tv-panel-header">
                  <h3>User Profile</h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>
                      Email Address
                    </label>
                    <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff" }}>
                      {currentUser?.email}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>
                      Account Role
                    </label>
                    <div>
                      <span className="tv-badge badge-owner">{currentUser?.role.toUpperCase()}</span>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>
                      Repository Footprint
                    </label>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                      {userStats ? (
                        <>Owned: {userStats.ownedDocuments} documents | Shared: {userStats.sharedDocuments} documents</>
                      ) : (
                        "Loading metrics..."
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="tv-panel">
                <div className="tv-panel-header">
                  <h3>Change Password</h3>
                </div>
                {passwordStatus && (
                  <div
                    className={`tv-alert ${passwordStatus.type === "success" ? "tv-alert-success" : "tv-alert-error"}`}
                  >
                    {passwordStatus.text}
                  </div>
                )}
                <form className="tv-form" onSubmit={handlePasswordChange}>
                  <div className="tv-form-group">
                    <label>Current Password</label>
                    <input
                      type="password"
                      required
                      className="tv-input"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  <div className="tv-form-group">
                    <label>New Password (Min 12 characters)</label>
                    <input
                      type="password"
                      required
                      className="tv-input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="tv-btn tv-btn-primary" disabled={passwordLoading}>
                    {passwordLoading ? "Updating..." : "Update Password"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB: SYSTEM ADMIN (Admin Only) */}
          {activeTab === "Admin" && currentUser?.role === "admin" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {adminStats && (
                <div className="tv-stats-grid">
                  <div className="tv-stat-card">
                    <span className="stat-label">Total Users</span>
                    <span className="stat-value">{adminStats.totalUsers}</span>
                    <span className="stat-desc">Admins: {adminStats.admins} | Owners: {adminStats.owners}</span>
                  </div>
                  <div className="tv-stat-card">
                    <span className="stat-label">System Documents</span>
                    <span className="stat-value">{adminStats.totalDocuments}</span>
                    <span className="stat-desc">Active repository files</span>
                  </div>
                  <div className="tv-stat-card">
                    <span className="stat-label">Audit Chain Length</span>
                    <span className="stat-value">{adminStats.totalAuditEvents}</span>
                    <span className="stat-desc">Chained cryptographic events</span>
                  </div>
                  <div className="tv-stat-card">
                    <span className="stat-label">Storage Engine</span>
                    <span className="stat-value" style={{ textTransform: "uppercase", fontSize: "20px" }}>
                      {adminStats.storageMode}
                    </span>
                    <span className="stat-desc">Active backend storage provider</span>
                  </div>
                </div>
              )}

              <div className="tv-panel">
                <div className="tv-panel-header">
                  <h3>Registered User Directory & Roles</h3>
                </div>
                {adminLoading ? (
                  <p style={{ color: "var(--text-muted)" }}>Loading users...</p>
                ) : (
                  <div className="tv-table-wrapper">
                    <table className="tv-table">
                      <thead>
                        <tr>
                          <th>User Email</th>
                          <th>Current Role</th>
                          <th>Documents</th>
                          <th>Registered</th>
                          <th>Manage Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((u) => (
                          <tr key={u.id}>
                            <td style={{ fontWeight: 600 }}>{u.email}</td>
                            <td>
                              <span className={`tv-badge badge-${u.role}`}>{u.role.toUpperCase()}</span>
                            </td>
                            <td>{u.document_count}</td>
                            <td>{new Date(u.created_at).toLocaleDateString()}</td>
                            <td>
                              <select
                                className="tv-select"
                                value={u.role}
                                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                style={{ padding: "4px 8px", fontSize: "12px", width: "120px" }}
                              >
                                <option value="admin">Admin</option>
                                <option value="owner">Owner</option>
                                <option value="viewer">Viewer</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Edit Document Metadata Modal */}
      {editingDoc && (
        <div className="tv-modal-backdrop" onClick={() => setEditingDoc(null)}>
          <div className="tv-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: "#fff", fontSize: "18px", fontWeight: "700" }}>Edit Document Metadata</h3>
            <div className="tv-form-group">
              <label>Document Name</label>
              <input
                type="text"
                className="tv-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="tv-form-group">
              <label>Classification Category</label>
              <select
                className="tv-select"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
              >
                <option value="General">General</option>
                <option value="Financial">Financial</option>
                <option value="Legal">Legal</option>
                <option value="Personal">Personal</option>
                <option value="Confidential">Confidential</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "12px" }}>
              <button
                type="button"
                className="tv-btn tv-btn-secondary"
                onClick={() => setEditingDoc(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tv-btn tv-btn-primary"
                onClick={handleSaveEdit}
                disabled={editSaving}
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
