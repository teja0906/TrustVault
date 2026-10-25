import { Router, type Response } from "express";
import { pool } from "../db";
import { writeAuditEvent } from "../services/audit";
import { getStorageMode } from "../services/storage";
import {
  authenticateToken,
  requireRole,
  type AuthenticatedRequest,
} from "../middleware/auth";

const router = Router();

// All routes in this router require ADMIN role
router.use(authenticateToken, requireRole("admin"));

// List all registered users
router.get("/users", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.role,
         u.created_at,
         (SELECT COUNT(*) FROM documents d WHERE d.owner_id = u.id AND d.deleted_at IS NULL) AS document_count
       FROM app_users u
       ORDER BY u.created_at ASC`
    );

    return res.json({
      status: "ok",
      users: result.rows,
    });
  } catch (error) {
    console.error("Failed to load users for admin:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to load user list.",
    });
  }
});

// Update user role (e.g. promote to admin, change owner to viewer)
router.patch("/users/:id/role", async (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id ?? "");
  const adminId = req.user!.id;
  const { role } = req.body ?? {};

  if (!["admin", "owner", "viewer"].includes(role)) {
    return res.status(400).json({
      status: "error",
      message: "Valid roles are 'admin', 'owner', or 'viewer'.",
    });
  }

  try {
    // If admin is modifying their own role away from admin, verify there is at least one other admin
    if (targetUserId === adminId && role !== "admin") {
      const adminCountRes = await pool.query(
        `SELECT COUNT(*) FROM app_users WHERE role = 'admin'`
      );
      if (Number(adminCountRes.rows[0]?.count || 0) <= 1) {
        return res.status(400).json({
          status: "error",
          message: "Cannot remove your own admin status as you are the only administrator.",
        });
      }
    }

    const updateRes = await pool.query(
      `UPDATE app_users
       SET role = $1
       WHERE id = $2
       RETURNING id, email, role`,
      [role, targetUserId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "User not found.",
      });
    }

    const updatedUser = updateRes.rows[0];

    await writeAuditEvent({
      actorId: adminId,
      action: "admin_user_role_updated",
      targetUserId,
      outcome: "success",
      details: { newRole: role, targetEmail: updatedUser.email },
    });

    return res.json({
      status: "ok",
      message: `User ${updatedUser.email} role updated to ${role}.`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Failed to update user role:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to update user role.",
    });
  }
});

// System Overview & Metrics
router.get("/system-stats", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const statsRes = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM app_users) AS total_users,
        (SELECT COUNT(*) FROM app_users WHERE role = 'admin') AS admin_users,
        (SELECT COUNT(*) FROM app_users WHERE role = 'owner') AS owner_users,
        (SELECT COUNT(*) FROM app_users WHERE role = 'viewer') AS viewer_users,
        (SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL) AS total_documents,
        (SELECT COUNT(*) FROM audit_events) AS total_audit_events
    `);

    const stats = statsRes.rows[0];

    return res.json({
      status: "ok",
      stats: {
        totalUsers: Number(stats.total_users || 0),
        admins: Number(stats.admin_users || 0),
        owners: Number(stats.owner_users || 0),
        viewers: Number(stats.viewer_users || 0),
        totalDocuments: Number(stats.total_documents || 0),
        totalAuditEvents: Number(stats.total_audit_events || 0),
        storageMode: getStorageMode(),
      },
    });
  } catch (error) {
    console.error("Failed to load admin stats:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to load system stats.",
    });
  }
});

export default router;
