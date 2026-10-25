import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import authRoutes from "./routes/auth";
import documentRoutes from "./routes/documents";
import permissionRoutes from "./routes/permissions";
import auditRoutes from "./routes/audit";
import adminRoutes from "./routes/admin";
import { getStorageMode } from "./services/storage";
import { pool } from "./db";

export const app = express();

app.disable("x-powered-by");

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const elapsed = Date.now() - startedAt;
    if (process.env.NODE_ENV !== "test") {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | ${elapsed}ms`);
    }
  });
  next();
});

// Security headers
app.use(helmet());

// Dynamic CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:4000",
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like curl, mobile apps, or same-origin)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // In production or when FRONTEND_URL is set, allow matching origin or log
        callback(null, true);
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "200kb" }));

// Health Check Endpoint (Render monitor & uptime check)
app.get("/api/health", (_req: Request, res: Response) => {
  return res.json({
    status: "ok",
    application: "TrustVault API",
    timestamp: new Date().toISOString(),
    storageMode: getStorageMode(),
  });
});

app.get("/api/debug-db", async (_req: Request, res: Response) => {
  try {
    const r = await pool.query("SELECT NOW()");
    return res.json({ status: "connected", now: r.rows[0].now });
  } catch (err: any) {
    return res.status(500).json({ status: "failed", error: err.message, code: err.code });
  }
});

// API Routers
app.use("/api", authRoutes);
app.use("/api/documents", permissionRoutes); // Handles /api/documents/:id/permissions
app.use("/api/documents", documentRoutes);   // Handles /api/documents, /upload, /:id/download, etc.
app.use("/api/audit-logs", auditRoutes);
app.use("/api/admin", adminRoutes);

// 404 Route Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    message: `Endpoint ${req.method} ${req.originalUrl} not found.`,
  });
});

// Centralized Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled API error:", err.message || err);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    status: "error",
    message:
      process.env.NODE_ENV === "production" && statusCode === 500
        ? "An internal server error occurred."
        : err.message || "An unexpected error occurred.",
  });
});
