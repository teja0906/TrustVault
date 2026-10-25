import { Router, type Response } from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pool } from "../db";
import {
  uploadDocumentFile,
  getDocumentStream,
  deleteDocumentFile,
} from "../services/storage";
import { writeAuditEvent } from "../services/audit";
import {
  authenticateToken,
  type AuthenticatedRequest,
} from "../middleware/auth";

const router = Router();

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".pptx",
  ".txt",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".zip",
  ".json",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(
        new Error(
          `File type ${ext} is not permitted. Allowed extensions: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`
        )
      );
      return;
    }
    cb(null, true);
  },
});

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Upload Document (Authenticated)
router.post(
  "/upload",
  authenticateToken,
  upload.single("document"),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "Please select a file to upload.",
      });
    }

    const storageKey = randomUUID();
    const originalName = req.file.originalname;
    const mimeType = req.file.mimetype || "application/octet-stream";
    const sizeBytes = req.file.size;
    const category =
      typeof req.body?.category === "string" && req.body.category.trim()
        ? req.body.category.trim().slice(0, 100)
        : "General";

    try {
      // 1. Upload to storage provider (Supabase Storage or Local)
      await uploadDocumentFile(storageKey, req.file.buffer, mimeType);

      // 2. Insert metadata into PostgreSQL
      const result = await pool.query(
        `INSERT INTO documents
          (owner_id, name, category, mime_type, size_bytes, storage_key)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, category, mime_type, size_bytes, created_at, updated_at`,
        [userId, originalName, category, mimeType, sizeBytes, storageKey]
      );

      const newDoc = result.rows[0];

      // 3. Write chained audit event
      await writeAuditEvent({
        actorId: userId,
        action: "document_upload",
        documentId: newDoc.id,
        outcome: "success",
        details: {
          name: newDoc.name,
          category: newDoc.category,
          sizeBytes: newDoc.size_bytes,
          mimeType: newDoc.mime_type,
        },
      });

      return res.status(201).json({
        status: "ok",
        message: "Document uploaded successfully.",
        document: newDoc,
      });
    } catch (error: any) {
      console.error("Document upload failed:", error);

      // Clean up uploaded storage object if database insert failed
      await deleteDocumentFile(storageKey).catch(() => {});

      return res.status(500).json({
        status: "error",
        message: error.message || "Document upload failed.",
      });
    }
  }
);

// List Documents (Authenticated, filtered by ownership/permissions & search query)
router.get(
  "/",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const { search, category, ownership } = req.query;

      let query = `
        SELECT DISTINCT
          d.id,
          d.name,
          d.category,
          d.mime_type,
          d.size_bytes,
          d.created_at,
          d.updated_at,
          d.owner_id,
          u.email AS owner_email,
          CASE
            WHEN d.owner_id = $1 THEN 'owner'
            ELSE p.permission
          END AS user_permission
        FROM documents d
        JOIN app_users u ON u.id = d.owner_id
        LEFT JOIN document_permissions p
          ON p.document_id = d.id
          AND p.user_id = $1
        WHERE d.deleted_at IS NULL
      `;

      const values: any[] = [userId];
      let paramIndex = 2;

      // Access control condition: Admin can view all documents, regular users see owned or explicitly shared
      if (role !== "admin") {
        query += ` AND (d.owner_id = $1 OR p.permission IN ('read', 'edit'))`;
      }

      // Filter by ownership: 'owned', 'shared', or 'all'
      if (ownership === "owned") {
        query += ` AND d.owner_id = $1`;
      } else if (ownership === "shared") {
        query += ` AND d.owner_id != $1 AND p.permission IN ('read', 'edit')`;
      }

      // Search filter on document name
      if (typeof search === "string" && search.trim()) {
        query += ` AND d.name ILIKE $${paramIndex}`;
        values.push(`%${search.trim()}%`);
        paramIndex++;
      }

      // Category filter
      if (typeof category === "string" && category.trim() && category !== "All") {
        query += ` AND d.category = $${paramIndex}`;
        values.push(category.trim());
        paramIndex++;
      }

      query += ` ORDER BY d.created_at DESC`;

      const result = await pool.query(query, values);

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

// Download Document (Authenticated, strictly authorized)
router.get(
  "/:id/download",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const role = req.user!.role;
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id ?? "");

    if (!UUID_REGEX.test(documentId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid document ID format.",
      });
    }

    try {
      // Query document and verify ownership or active permission
      const result = await pool.query(
        `SELECT
           d.id,
           d.name,
           d.mime_type,
           d.size_bytes,
           d.storage_key,
           d.owner_id,
           p.permission
         FROM documents d
         LEFT JOIN document_permissions p
           ON p.document_id = d.id
           AND p.user_id = $1
         WHERE d.id = $2
           AND d.deleted_at IS NULL
         LIMIT 1`,
        [userId, documentId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Document not found.",
        });
      }

      const doc = result.rows[0];
      const isOwner = doc.owner_id === userId;
      const isAdmin = role === "admin";
      const hasPermission = doc.permission === "read" || doc.permission === "edit";

      if (!isOwner && !isAdmin && !hasPermission) {
        // Record denied access attempt in audit log
        await writeAuditEvent({
          actorId: userId,
          action: "unauthorized_document_access",
          documentId,
          outcome: "denied",
          details: { reason: "No read or edit permission" },
        });

        return res.status(403).json({
          status: "error",
          message: "Forbidden: You do not have permission to access this document.",
        });
      }

      // Retrieve file stream from storage
      const { stream, size } = await getDocumentStream(doc.storage_key);

      // Record successful download audit event
      await writeAuditEvent({
        actorId: userId,
        action: "document_download",
        documentId: doc.id,
        outcome: "success",
        details: { name: doc.name },
      });

      res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
      if (size) {
        res.setHeader("Content-Length", size);
      }
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(doc.name)}"`
      );

      stream.pipe(res);
    } catch (error: any) {
      console.error("Document download failed:", error);
      if (!res.headersSent) {
        return res.status(500).json({
          status: "error",
          message: error.message || "Failed to download document.",
        });
      }
    }
  }
);

