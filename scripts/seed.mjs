import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomBytes, scryptSync } from "crypto";
import pg from "pg";

const { Pool } = pg;
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnvFile(path) {
  let content = "";
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadEnvFile(join(rootDir, ".env.local"));
loadEnvFile(join(rootDir, ".env"));

const requiredEnv = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  throw new Error(`Missing DB env: ${missingEnv.join(", ")}`);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64);
  return `scrypt:${salt}:${key.toString("hex")}`;
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crawler_sites (
      id BIGSERIAL PRIMARY KEY,
      site_key TEXT NOT NULL UNIQUE,
      config JSONB NOT NULL,
      crawl_status TEXT NOT NULL DEFAULT 'idle',
      crawl_error TEXT,
      last_crawled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (jsonb_typeof(config) = 'object')
    )
  `);
  await pool.query(
    "ALTER TABLE crawler_sites ADD COLUMN IF NOT EXISTS store_images_locally BOOLEAN NOT NULL DEFAULT FALSE"
  );
  await pool.query(
    "ALTER TABLE crawler_sites ADD COLUMN IF NOT EXISTS local_image_storage_path TEXT"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS crawler_sites_status_idx ON crawler_sites (crawl_status, updated_at DESC)"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON app_sessions(user_id)"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS app_sessions_expires_at_idx ON app_sessions(expires_at)"
  );
}

async function seedAdmin() {
  const username = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "admin123456";
  const passwordHash = hashPassword(password);
  const resetPassword = process.env.ADMIN_RESET_PASSWORD === "true";

  const result = await pool.query(
    `INSERT INTO app_users (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = CASE
         WHEN $3::boolean THEN EXCLUDED.password_hash
         ELSE app_users.password_hash
       END,
       updated_at = CASE
         WHEN $3::boolean THEN NOW()
         ELSE app_users.updated_at
       END
     RETURNING id`,
    [username, passwordHash, resetPassword]
  );

  console.log(
    `Seeded admin user "${username}" (${resetPassword ? "password reset" : "created or kept existing password"}).`
  );
  if (!process.env.ADMIN_PASSWORD) {
    console.log('ADMIN_PASSWORD was not set. Default password is "admin123456".');
  }
  return result.rows[0]?.id;
}

async function seedCrawlerSites() {
  const sitesPath = join(rootDir, "scripts", "seed-data", "crawler-sites.json");
  const sites = JSON.parse(readFileSync(sitesPath, "utf8"));

  for (const site of sites) {
    await pool.query(
      `INSERT INTO crawler_sites (
         site_key,
         config,
         crawl_status,
         store_images_locally,
         local_image_storage_path,
         updated_at
       )
       VALUES ($1, $2::jsonb, 'idle', $3, $4, NOW())
       ON CONFLICT (site_key) DO UPDATE SET
         config = EXCLUDED.config,
         store_images_locally = EXCLUDED.store_images_locally,
         local_image_storage_path = EXCLUDED.local_image_storage_path,
         updated_at = NOW()`,
      [
        site.site_key,
        JSON.stringify(site.config),
        Boolean(site.store_images_locally),
        site.local_image_storage_path ?? null,
      ]
    );
  }

  console.log(`Seeded ${sites.length} crawler site config(s).`);
}

try {
  await ensureTables();
  await seedAdmin();
  await seedCrawlerSites();
  console.log("Seed completed.");
} finally {
  await pool.end();
}
