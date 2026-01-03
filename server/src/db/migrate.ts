import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import * as dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function runMigrations() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.log('Migrations completed!');
  await pool.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});


