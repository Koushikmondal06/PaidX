import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from '../dashboard/node_modules/@neondatabase/serverless/index.js';
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Read connection string from .env or .env.local
let dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  const envFiles = [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, 'dashboard', '.env.local'),
  ];
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf8');
      const matchUnpooled = content.match(/DATABASE_URL_UNPOOLED=["']?([^"'\r\n]+)["']?/);
      const matchPooled = content.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
      if (matchUnpooled) {
        dbUrl = matchUnpooled[1];
        break;
      }
      if (matchPooled && !dbUrl) {
        dbUrl = matchPooled[1];
      }
    }
  }
}

if (!dbUrl) {
  console.error('ERROR: No DATABASE_URL or DATABASE_URL_UNPOOLED found in environment or .env files.');
  process.exit(1);
}

console.log('Connecting to Neon via:', dbUrl.replace(/:[^:@]+@/, ':****@'));

const pool = new Pool({ connectionString: dbUrl });

async function runMigrations() {
  try {
    const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    console.log(`Found ${files.length} migration files in ${migrationsDir}`);

    // Create compatibility roles if not present
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN;
        END IF;
      END $$;
    `);

    // Create migration tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public._neon_migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const { rows: executed } = await pool.query(`SELECT name FROM public._neon_migrations;`);
    const executedSet = new Set(executed.map(r => r.name));

    for (const file of files) {
      if (executedSet.has(file)) {
        console.log(`[SKIPPED] ${file} (already executed)`);
        continue;
      }

      console.log(`[EXECUTING] ${file}...`);
      const sqlPath = path.join(migrationsDir, file);
      let sql = fs.readFileSync(sqlPath, 'utf8');

      // Execute migration
      await pool.query(sql);

      // Record migration
      await pool.query(`INSERT INTO public._neon_migrations (name) VALUES ($1);`, [file]);
      console.log(`[COMPLETED] ${file}`);
    }

    console.log('\nAll Neon migrations applied successfully!');
  } catch (err) {
    console.error('\nMigration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
