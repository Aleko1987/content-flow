require("dotenv").config();

const { neon } = require("@neondatabase/serverless");

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set in server/.env");

  const sql = neon(url);

  const rows = await sql`
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename
  `;

  rows.forEach((row) => {
    console.log(row.tablename);
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
