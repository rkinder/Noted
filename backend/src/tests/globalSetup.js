/**
 * Runs once before all test suites.
 * Creates the test database and applies the schema.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

module.exports = async function globalSetup() {
  // Parse DB name from the URL so we can create it if needed
  const url = new URL(TEST_DB_URL);
  const dbName = url.pathname.slice(1);

  // Connect to the default 'postgres' db to create the test db
  const adminUrl = new URL(TEST_DB_URL);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  // Apply schema to the fresh test db
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  const client = new Client({ connectionString: TEST_DB_URL });
  await client.connect();
  await client.query(schema);
  await client.end();

  process.env.DATABASE_URL = TEST_DB_URL;
};
