import { Router, type Response } from "express";
import { pool } from "../db";
import { writeAuditEvent } from "../services/audit";
import {
  authenticateToken,
  type AuthenticatedRequest,
} from "../middleware/auth";

const router = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// View Document Permissions (Owner or Admin only)
router.get(
  "/:id/permissions",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id ?? "");
    const userId = req.user!.id;
    const role = req.user!.role;

    if (!UUID_REGEX.test(documentId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid document ID format.",
      });
    }

    try {
      const docRes = await pool.query(
        `SELECT id, owner_id FROM documents WHERE id = $1 AND deleted_at IS NULL`,
        [documentId]
      );

      if (docRes.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Document not found.",
        });
      }

      const doc = docRes.rows[0];
      const isOwner = doc.owner_id === userId;
      const isAdmin = role === "admin";

      if (!isOwner && !isAdmin) {
        await writeAuditEvent({
          actorId: userId,
          action: "unauthorized_permission_view",
          documentId,
          outcome: "denied",
        });

        return res.status(403).json({
          status: "error",
          message: "Forbidden: Only the document owner or an administrator can view permissions.",
        });
      }

      const result = await pool.query(
        `SELECT
           p.user_id,
           u.email,
           p.permission,
           p.granted_at
         FROM document_permissions p
         JOIN app_users u ON u.id = p.user_id
         WHERE p.document_id = $1
         ORDER BY p.granted_at DESC`,
        [documentId]
      );

      return res.json({
        status: "ok",
        permissions: result.rows,
      });
    } catch (error) {
      console.error("Fetch permissions failed:", error);
      return res.status(500).json({
        status: "error",
        message: "Could not fetch document permissions.",
      });
    }
  }
);

// Grant or Update Document Permission (Owner or Admin only)
router.post(
  "/:id/permissions",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id ?? "");
    const ownerId = req.user!.id;
    const role = req.user!.role;
    const { email, permission } = req.body ?? {};

    if (
      !UUID_REGEX.test(documentId) ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      !["read", "edit"].includes(permission)
    ) {
      return res.status(400).json({
        status: "error",
        message: "Provide a valid document ID, user email, and permission ('read' or 'edit').",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verify ownership
      const docRes = await client.query(
        `SELECT id, owner_id FROM documents
         WHERE id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [documentId]
      );

      if (docRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          status: "error",
          message: "Document not found.",
        });
      }

      const doc = docRes.rows[0];
      const isOwner = doc.owner_id === ownerId;
      const isAdmin = role === "admin";

      if (!isOwner && !isAdmin) {
        await client.query("ROLLBACK");
        await writeAuditEvent({
          actorId: ownerId,
          action: "unauthorized_permission_grant",
          documentId,
          outcome: "denied",
        });

        return res.status(403).json({
          status: "error",
          message: "Forbidden: Only the document owner can grant sharing permissions.",
        });
      }

      const targetRes = await client.query(
        `SELECT id, email FROM app_users WHERE email = $1`,
        [email.trim().toLowerCase()]
      );

      if (targetRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          status: "error",
          message: "No user found with the provided email address.",
        });
      }

      const targetUser = targetRes.rows[0];

      if (targetUser.id === doc.owner_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          status: "error",
          message: "Cannot grant sharing permissions to the document owner.",
        });
      }

      await client.query(
        `INSERT INTO document_permissions
          (document_id, user_id, permission, granted_by, granted_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (document_id, user_id)
         DO UPDATE SET
           permission = EXCLUDED.permission,
           granted_by = EXCLUDED.granted_by,
           granted_at = NOW()`,
        [documentId, targetUser.id, permission, ownerId]
      );

      await client.query("COMMIT");

      await writeAuditEvent({
        actorId: ownerId,
        action: "permission_granted",
        documentId,
        targetUserId: targetUser.id,
        outcome: "success",
        details: {
          targetEmail: targetUser.email,
          permission,
        },
      });

      return res.json({
        status: "ok",
        message: `Successfully granted ${permission.toUpperCase()} permission to ${targetUser.email}.`,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Grant permission failed:", error);
      return res.status(500).json({
        status: "error",
        message: "Could not grant document permission.",
      });
    } finally {
      client.release();
    }
  }
);

// Revoke Document Permission (Owner or Admin only)
router.delete(
  "/:id/permissions/:userId",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id ?? "");
    const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : String(req.params.userId ?? "");
    const ownerId = req.user!.id;
    const role = req.user!.role;

    if (!UUID_REGEX.test(documentId) || !UUID_REGEX.test(targetUserId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid document ID or user ID format.",
      });
    }

    try {
      const docRes = await pool.query(
        `SELECT id, owner_id FROM documents WHERE id = $1 AND deleted_at IS NULL`,
        [documentId]
      );

      if (docRes.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Document not found.",
        });
      }

      const doc = docRes.rows[0];
      const isOwner = doc.owner_id === ownerId;
      const isAdmin = role === "admin";

      if (!isOwner && !isAdmin) {
        await writeAuditEvent({
          actorId: ownerId,
          action: "unauthorized_permission_revoke",
          documentId,
          targetUserId,
          outcome: "denied",
        });

        return res.status(403).json({
          status: "error",
          message: "Forbidden: Only the document owner can revoke permissions.",
        });
      }

      const deleteRes = await pool.query(
        `DELETE FROM document_permissions
         WHERE document_id = $1 AND user_id = $2
         RETURNING document_id`,
        [documentId, targetUserId]
      );

      if (deleteRes.rowCount === 0) {
        return res.status(404).json({
          status: "error",
          message: "Permission record not found.",
        });
      }

      await writeAuditEvent({
        actorId: ownerId,
        action: "permission_revoked",
        documentId,
        targetUserId,
        outcome: "success",
        details: { message: "Permission revoked immediately." },
      });

      return res.json({
        status: "ok",
        message: "Document permission revoked successfully.",
      });
    } catch (error) {
      console.error("Revoke permission failed:", error);
      return res.status(500).json({
        status: "error",
        message: "Could not revoke document permission.",
      });
    }
  }
);

export default router;
