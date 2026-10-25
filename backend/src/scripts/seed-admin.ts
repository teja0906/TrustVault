import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import { pool } from "../db";

async function run() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL || "admin@trustvault.local";
  const password = process.argv[3] || process.env.ADMIN_INITIAL_PASSWORD || "AdminSecurePass2026!";

  if (!email || !password) {
    console.error("Usage: tsx src/scripts/seed-admin.ts <email> <password>");
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  console.log(`Provisioning administrator: ${normalizedEmail}`);

  try {
    const existing = await pool.query(
      `SELECT id, email, role FROM app_users WHERE email = $1`,
      [normalizedEmail]
    );

    const hash = await bcrypt.hash(password, 12);

    if (existing.rows.length === 0) {
      const res = await pool.query(
        `INSERT INTO app_users (email, password_hash, role)
         VALUES ($1, $2, 'admin')
         RETURNING id, email, role, created_at`,
        [normalizedEmail, hash]
      );
      console.log("Admin user created successfully:", res.rows[0]);
    } else {
      const res = await pool.query(
        `UPDATE app_users
         SET role = 'admin', password_hash = $1
         WHERE id = $2
         RETURNING id, email, role`,
        [hash, existing.rows[0].id]
      );
      console.log("Admin user updated successfully:", res.rows[0]);
    }
  } catch (error: any) {
    console.error("Failed to provision admin:", error.message);
  } finally {
    await pool.end();
  }
}

run();
