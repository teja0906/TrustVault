import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { writeAuditEvent } from "../services/audit";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "admin" | "owner" | "viewer";
}

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many authentication requests from this IP. Please try again in 15 minutes.",
  },
});

export function authenticateToken(
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
    }) as any;

    if (
      !payload ||
      typeof payload.sub !== "string" ||
      typeof payload.role !== "string"
    ) {
      return res.status(401).json({
        status: "error",
        message: "Invalid token payload.",
      });
    }

    req.user = {
      id: payload.sub,
      email: payload.email || "",
      role: payload.role,
    };

    next();
  } catch (error: any) {
    return res.status(401).json({
      status: "error",
      message: "Invalid or expired token.",
    });
  }
}

export function requireRole(...roles: string[]) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required.",
      });
    }

    if (!roles.includes(req.user.role)) {
      // Record unauthorized privilege escalation / access attempt in audit log
      await writeAuditEvent({
        actorId: req.user.id,
        action: "unauthorized_role_access",
        outcome: "denied",
        details: {
          attemptedEndpoint: req.originalUrl,
          requiredRoles: roles,
          userRole: req.user.role,
        },
      });

      return res.status(403).json({
        status: "error",
        message: `Forbidden: requires one of the following roles: ${roles.join(", ")}`,
      });
    }

    next();
  };
}