// Edit Document Metadata (Allowed for OWNER or EDIT permission holders; VIEWER rejected)
router.patch(
  "/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const role = req.user!.role;
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id ?? "");
    const { name, category } = req.body ?? {};

    if (!UUID_REGEX.test(documentId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid document ID format.",
      });
    }

    try {
      const docRes = await pool.query(
        `SELECT d.id, d.owner_id, p.permission
         FROM documents d
         LEFT JOIN document_permissions p
           ON p.document_id = d.id
           AND p.user_id = $1
         WHERE d.id = $2
           AND d.deleted_at IS NULL`,
        [userId, documentId]
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
      const canEdit = isOwner || isAdmin || doc.permission === "edit";

      if (!canEdit) {
        await writeAuditEvent({
          actorId: userId,
          action: "unauthorized_document_edit",
          documentId,
          outcome: "denied",
          details: { permission: doc.permission || "none" },
        });

        return res.status(403).json({
          status: "error",
          message:
            "Forbidden: You require EDIT permission or ownership to modify this document.",
        });
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (typeof name === "string" && name.trim()) {
        updates.push(`name = $${paramIndex}`);
        values.push(name.trim().slice(0, 255));
        paramIndex++;
      }

      if (typeof category === "string" && category.trim()) {
        updates.push(`category = $${paramIndex}`);
        values.push(category.trim().slice(0, 100));
        paramIndex++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          status: "error",
          message: "Provide at least a name or category to update.",
        });
      }

      updates.push(`updated_at = NOW()`);
      values.push(documentId);

      const updateQuery = `
        UPDATE documents
        SET ${updates.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING id, name, category, mime_type, size_bytes, updated_at
      `;

      const result = await pool.query(updateQuery, values);

      await writeAuditEvent({
        actorId: userId,
        action: "document_updated",
        documentId,
        outcome: "success",
        details: { updatedFields: req.body },
      });

      return res.json({
        status: "ok",
        message: "Document updated successfully.",
        document: result.rows[0],
      });
    } catch (error) {
      console.error("Failed to update document:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to update document.",
      });
    }
  }
);

// Delete Document (OWNER or ADMIN only; VIEWER and EDIT users rejected)
router.delete(
  "/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const role = req.user!.role;
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id ?? "");

    if (!UUID_REGEX.test(documentId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid document ID format.",
      });
    }

    try {
      const docRes = await pool.query(
        `SELECT id, owner_id, name, storage_key
         FROM documents
         WHERE id = $1 AND deleted_at IS NULL`,
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
          action: "unauthorized_document_delete",
          documentId,
          outcome: "denied",
          details: { reason: "User is neither owner nor admin" },
        });

        return res.status(403).json({
          status: "error",
          message: "Forbidden: Only the document owner or an administrator can delete this document.",
        });
      }

      // Soft delete in database
      await pool.query(
        `UPDATE documents
         SET deleted_at = NOW()
         WHERE id = $1`,
        [documentId]
      );

      // Record deletion in audit log
      await writeAuditEvent({
        actorId: userId,
        action: "document_deleted",
        documentId,
        outcome: "success",
        details: { name: doc.name },
      });

      return res.json({
        status: "ok",
        message: "Document deleted successfully.",
      });
    } catch (error) {
      console.error("Failed to delete document:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to delete document.",
      });
    }
  }
);

export default router;
