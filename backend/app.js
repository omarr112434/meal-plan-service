// Builds the Express app. server.js starts it; the tests start it on a random port.
const express = require('express');
const cors = require('cors');
const config = require('./config');
const requestLogger = require('./middleware/requestLogger');
const { notFound, errorHandler } = require('./middleware/errors');
const { createMealPlanService } = require('./services/mealPlanService');
const { createShoppingListService } = require('./services/shoppingListService');
const mealPlanController = require('./controllers/mealPlans');
const shoppingListController = require('./controllers/shoppingLists');
const mealPlanRoutes = require('./routes/mealPlans');
const shoppingListRoutes = require('./routes/shoppingLists');
const sampleRecipeRoutes = require('./routes/sampleRecipes');

function createApp({ store, recipes }) {
  const app = express();
  app.disable('x-powered-by');

  // 1. log every request (after it finishes, so we know the status)
  app.use(requestLogger);

  // 2. only our frontend origins may call the API from a browser
  app.use(cors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // 3. small JSON bodies only (a plan entry or an item edit is a few hundred bytes)
  app.use(express.json({ limit: '20kb' }));

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/', (req, res) => {
    res.status(200).json({
      name: 'Recipe Organizer API: Meal Plan and Shopping List service',
      endpoints: ['/api/health', '/api/mealplans', '/api/shoppinglists']
    });
  });

  // health check without touching the database
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', storage: store.kind, recipes: recipes.kind });
  });

  const mealPlans = createMealPlanService({ store, recipes });
  const shoppingLists = createShoppingListService({ store });

  app.use('/api/mealplans', mealPlanRoutes(mealPlanController(mealPlans)));
  app.use('/api/shoppinglists', shoppingListRoutes(shoppingListController(shoppingLists)));
  if (recipes.kind === 'sample') {
    app.use('/api/recipes', sampleRecipeRoutes(recipes));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
