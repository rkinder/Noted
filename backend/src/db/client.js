const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Verify connectivity on first use, retrying briefly for container boot order
pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err.message);
});

/**
 * Wait for the database to accept connections. Retries up to maxAttempts
 * times with a short delay — handles the case where the app container starts
 * before the postgres healthcheck completes.
 */
async function waitForDb(maxAttempts = 10, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.log(`Waiting for database… (attempt ${attempt}/${maxAttempts})`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

module.exports = { pool, waitForDb };
