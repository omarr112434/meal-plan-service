// AWS Lambda entry point (the doctor's lab setup on Floci):
//   browser -> API Gateway HTTP API -> this Lambda -> the same Express app -> DynamoDB
// The setup below runs once per Lambda container (cold start) and is reused afterwards.
const serverless = require('serverless-http');
const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');
const { createStore } = require('./storage');
const { createRecipeSource } = require('./integrations/recipeSource');
const { createCloudWatchSink } = require('./cloudwatch');
const { loadSecrets } = require('./secrets');

let ready = null;
let sink = null;

const MAX_BODY = 20 * 1024; // same limit as express.json() in app.js

// serverless-http hands Express the raw body as a Buffer, and express.json() skips requests
// that are already read, so the JSON is parsed here with the same rules. Problems are passed
// on as req.bodyError and app.js answers them like the local API does (400 or 413).
function parseBody(req) {
  const raw = req.body;
  req.body = undefined;
  if (!Buffer.isBuffer(raw) || raw.length === 0) return;
  if (!/application\/json/i.test(req.headers['content-type'] || '')) return;
  if (raw.length > MAX_BODY) {
    req.bodyError = { type: 'entity.too.large' };
    return;
  }
  try {
    req.body = JSON.parse(raw.toString('utf8'));
  } catch {
    req.bodyError = { type: 'entity.parse.failed' };
  }
}

async function setUp() {
  await loadSecrets(config); // JWT secret from Secrets Manager
  const problems = config.check();
  if (problems.length > 0) throw new Error(`config problem: ${problems.join(' ')}`);

  if (config.logToCloudWatch) {
    sink = createCloudWatchSink({
      region: config.aws.region,
      endpoint: config.aws.endpoint,
      credentials: config.aws.credentials,
      logGroup: config.logGroup,
      intervalMs: 60000 // the handler sends the logs after every request instead
    });
    try {
      await sink.start();
      logger.sendTo(sink);
    } catch (error) {
      sink = null;
      logger.warn('CloudWatch Logs not reachable, logging to the Lambda output only', { reason: error.message });
    }
  }

  const store = await createStore(config); // tables are made by the deploy script, not here
  const recipes = createRecipeSource(config);
  logger.info('Meal Plan Lambda ready', { storage: store.kind, recipes: recipes.kind });
  return serverless(createApp({ store, recipes }), { request: parseBody });
}

exports.handler = async (event, context) => {
  if (!ready) {
    ready = setUp().catch((error) => {
      ready = null; // try again on the next request
      throw error;
    });
  }
  const handle = await ready;
  try {
    return await handle(event, context);
  } finally {
    // a Lambda may be frozen right after it answers, so send the log lines now
    if (sink) await sink.flush();
  }
};
