/**
 * Runs once after all test suites.
 * Drops the test database.
 */
const { Client } = require('pg');

require('dotenv').config();

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

module.exports = async function globalTeardown() {
  const url = new URL(TEST_DB_URL);
  const dbName = url.pathname.slice(1);

  const adminUrl = new URL(TEST_DB_URL);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  // Terminate active connections before dropping
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
    [dbName]
  );
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await admin.end();
};
