import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
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

// Security headers with CSP relaxed for self-hosted SPA assets
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin: true,
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

// API Routers
app.use("/api", authRoutes);
app.use("/api/documents", permissionRoutes); // Handles /api/documents/:id/permissions
app.use("/api/documents", documentRoutes);   // Handles /api/documents, /upload, /:id/download, etc.
app.use("/api/audit-logs", auditRoutes);
app.use("/api/admin", adminRoutes);

// Static Frontend SPA Serving (Single Unified URL)
const candidateDistPaths = [
  path.resolve(__dirname, "../../frontend/dist"),
  path.resolve(__dirname, "../frontend/dist"),
  path.resolve(process.cwd(), "frontend/dist"),
  path.resolve(process.cwd(), "../frontend/dist"),
];

const clientDist = candidateDistPaths.find((p) => existsSync(path.join(p, "index.html")));

if (clientDist) {
  console.log(`Serving unified frontend from: ${clientDist}`);
  app.use(express.static(clientDist));

  // SPA fallback for non-API GET requests
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(clientDist, "index.html"));
    }
    return next();
  });
}

// 404 Route Handler for undefined /api routes
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
