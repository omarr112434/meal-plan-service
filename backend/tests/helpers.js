// Shared setup for the API tests. Set the environment BEFORE anything requires config.js.
process.env.JWT_SECRET = process.env.TEST_JWT_SECRET || 'test-secret-for-automated-tests-only-0123456789';
process.env.LOG_LEVEL = 'silent';
process.env.CORS_ORIGINS = 'http://localhost:8080';

const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const { createApp } = require('../app');
const memoryStore = require('../storage/memoryStore');
const dynamoStore = require('../storage/dynamoStore');
const sampleRecipes = require('../integrations/sampleRecipes');
const { DeleteTableCommand } = require('@aws-sdk/client-dynamodb');

const secret = process.env.JWT_SECRET;

function tokenFor(userId, role = 'user', options = {}) {
  return jwt.sign({ role }, secret, { subject: userId, expiresIn: '1h', algorithm: 'HS256', ...options });
}

// TEST_DYNAMODB_ENDPOINT=http://localhost:4566 npm test   -> runs against DynamoDB on Floci,
// in tables of its own that are deleted afterwards. Without it the memory store is used.
async function makeStore() {
  const endpoint = process.env.TEST_DYNAMODB_ENDPOINT;
  if (!endpoint) return memoryStore.create();

  const suffix = randomUUID().slice(0, 8);
  const store = dynamoStore.create({
    aws: { region: process.env.AWS_REGION || 'us-east-1', endpoint },
    tables: { mealPlans: `test-MealPlans-${suffix}`, shoppingLists: `test-ShoppingLists-${suffix}` }
  });
  await store.ensureTables({ attempts: 3, delayMs: 1000 });
  store.cleanUp = async () => {
    for (const TableName of store.tableNames()) {
      await store.client.send(new DeleteTableCommand({ TableName })).catch(() => {});
    }
  };
  return store;
}

async function startApi() {
  const store = await makeStore();
  const app = createApp({ store, recipes: sampleRecipes.create() });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    store,
    base,
    async stop() {
      server.close();
      if (store.cleanUp) await store.cleanUp();
    }
  };
}

// fetch wrapper: returns { status, body, headers }
async function call(base, method, path, { token, body, raw, contentType, headers = {} } = {}) {
  const sendHeaders = { ...headers };
  if (token) sendHeaders.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) {
    payload = raw;
    sendHeaders['Content-Type'] = contentType || 'application/json';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    sendHeaders['Content-Type'] = contentType || 'application/json';
  }

  const response = await fetch(base + path, { method, headers: sendHeaders, body: payload });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, body: json, headers: response.headers };
}

// Collects every test case for the test plan document (docs/test-plan.md).
function createReport(storeName) {
  const rows = [];
  return {
    add(row) {
      rows.push(row);
    },
    save() {
      const file = process.env.TEST_REPORT;
      if (!file) return;
      fs.writeFileSync(file, JSON.stringify({ store: storeName, ranAt: new Date().toISOString(), rows }, null, 2));
    }
  };
}

function describeResult(result) {
  if (result.status === 204) return '204, no body';
  const code = result.body && result.body.error ? `; ${result.body.error.code}` : '';
  return `${result.status}${code}`;
}

module.exports = { tokenFor, startApi, call, createReport, describeResult, secret };
