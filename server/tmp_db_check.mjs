import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const r = await pool.query(`
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema='public' and table_name='publish_tasks'
  order by ordinal_position
`);

console.table(r.rows);
await pool.end();
