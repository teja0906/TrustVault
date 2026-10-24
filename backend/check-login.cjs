require("dotenv").config();
const bcrypt = require("bcrypt");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 5432),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
});

async function main() {
  try {
    const newPassword = "VaultTestPass123!";
    const newHash = await bcrypt.hash(newPassword, 12);

    const result = await pool.query(
      `UPDATE app_users
       SET password_hash = $1
       WHERE email = $2`,
      [newHash, "owner@example.com"]
    );

    if (result.rowCount === 0) {
      console.log("USER NOT FOUND");
      return;
    }

    console.log("Password reset:", result.rowCount === 1);
    console.log(
      "Verification:",
      await bcrypt.compare(newPassword, newHash)
    );
  } catch (error) {
    console.log("ERROR:", error.message);
  } finally {
    await pool.end();
  }
}

main();