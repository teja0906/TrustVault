import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../app";
import { pool } from "../db";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "0111f6f50abccf5855a80f257fa6b647c1f4a062dcce4ebdff40df54386edc96f3a3abf4f5733db6987f4cb716128d79";

function createTestToken(userId: string, email: string, role: string): string {
  return jwt.sign({ email, role }, JWT_SECRET, {
    subject: userId,
    expiresIn: "1h",
    issuer: "trustvault-api",
    audience: "trustvault-client",
  });
}

// Fixed UUIDs for test users
const OWNER_ID = "cdcdf756-70f5-403d-9563-523c442b7255";
const VIEWER_ID = "4362b5c4-eef7-4ad9-b4f5-135832dd046b";
const ADMIN_ID = "11111111-1111-1111-1111-111111111111";

const ownerToken = createTestToken(OWNER_ID, "owner@example.com", "owner");
const viewerToken = createTestToken(VIEWER_ID, "viewer@example.com", "viewer");
const adminToken = createTestToken(ADMIN_ID, "admin@trustvault.local", "admin");

describe("TrustVault Comprehensive Security & Access Control Suite", () => {
  describe("Health & System Status", () => {
    it("should return the API health status and storage mode", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.application).toBe("TrustVault API");
      expect(res.body.storageMode).toBeDefined();
    });
  });

  describe("Authentication Gateways & Input Validation", () => {
    it("should reject requests without a token for documents", async () => {
      const res = await request(app).get("/api/documents");
      expect(res.status).toBe(401);
      expect(res.body.status).toBe("error");
    });

    it("should reject requests without a token for audit logs", async () => {
      const res = await request(app).get("/api/audit-logs");
      expect(res.status).toBe(401);
      expect(res.body.status).toBe("error");
    });

    it("should reject requests without a token for user profile", async () => {
      const res = await request(app).get("/api/user/profile");
      expect(res.status).toBe(401);
    });

    it("should return user profile and statistics when authorized", async () => {
      const res = await request(app)
        .get("/api/user/profile")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.user).toBeDefined();
      expect(res.body.stats).toBeDefined();
      expect(typeof res.body.stats.ownedDocuments).toBe("number");
    });

    it("should reject login attempts with invalid credentials", async () => {
      const res = await request(app)
        .post("/api/login")
        .send({ email: "nonexistent@example.com", password: "WrongPassword123!" });
      expect(res.status).toBe(401);
      expect(res.body.message).toContain("Invalid email or password");
    });

    it("should reject registration attempts with self-assigned admin privileges", async () => {
      const res = await request(app).post("/api/register").send({
        email: "hacker@example.com",
        password: "SuperSecret1234!",
        role: "admin",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("valid role (owner or viewer)");
    });

    it("should reject passwords shorter than 12 characters", async () => {
      const res = await request(app).post("/api/register").send({
        email: "shortpass@example.com",
        password: "short",
        role: "viewer",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("12–72 characters");
    });

    it("should reject password change when current password is invalid", async () => {
      const res = await request(app)
        .put("/api/user/password")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          currentPassword: "IncorrectOldPassword123!",
          newPassword: "BrandNewSecurePassword2026!",
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Current password is incorrect");
    });
  });

  describe("Role-Based Access Control (RBAC) & Administrative Boundaries", () => {
    it("should forbid non-admin users from accessing administrative user lists", async () => {
      const resViewer = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${viewerToken}`);
      expect(resViewer.status).toBe(403);
      expect(resViewer.body.message).toContain("Forbidden");

      const resOwner = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(resOwner.status).toBe(403);
    });

    it("should allow administrators to access system metrics", async () => {
      const res = await request(app)
        .get("/api/admin/system-stats")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.totalUsers).toBeGreaterThanOrEqual(1);
    });

    it("should forbid viewers from viewing document permissions", async () => {
      const fakeDocId = "b2a75871-3c5e-4bb5-a3d8-5b1285038ec1";
      const res = await request(app)
        .get(`/api/documents/${fakeDocId}/permissions`)
        .set("Authorization", `Bearer ${viewerToken}`);
      expect([403, 404]).toContain(res.status);
    });

    it("should forbid viewers from modifying document metadata", async () => {
      const fakeDocId = "b2a75871-3c5e-4bb5-a3d8-5b1285038ec1";
      const res = await request(app)
        .patch(`/api/documents/${fakeDocId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ name: "RenamedByViewer.pdf" });
      expect([403, 404]).toContain(res.status);
    });

    it("should forbid viewers from deleting documents", async () => {
      const fakeDocId = "b2a75871-3c5e-4bb5-a3d8-5b1285038ec1";
      const res = await request(app)
        .delete(`/api/documents/${fakeDocId}`)
        .set("Authorization", `Bearer ${viewerToken}`);
      expect([403, 404]).toContain(res.status);
    });
  });

  describe("File Upload Restrictions & Validation", () => {
    it("should reject uploading unauthorized or executable file extensions", async () => {
      const res = await request(app)
        .post("/api/documents/upload")
        .set("Authorization", `Bearer ${ownerToken}`)
        .attach("document", Buffer.from("malicious binary content"), "payload.exe");
      expect([400, 500]).toContain(res.status);
    });

    it("should reject upload requests without any attached file", async () => {
      const res = await request(app)
        .post("/api/documents/upload")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Please select a file");
    });
  });

  describe("Document Lifecycle & Permission Sharing Flow", () => {
    let uploadedDocId: string;

    it("should allow an owner to upload a valid text document", async () => {
      const res = await request(app)
        .post("/api/documents/upload")
        .set("Authorization", `Bearer ${ownerToken}`)
        .field("category", "Confidential")
        .attach("document", Buffer.from("Sensitive legal report"), "annual_report.txt");

      expect(res.status).toBe(201);
      expect(res.body.document).toBeDefined();
      expect(res.body.document.name).toBe("annual_report.txt");
      expect(res.body.document.category).toBe("Confidential");
      uploadedDocId = res.body.document.id;
    });

    it("should allow the owner to view permissions of the uploaded document", async () => {
      const res = await request(app)
        .get(`/api/documents/${uploadedDocId}/permissions`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.permissions)).toBe(true);
    });

    it("should prevent viewer from downloading document before permission is granted", async () => {
      const res = await request(app)
        .get(`/api/documents/${uploadedDocId}/download`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("Forbidden");
    });

    it("should allow owner to grant READ permission to the viewer", async () => {
      const res = await request(app)
        .post(`/api/documents/${uploadedDocId}/permissions`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: "viewer@example.com", permission: "read" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("should allow viewer to download document after READ permission is granted", async () => {
      const res = await request(app)
        .get(`/api/documents/${uploadedDocId}/download`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.text).toBe("Sensitive legal report");
    });

    it("should prevent viewer with READ permission from modifying document metadata", async () => {
      const res = await request(app)
        .patch(`/api/documents/${uploadedDocId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ name: "HackedName.txt" });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("You require EDIT permission");
    });

    it("should allow owner to upgrade viewer permission to EDIT", async () => {
      const res = await request(app)
        .post(`/api/documents/${uploadedDocId}/permissions`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: "viewer@example.com", permission: "edit" });

      expect(res.status).toBe(200);
    });

    it("should allow viewer with EDIT permission to modify document metadata", async () => {
      const res = await request(app)
        .patch(`/api/documents/${uploadedDocId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ name: "annual_report_v2.txt", category: "Legal" });

      expect(res.status).toBe(200);
      expect(res.body.document.name).toBe("annual_report_v2.txt");
      expect(res.body.document.category).toBe("Legal");
    });

    it("should allow owner to revoke sharing permission from the viewer", async () => {
      const res = await request(app)
        .delete(`/api/documents/${uploadedDocId}/permissions/${VIEWER_ID}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("revoked");
    });

    it("should immediately deny download to the viewer after revocation", async () => {
      const res = await request(app)
        .get(`/api/documents/${uploadedDocId}/download`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("Forbidden");
    });

    it("should allow owner to delete the document", async () => {
      const res = await request(app)
        .delete(`/api/documents/${uploadedDocId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("deleted successfully");
    });

    it("should not return deleted document in subsequent queries", async () => {
      const res = await request(app)
        .get(`/api/documents/${uploadedDocId}/download`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("Audit Trail & Integrity Verification", () => {
    it("should verify audit chain integrity and link validity across all recorded events", async () => {
      const res = await request(app)
        .get("/api/audit-logs/verify")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.hashRecalculationImplemented).toBe(true);
      expect(res.body.linksValid).toBe(true);
      expect(res.body.hashesValid).toBe(true);
      expect(res.body.integrityValid).toBe(true);
      expect(res.body.totalEvents).toBeGreaterThan(0);
    });
  });
});
