import express from "express";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { Pool } from "pg";
import jwt from "jsonwebtoken"; 
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "crypto";


dotenv.config();

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 5432),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
});

pool.query("SELECT NOW()")
  .then(() => console.log("PostgreSQL connected successfully"))
  .catch((err) => console.error("PostgreSQL connection failed:", err.message));


  // Audit event helper
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])])
    );
  }

  return value;
}

function calculateEventHash(event: any): string {
  const occurredAt =
    event.occurred_at instanceof Date
      ? event.occurred_at.toISOString()
      : new Date(event.occurred_at).toISOString();
      console.log("HASH CHECK:", {
  id: event.id,
  databaseTimestamp: event.occurred_at,
  normalizedTimestamp: occurredAt,
  storedHash: event.event_hash,
});

  const payload = {
    actorId: event.actor_id,
    action: event.action,
    documentId: event.document_id,
    targetUserId: event.target_user_id,
    outcome: event.outcome,
    details: canonicalize(event.details),
    previousHash: event.previous_hash,
    occurredAt,
  };

  console.log("VERIFY EVENT ID:", event.id);
  console.log("VERIFY PAYLOAD:", JSON.stringify(payload));

  return createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
}
// Audit event helper
async function writeAuditEvent({
  actorId,
  action,
  documentId = null,
  targetUserId = null,
  outcome = "success",
  details = {},
}: {
  actorId: string;
  action: string;
  documentId?: string | null;
  targetUserId?: string | null;
  outcome?: string;
  details?: Record<string, unknown>;
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "SELECT pg_advisory_xact_lock(742019, 1)"
    );

    const previousResult = await client.query(
      `SELECT event_hash
       FROM audit_events
       ORDER BY id DESC
       LIMIT 1`
    );

    const previousHash: string | null =
      previousResult.rows[0]?.event_hash ?? null;

    const occurredAt = new Date().toISOString();
    const canonicalDetails = canonicalize(details);

    const eventData = {
      actorId,
      action,
      documentId,
      targetUserId,
      outcome,
      details: canonicalDetails,
      previousHash,
      occurredAt,
    };
    console.log("SAVED PAYLOAD:", JSON.stringify(eventData));

    const eventHash = createHash("sha256")
      .update(JSON.stringify(eventData), "utf8")
      .digest("hex");

    await client.query(
      `INSERT INTO audit_events
        (actor_id, action, document_id, target_user_id,
         outcome, details, occurred_at, previous_hash, event_hash)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
      [
        actorId,
        action,
        documentId,
        targetUserId,
        outcome,
        JSON.stringify(canonicalDetails),
        occurredAt,
        previousHash,
        eventHash,
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Audit event insert failed:", error);
  } finally {
    client.release();
  }
}
const app = express();
app.use((req, res, next) => {
  const startedAt = Date.now();

  console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);

  res.on("finish", () => {
    console.log(
      `[RESPONSE] ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | ${Date.now() - startedAt}ms`
    );
  });

  next();
});

app.disable("x-powered-by");
app.get("/api/test-terminal", (_req, res) => {
  console.log("TEST ROUTE REACHED");
  res.json({ message: "Backend reached successfully" });
});
app.use(helmet());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
  })
);
app.use(express.json({ limit: "100kb" }));
const uploadDir = process.env.UPLOAD_DIR;

if (!uploadDir) {
  throw new Error("UPLOAD_DIR is missing in .env");
}

const privateStorage = path.resolve(uploadDir);

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try {
        await mkdir(privateStorage, { recursive: true });
        callback(null, privateStorage);
      } catch (error) {
        callback(error as Error, privateStorage);
      }
    },
    filename: (_req, _file, callback) => {
      callback(null, randomUUID());
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    application: "TrustVault API",
    message: "Backend is running"
  });
});

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    role: string;
  };
};

function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  const secret = process.env.JWT_SECRET;

  if (!token || !secret) {
    return res.status(401).json({
      status: "error",
      message: "Authentication required.",
    });
  }

  try {
    const payload = jwt.verify(token, secret, {
      issuer: "trustvault-api",
      audience: "trustvault-client",
    });

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.role !== "string"
    ) {
      return res.status(401).json({
        status: "error",
        message: "Invalid token.",
      });
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
    };

    next();
  } catch {
    return res.status(401).json({
      status: "error",
      message: "Invalid or expired token.",
    });
  }
}

app.post("/api/register", async (req, res) => {
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
          "Provide a valid email, a password of 12–72 characters, and a valid role.",
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

    return res.status(201).json({
      status: "ok",
      user: result.rows[0],
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
});

app.post("/api/login", async (req, res) => {
  try {
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

    const result = await pool.query(
      `SELECT id, email, password_hash, role
       FROM app_users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
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
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password.",
      });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return res.status(500).json({
        status: "error",
        message: "Login is not configured.",
      });
    }

    const token = jwt.sign(
      { role: user.role },
      secret,
      {
        subject: user.id,
        expiresIn: "15m",
        issuer: "trustvault-api",
        audience: "trustvault-client",
      }
    );

    return res.json({
      status: "ok",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({
      status: "error",
      message: "Login failed.",
    });
  }
});

