import { Router, type Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { writeAuditEvent } from "../services/audit";
import {
  authenticateToken,
  authRateLimiter,
  type AuthenticatedRequest,
} from "../middleware/auth";

const router = Router();

// User Registration (Public, rate-limited)
router.post(
  "/register",
  authRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, password, role } = req.body ?? {};

      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        password.length < 12 ||
        password.length > 72 ||
        !["owner", "viewer"].includes(role)
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "Provide a valid email, a password of 12–72 characters, and a valid role (owner or viewer).",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      if (
        normalizedEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      ) {
        return res.status(400).json({
          status: "error",
          message: "Provide a valid email address.",
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await pool.query(
        `INSERT INTO app_users (email, password_hash, role)
         VALUES ($1, $2, $3)
         RETURNING id, email, role, created_at`,
        [normalizedEmail, passwordHash, role]
      );

      const newUser = result.rows[0];

      await writeAuditEvent({
        actorId: newUser.id,
        action: "user_registered",
        outcome: "success",
        details: {
          email: newUser.email,
          role: newUser.role,
        },
      });

      return res.status(201).json({
        status: "ok",
        message: "Registration successful. You can now log in.",
        user: newUser,
      });
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(409).json({
          status: "error",
          message: "An account with this email already exists.",
        });
      }

      console.error("Registration failed:", error.message);
      return res.status(500).json({
        status: "error",
        message: "Registration failed.",
      });
    }
  }
);

// User Login (Public, rate-limited)
router.post(
  "/login",
  authRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      password.length === 0 ||
      password.length > 72
    ) {
      return res.status(400).json({
        status: "error",
        message: "Provide a valid email and password.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const result = await pool.query(
        `SELECT id, email, password_hash, role
         FROM app_users
         WHERE email = $1`,
        [normalizedEmail]
      );

      if (result.rows.length === 0) {
        await writeAuditEvent({
          action: "login_attempt_failed",
          outcome: "failure",
          details: { email: normalizedEmail, reason: "User not found" },
        });

        return res.status(401).json({
          status: "error",
          message: "Invalid email or password.",
        });
      }

      const user = result.rows[0];
      const passwordMatches = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!passwordMatches) {
        await writeAuditEvent({
          actorId: user.id,
          action: "login_attempt_failed",
          outcome: "failure",
          details: { email: normalizedEmail, reason: "Password mismatch" },
        });

        return res.status(401).json({
          status: "error",
          message: "Invalid email or password.",
        });
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return res.status(500).json({
          status: "error",
          message: "JWT secret is not configured on the server.",
        });
      }

      const token = jwt.sign(
        { email: user.email, role: user.role },
        secret,
        {
          subject: user.id,
          expiresIn: "15m",
          issuer: "trustvault-api",
          audience: "trustvault-client",
        }
      );

      await writeAuditEvent({
        actorId: user.id,
        action: "user_login",
        outcome: "success",
        details: { email: user.email, role: user.role },
      });

      return res.json({
        status: "ok",
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: any) {
      console.error("Login failed:", error);
      return res.status(500).json({
        status: "error",
        message: error.message || "Login failed.",
      });
    }
  }
);

// User Profile (Authenticated)
router.get(
  "/user/profile",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const userRes = await pool.query(
        `SELECT id, email, role, created_at
         FROM app_users
         WHERE id = $1`,
        [userId]
      );

      if (userRes.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "User profile not found.",
        });
      }

      const countsRes = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM documents WHERE owner_id = $1 AND deleted_at IS NULL) AS owned_count,
           (SELECT COUNT(*) FROM document_permissions WHERE user_id = $1) AS shared_count`,
        [userId]
      );

      return res.json({
        status: "ok",
        user: userRes.rows[0],
        stats: {
          ownedDocuments: Number(countsRes.rows[0]?.owned_count || 0),
          sharedDocuments: Number(countsRes.rows[0]?.shared_count || 0),
        },
      });
    } catch (error) {
      console.error("Failed to load user profile:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to load user profile.",
      });
    }
  }
);

// Change Password (Authenticated)
router.put(
  "/user/password",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body ?? {};

      if (
        typeof currentPassword !== "string" ||
        typeof newPassword !== "string" ||
        newPassword.length < 12 ||
        newPassword.length > 72
      ) {
        return res.status(400).json({
          status: "error",
          message: "New password must be between 12 and 72 characters long.",
        });
      }

      const userRes = await pool.query(
        `SELECT password_hash FROM app_users WHERE id = $1`,
        [userId]
      );

      if (userRes.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "User not found.",
        });
      }

      const matches = await bcrypt.compare(
        currentPassword,
        userRes.rows[0].password_hash
      );

      if (!matches) {
        await writeAuditEvent({
          actorId: userId,
          action: "password_change_failed",
          outcome: "failure",
          details: { reason: "Current password invalid" },
        });

        return res.status(400).json({
          status: "error",
          message: "Current password is incorrect.",
        });
      }

      const newHash = await bcrypt.hash(newPassword, 12);

      await pool.query(
        `UPDATE app_users
         SET password_hash = $1
         WHERE id = $2`,
        [newHash, userId]
      );

      await writeAuditEvent({
        actorId: userId,
        action: "password_changed",
        outcome: "success",
      });

      return res.json({
        status: "ok",
        message: "Password changed successfully.",
      });
    } catch (error) {
      console.error("Password change failed:", error);
      return res.status(500).json({
        status: "error",
        message: "Could not change password.",
      });
    }
  }
);

// Logout (Authenticated)
router.post(
  "/logout",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    await writeAuditEvent({
      actorId: req.user!.id,
      action: "user_logout",
      outcome: "success",
    });

    return res.json({
      status: "ok",
      message: "Logged out successfully.",
    });
  }
);

export default router;
