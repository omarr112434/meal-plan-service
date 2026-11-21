// All settings come from environment variables:
// backend/.env when you run `npm run dev`, and docker-compose when it runs on Floci.
require('dotenv').config({ quiet: true });

const env = process.env;

function commaList(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const config = {
  port: Number(env.PORT) || 3000,
  isProduction: env.NODE_ENV === 'production',
  corsOrigins: commaList(env.CORS_ORIGINS || 'http://localhost:8080'),

  // Must be the same secret the login (Authentication / identity) part signs tokens with.
  jwtSecret: env.JWT_SECRET || '',

  // memory = nothing to install, data is lost on restart (good for quick tests)
  // dynamodb = DynamoDB tables on Floci (what we deploy)
  dataStore: (env.DATA_STORE || 'memory').toLowerCase(),

  // sample = built-in sample recipes until the Recipe Library service is plugged in
  // library = read recipes from the Recipe Library service (see docs/integration-notes.md)
  recipeSource: (env.RECIPE_SOURCE || 'sample').toLowerCase(),

  aws: {
    region: env.AWS_REGION || 'us-east-1',
    endpoint: env.AWS_ENDPOINT_URL || undefined
  },
  tables: {
    mealPlans: env.MEALPLANS_TABLE || 'MealPlans',
    shoppingLists: env.SHOPPINGLISTS_TABLE || 'ShoppingLists',
    pantries: env.PANTRIES_TABLE || 'Pantries'
  },
  autoCreateTables: env.AUTO_CREATE_TABLES === 'true',

  logLevel: (env.LOG_LEVEL || 'info').toLowerCase(),
  logToCloudWatch: env.LOG_TO_CLOUDWATCH === 'true',
  logGroup: env.LOG_GROUP || '/recipe-organizer/api'
};

// Returns a list of problems. server.js refuses to start if there are any.
config.check = function check() {
  const problems = [];

  if (config.jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters (see backend/.env.example).');
  }
  if (config.isProduction && /change-me/i.test(config.jwtSecret)) {
    problems.push('JWT_SECRET still has the example value. Generate a real one.');
  }
  if (!['memory', 'dynamodb'].includes(config.dataStore)) {
    problems.push('DATA_STORE must be memory or dynamodb.');
  }
  if (config.isProduction && config.dataStore === 'memory') {
    problems.push('DATA_STORE=memory loses every plan on restart. Use dynamodb when NODE_ENV=production.');
  }
  if (!['sample', 'library'].includes(config.recipeSource)) {
    problems.push('RECIPE_SOURCE must be sample or library.');
  }

  return problems;
};

module.exports = config;