app.get(
  "/api/documents/:id/permissions",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const documentId = String(req.params.id ?? "");
    const userId = req.user!.id;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(documentId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid document ID.",
      });
    }

    try {
      // Check whether the document exists and who owns it
      const document = await pool.query(
        `SELECT id, owner_id
         FROM documents
         WHERE id = $1
           AND deleted_at IS NULL`,
        [documentId]
      );

      if (document.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Document not found.",
        });
      }

      // Only the owner can view permissions
      if (document.rows[0].owner_id !== userId) {
        return res.status(403).json({
          status: "error",
          message: "Forbidden: only the document owner can view permissions.",
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
app.post(
  "/api/documents/:id/permissions",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const documentId = req.params.id;
    const ownerId = req.user!.id;
    const { email, permission } = req.body ?? {};

    if (
      typeof documentId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId) ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      !["read", "edit"].includes(permission)
    ) {
      return res.status(400).json({
        status: "error",
        message: "Provide a valid document ID, email, and read/edit permission.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const document = await client.query(
        `SELECT id FROM documents
         WHERE id = $1 AND owner_id = $2
           AND deleted_at IS NULL
         FOR UPDATE`,
        [documentId, ownerId]
      );

      if (document.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          status: "error",
          message: "Document not found or you are not its owner.",
        });
      }

      const target = await client.query(
        `SELECT id FROM app_users WHERE email = $1`,
        [email.trim().toLowerCase()]
      );

      if (target.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          status: "error",
          message: "Target user account not found.",
        });
      }

      if (target.rows[0].id === ownerId) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          status: "error",
          message: "You already own this document.",
        });
      }

      await client.query(
        `INSERT INTO document_permissions
          (document_id, user_id, permission, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (document_id, user_id)
         DO UPDATE SET
           permission = EXCLUDED.permission,
           granted_by = EXCLUDED.granted_by,
           granted_at = NOW()`,
        [documentId, target.rows[0].id, permission, ownerId]
      );

     await client.query("COMMIT");

      await writeAuditEvent({
        actorId: ownerId,
        action: "permission_granted",
        documentId,
        targetUserId: target.rows[0].id,
        outcome: "success",
        details: {
          email: email.trim().toLowerCase(),
          permission,
        },
      });

      return res.json({
        status: "ok",
        message: "Document permission saved.",
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Grant permission failed:", error);
      return res.status(500).json({
        status: "error",
        message: "Could not save document permission.",
      });
    } finally {
      client.release();
    }
  }
);

app.delete(
  "/api/documents/:id/permissions/:userId",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const documentId = String(req.params.id ?? "");
    const targetUserId = String(req.params.userId ?? "");
    const ownerId = req.user!.id;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(documentId) || !uuidPattern.test(targetUserId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid document or user ID.",
      });
    }

    try {
      const result = await pool.query(
        `DELETE FROM document_permissions p
         USING documents d
         WHERE p.document_id = d.id
           AND p.document_id = $1
           AND p.user_id = $2
           AND d.owner_id = $3
           AND d.deleted_at IS NULL
         RETURNING p.document_id`,
        [documentId, targetUserId, ownerId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          status: "error",
          message: "Permission not found or you are not the document owner.",
        });
      }

      await writeAuditEvent({
        actorId: ownerId,
        action: "permission_revoked",
        documentId,
        targetUserId,
        outcome: "success",
        details: {
          message: "Document permission revoked.",
        },
      });

      return res.json({
        status: "ok",
        message: "Document permission revoked.",
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

app.get(
  "/api/documents",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;

      const result = await pool.query(
        `SELECT DISTINCT
           d.id, d.name, d.category, d.mime_type,
           d.size_bytes, d.created_at, d.updated_at
         FROM documents d
         LEFT JOIN document_permissions p
           ON p.document_id = d.id
           AND p.user_id = $1
         WHERE d.deleted_at IS NULL
           AND (d.owner_id = $1 OR p.permission IN ('read', 'edit'))
         ORDER BY d.created_at DESC`,
        [userId]
      );

      return res.json({
        status: "ok",
        documents: result.rows,
      });
    } catch (error) {
      console.error("Failed to fetch documents:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch documents.",
      });
    }
  }
);

