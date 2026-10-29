import 'dotenv/config';
import { DatabaseService } from './modules/database';

/** Run as an isolated scheduled job, not on every API request. */
async function main() {
  const db = new DatabaseService();
  try {
    const now = new Date();
    const sessions = await db.session.deleteMany({ where: {
      OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
    } });
    const tokens = await db.passwordResetToken.deleteMany({ where: {
      OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
    } });
    process.stdout.write(`Removed ${sessions.count} inactive sessions and ${tokens.count} stale password reset tokens.\n`);
  } finally {
    await db.$disconnect();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
