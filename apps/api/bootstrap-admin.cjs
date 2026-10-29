// One-time local initialization. Existing databases are never modified by this command.
const { randomBytes, randomUUID } = require('node:crypto');
const { hash, Algorithm } = require('@node-rs/argon2');
const { Client } = require('pg');

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL to a valid email address');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE "User" IN EXCLUSIVE MODE');
    const existing = await client.query('SELECT 1 FROM "User" LIMIT 1');
    if (existing.rowCount) throw new Error('Users already exist; bootstrap cannot modify this database');
    const password = randomBytes(24).toString('base64url');
    const passwordHash = await hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 });
    await client.query('INSERT INTO "User" (id, email, name, "passwordHash", "passwordChangeRequired", "temporaryPasswordExpiresAt", "createdAt") VALUES ($1, $2, $3, $4, true, NOW() + INTERVAL \'7 days\', NOW())', [randomUUID(), email, 'Administrator', passwordHash]);
    await client.query('COMMIT');
    console.log(`Administrator email: ${email}\nTemporary password: ${password}\nChange this password at first sign-in.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
