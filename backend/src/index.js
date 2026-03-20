require('dotenv').config();

const config = require('./config');
const { waitForDb } = require('./db/client');
const { migrate } = require('./db/migrate');
const { server } = require('./app');

async function start() {
  await waitForDb();
  await migrate();
  server.listen(config.port, () => {
    console.log(`Noted backend listening on :${config.port} (storage: ${config.storage.type})`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
