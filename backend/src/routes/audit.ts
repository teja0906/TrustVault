import { Router, type Response } from "express";
import { pool } from "../db";
import { verifyAuditChain } from "../services/audit";
import {
  authenticateToken,
  type AuthenticatedRequest,
} from "../middleware/auth";

const router = Router();

// Retrieve Audit Logs (Authenticated, role-scoped)
router.get(
  "/",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      let query: string;
      let params: any[];

      if (role === "admin") {
        query = `
          SELECT
            a.id,
            a.actor_id,
            u.email AS actor_email,
            a.action,
            a.document_id,
            d.name AS document_name,
            a.target_user_id,
            tu.email AS target_email,
            a.outcome,
            a.details,
            a.occurred_at,
            a.previous_hash,
            a.event_hash
          FROM audit_events a
          LEFT JOIN app_users u ON u.id = a.actor_id
          LEFT JOIN app_users tu ON tu.id = a.target_user_id
          LEFT JOIN documents d ON d.id = a.document_id
          ORDER BY a.id DESC
          LIMIT 200
        `;
        params = [];
      } else {
        query = `
          SELECT
            a.id,
            a.actor_id,
            u.email AS actor_email,
            a.action,
            a.document_id,
            d.name AS document_name,
            a.target_user_id,
            tu.email AS target_email,
            a.outcome,
            a.details,
            a.occurred_at,
            a.previous_hash,
            a.event_hash
          FROM audit_events a
          LEFT JOIN app_users u ON u.id = a.actor_id
          LEFT JOIN app_users tu ON tu.id = a.target_user_id
          LEFT JOIN documents d ON d.id = a.document_id
          WHERE
            a.actor_id = $1
            OR a.target_user_id = $1
            OR EXISTS (
              SELECT 1 FROM documents doc
              WHERE doc.id = a.document_id AND doc.owner_id = $1
            )
          ORDER BY a.id DESC
          LIMIT 100
        `;
        params = [userId];
      }

      const result = await pool.query(query, params);

      return res.json({
        status: "ok",
        auditLogs: result.rows,
      });
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch audit logs.",
      });
    }
  }
);

// Verify Tamper-Evident Hash Chain Integrity
router.get(
  "/verify",
  authenticateToken,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const verification = await verifyAuditChain();
      return res.json(verification);
    } catch (error) {
      console.error("Audit verification failed:", error);
      return res.status(500).json({
        status: "error",
        message: "Could not verify audit log chain.",
      });
    }
  }
);

export default router;
