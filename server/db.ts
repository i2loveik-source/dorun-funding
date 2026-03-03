import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Neon Serverless Driver — HTTPS(443) 기반, 교육청 등 방화벽 환경에서도 작동
const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