app.get(
  "/api/audit-logs",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      const result = await pool.query(
        `SELECT
           a.id,
           a.actor_id,
           a.action,
           a.document_id,
           a.target_user_id,
           a.outcome,
           a.details,
           a.occurred_at
         FROM audit_events a
         WHERE
           $2 = 'admin'
           OR a.actor_id = $1
           OR EXISTS (
             SELECT 1
             FROM documents d
             WHERE d.id = a.document_id
               AND d.owner_id = $1
           )
         ORDER BY a.occurred_at DESC
         LIMIT 100`,
        [userId, role]
      );

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

app.post(
  "/api/documents/upload",
  authenticateToken,
  upload.single("document"),
  async (req: AuthenticatedRequest, res) => {
    try {
      console.log("Document upload request received");
      if (!req.file) {
        return res.status(400).json({
          status: "error",
          message: "Please select a file.",
        });
      }

      const userId = req.user!.id;
      const category =
        typeof req.body?.category === "string" &&
        req.body.category.trim()
          ? req.body.category.trim().slice(0, 100)
          : "General";

      const result = await pool.query(
        `INSERT INTO documents
          (owner_id, name, category, mime_type, size_bytes, storage_key)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, category, mime_type, size_bytes, created_at`,
        [
          userId,
          req.file.originalname,
          category,
          req.file.mimetype,
          req.file.size,
          req.file.filename,
        ]
      );
      await writeAuditEvent({
        actorId: userId,
        action: "document_upload",
        documentId: result.rows[0].id,
        outcome: "success",
        details: {
          name: result.rows[0].name,
          category: result.rows[0].category,
        },
      });

      return res.status(201).json({
        status: "ok",
        message: "Document uploaded successfully.",
        document: result.rows[0],
      });
    } catch (error) {
      console.error("Document upload failed:", error);

      if (req.file) {
        const fs = await import("node:fs/promises");
        await fs.unlink(req.file.path).catch(() => {});
      }

      return res.status(500).json({
        status: "error",
        message: "Document upload failed.",
      });
    }
  }
);

app.get(
  "/api/documents/:id/download",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const documentId = req.params.id;

      // Verify that this user owns or has permission to read the file.
      const result = await pool.query(
        `SELECT d.id, d.name, d.mime_type, d.storage_key
         FROM documents d
         LEFT JOIN document_permissions p
           ON p.document_id = d.id
           AND p.user_id = $1
         WHERE d.id = $2
           AND d.deleted_at IS NULL
           AND (d.owner_id = $1 OR p.permission IN ('read', 'edit'))
         LIMIT 1`,
        [userId, documentId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Document not found or access denied.",
        });
      }

      const document = result.rows[0];

      // storage_key is a generated UUID, not the original filename.
      const filePath = path.join(privateStorage, document.storage_key);

      const fs = await import("node:fs/promises");

      try {
        await fs.access(filePath);
      } catch { 
        return res.status(404).json({
          status: "error",
          message: "Stored file not found.",
        });
      }

      res.setHeader(
        "Content-Type",
        "application/octet-stream"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="document-${document.id}"`
      );

      const stream = createReadStream(filePath);

      stream.on("error", (error) => {
        console.error("Document download failed:", error);
        if (!res.headersSent) {
          res.status(500).json({
            status: "error",
            message: "Document download failed.",
          });
        } else {
          res.destroy(error);
        }
      });

      return stream.pipe(res);
    } catch (error) {
      console.error("Document download failed:", error);
      return res.status(500).json({
        status: "error",
        message: "Document download failed.",
      });
    }
  }
);

app.get(
  "/api/audit-logs/verify",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log("AUDIT VERIFY ROUTE CALLED");
      const result = await pool.query(
        `SELECT
           id,
           actor_id,
           action,
           document_id,
           target_user_id,
           outcome,
           details,
           occurred_at,
           previous_hash,
           event_hash
         FROM audit_events
         ORDER BY id ASC`
      );

      const events = result.rows;

      const checks = events.map((event, index) => {
        const previous = index > 0 ? events[index - 1] : null;

        const expectedPreviousHash =
          previous?.event_hash ?? null;

        const linkValid =
          event.previous_hash === expectedPreviousHash;

        let calculatedHash: string | null = null;
        let hashValid = false;
        let hashError: string | null = null;

        try {
          calculatedHash = calculateEventHash(event);
hashValid = calculatedHash === event.event_hash;

console.log("HASH RESULT:", {
  id: event.id,
  calculatedHash,
  storedHash: event.event_hash,
  hashValid,
});
   
        } catch (error) {
          hashError = "Could not recalculate this event hash.";
        }

        return {
          id: event.id,
          previousEventId: previous?.id ?? null,
          linkValid,
          hashRecalculated: calculatedHash !== null,
          hashValid,
          ...(hashError ? { hashError } : {}),
        };
      });

      const linksValid = checks.every((check) => check.linkValid);
      const hashesValid = checks.every((check) => check.hashValid);

      return res.json({
        status: linksValid && hashesValid ? "ok" : "integrity_failed",
        totalEvents: checks.length,
        linksValid,
        hashRecalculationImplemented: true,
        hashesValid,
        integrityValid: linksValid && hashesValid,
        events: checks,
      });
    } catch (error) {
      console.error("Audit verification failed:", error);

      return res.status(500).json({
        status: "error",
        message: "Could not verify audit logs.",
      });
    }
  }
);

const PORT = 4000;

app.listen(PORT, () => {
  console.log(`TrustVault API running at http://localhost:${PORT}`);
});
