// The Lambda entry point (the doctor's lab setup: API Gateway -> Lambda -> Express app).
// Sends requests in the shape API Gateway HTTP APIs use (payload format 2.0).
process.env.JWT_SECRET = 'test-secret-for-automated-tests-only-0123456789';
process.env.DATA_STORE = 'memory';
process.env.LOG_LEVEL = 'silent';
process.env.CORS_ORIGINS = 'http://team07-meal-plan-web.s3-website-us-east-1.localhost:4566';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { handler } = require('../lambda');

const site = 'http://team07-meal-plan-web.s3-website-us-east-1.localhost:4566';
const token = jwt.sign({ role: 'user' }, process.env.JWT_SECRET, { subject: 'demo-user-1', expiresIn: '1h', algorithm: 'HS256' });

function event(method, rawPath, { body, rawBody, auth = true, headers = {} } = {}) {
  return {
    version: '2.0',
    routeKey: `${method} ${rawPath}`,
    rawPath,
    rawQueryString: '',
    headers: {
      host: 'abc123.execute-api.localhost.floci.io:4566',
      origin: site,
      ...(auth ? { authorization: `Bearer ${token}` } : {}),
      ...(body || rawBody ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    requestContext: { http: { method, path: rawPath, sourceIp: '127.0.0.1', userAgent: 'test' }, stage: '$default' },
    body: rawBody || (body ? JSON.stringify(body) : undefined),
    isBase64Encoded: false
  };
}

test('health check through the Lambda, with CORS for the S3 website', async () => {
  const result = await handler(event('GET', '/api/health', { auth: false }), {});
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['access-control-allow-origin'], site);
});

test('JSON bodies reach the service (create a plan, add a recipe)', async () => {
  const created = await handler(event('POST', '/api/mealplans', { body: { weekStart: '2026-11-23' } }), {});
  assert.equal(created.statusCode, 201, created.body);
  const plan = JSON.parse(created.body);
  const added = await handler(event('POST', `/api/mealplans/${plan.id}/entries`, { body: { recipeId: 'rcp-koshari', day: 'mon', meal: 'dinner' } }), {});
  assert.equal(added.statusCode, 201, added.body);
});

test('no token, bad JSON and too-big bodies get the same answers as the local API', async () => {
  assert.equal((await handler(event('GET', '/api/pantry', { auth: false }), {})).statusCode, 401);
  const bad = await handler(event('POST', '/api/pantry/items', { rawBody: '{"name":"x",}' }), {});
  assert.deepEqual([bad.statusCode, JSON.parse(bad.body).error.code], [400, 'VALIDATION_ERROR']);
  const big = await handler(event('POST', '/api/pantry/items', { body: { name: 'x'.repeat(30000) } }), {});
  assert.deepEqual([big.statusCode, JSON.parse(big.body).error.code], [413, 'PAYLOAD_TOO_LARGE']);
});

test('another website gets no CORS header', async () => {
  const result = await handler(event('GET', '/api/health', { auth: false, headers: { origin: 'http://evil.example' } }), {});
  assert.equal(result.headers['access-control-allow-origin'], undefined);
});
