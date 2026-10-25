import { Pool, type PoolConfig } from "pg";
import dotenv from "dotenv";

dotenv.config();

const poolConfig: PoolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === "false"
          ? false
          : { rejectUnauthorized: false },
    }
  : {
      host: process.env.DATABASE_HOST || "localhost",
      port: Number(process.env.DATABASE_PORT || 5432),
      database: process.env.DATABASE_NAME || "trustvault",
      user: process.env.DATABASE_USER || "postgres",
      password: process.env.DATABASE_PASSWORD || "",
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : false,
    };

export const pool = new Pool(poolConfig);

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error on idle client:", err);
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("PostgreSQL connected successfully at:", res.rows[0].now);
    return true;
  } catch (err: any) {
    console.error("PostgreSQL connection failed:", err.message);
    return false;
  }
}
