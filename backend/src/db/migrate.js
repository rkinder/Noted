const fs = require('fs');
const path = require('path');
const { pool } = require('./client');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Database schema applied.');
}

module.exports = { migrate };
