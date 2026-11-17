// Chooses where plans and lists are stored (same idea as issueService.js in Lab 5):
//   DATA_STORE=memory    -> memoryStore.js (no setup, lost on restart)
//   DATA_STORE=dynamodb  -> dynamoStore.js (Floci)
// The services never change when the storage changes.
const logger = require('../logger');

async function createStore(config) {
  if (config.dataStore === 'dynamodb') {
    const store = require('./dynamoStore').create(config);
    if (config.autoCreateTables) {
      const created = await store.ensureTables();
      if (created.length > 0) logger.info('created DynamoDB tables', { tables: created });
    }
    return store;
  }
  return require('./memoryStore').create();
}

module.exports = { createStore };
