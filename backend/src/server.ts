import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";
import { checkDatabaseConnection, pool } from "./db";
import bcrypt from "bcrypt";

const PORT = Number(process.env.PORT || 4000);
const HOST = "0.0.0.0";

async function provisionInitialAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return;
  }

  try {
    const existing = await pool.query(
      `SELECT id, role FROM app_users WHERE email = $1`,
      [adminEmail.trim().toLowerCase()]
    );

    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await pool.query(
        `INSERT INTO app_users (email, password_hash, role)
         VALUES ($1, $2, 'admin')`,
        [adminEmail.trim().toLowerCase(), hash]
      );
      console.log(`Initial administrator provisioned: ${adminEmail}`);
    } else if (existing.rows[0].role !== "admin") {
      await pool.query(
        `UPDATE app_users SET role = 'admin' WHERE id = $1`,
        [existing.rows[0].id]
      );
      console.log(`Updated user ${adminEmail} to administrator.`);
    }
  } catch (error: any) {
    console.error("Initial admin provisioning notice:", error.message);
  }
}

async function startServer() {
  await checkDatabaseConnection();
  await provisionInitialAdmin();

  const server = app.listen(PORT, HOST, () => {
    console.log(`TrustVault API running at http://${HOST}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });

  const handleShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      console.log("HTTP server closed.");
      await pool.end();
      console.log("PostgreSQL connection pool closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));
}

startServer().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
