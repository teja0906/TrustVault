const bcrypt = require("bcrypt");
const { Pool } = require("pg");
require("dotenv").config();

async function main() {
  const email = "owner@example.com";
  const newPassword = process.env.OWNER_RESET_PASSWORD;

  if (!newPassword) {
    throw new Error("OWNER_RESET_PASSWORD is not set.");
  }

  const pool = new Pool({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  });

  try {
    const hash = await bcrypt.hash(newPassword, 12);

    const result = await pool.query(
      `UPDATE app_users
       SET password_hash = $1
       WHERE email = $2 AND role = 'owner'
       RETURNING email, role`,
      [hash, email]
    );

    if (result.rowCount === 0) {
      console.log("Owner account not found. No password changed.");
    } else {
      console.log("Owner password reset successfully.");
      console.log(result.rows[0]);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});