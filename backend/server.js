const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');
const { createStore } = require('./storage');
const { createRecipeSource } = require('./integrations/recipeSource');
const { createCloudWatchSink } = require('./cloudwatch');

async function main() {
  const problems = config.check();
  if (problems.length > 0) {
    problems.forEach((problem) => logger.error('config problem', { problem }));
    process.exit(1);
  }

  if (config.logToCloudWatch) {
    const sink = createCloudWatchSink({
      region: config.aws.region,
      endpoint: config.aws.endpoint,
      logGroup: config.logGroup
    });
    try {
      await sink.start();
      logger.sendTo(sink);
      logger.info('sending logs to CloudWatch Logs', { logGroup: config.logGroup, stream: sink.streamName });
    } catch (error) {
      logger.warn('CloudWatch Logs not reachable, logging to the console only', { reason: error.message });
    }
  }

  const store = await createStore(config);
  const recipes = createRecipeSource(config);
  if (recipes.kind === 'sample') {
    logger.warn('using the sample recipes (RECIPE_SOURCE=sample) until the Recipe Library service is plugged in');
  }

  const app = createApp({ store, recipes });
  app.listen(config.port, () => {
    logger.info(`Meal Plan API listening on http://localhost:${config.port}`, {
      env: config.isProduction ? 'production' : 'development',
      storage: store.kind,
      recipes: recipes.kind
    });
  });
}

main().catch((error) => {
  logger.error('API could not start', { detail: error.message });
  process.exit(1);
});
