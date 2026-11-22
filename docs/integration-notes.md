# Integration Notes (for the other two services)

The Meal Plan and Shopping List service is finished and runs on its own. It uses two stand-ins
until your parts are merged: **sample recipes** and **test login tokens**. This page says exactly what
each part needs to provide so the stand-ins can be switched off.

The app is one Express API with one route module per service (proposal section 4.4), so your code
goes in the same `backend/` folder: `routes/`, `controllers/`, `services/`, mounted in `app.js`.

## 1. Authentication / identity (lead: Ahmed Shakib)

My routes already check tokens with `middleware/auth.js`. Your login endpoint just has to make
tokens the same way:

| | |
|---|---|
| Header | `Authorization: Bearer <token>` |
| Algorithm | HS256 |
| Secret | `JWT_SECRET` from `backend/.env` (same value for the whole API) |
| Claims | `sub` = user id (string), `role` = `"user"` or `"admin"`, `exp` = expiry |

Example with the `jsonwebtoken` package (already installed):

```js
const token = jwt.sign({ role: user.role }, process.env.JWT_SECRET, {
  subject: user.id, expiresIn: '1h', algorithm: 'HS256'
});
```

The frontend reads the token from `sessionStorage` under the key `authToken` (`frontend/js/session.js`).
After your login page stores it there, my pages work without the test-token box.
`requireRole('admin')` is also in `middleware/auth.js` for your admin routes.

## 2. Recipe Library (Ahmed Shakib)

Create `backend/services/recipeService.js` exporting these two functions, then set
`RECIPE_SOURCE=library` in `.env`:

```js
// All of this user's recipes. Used for the planner's recipe list.
async function getRecipesForUser(userId) // -> [{ id, title, tags }]

// One recipe, ONLY if it belongs to this user, otherwise null.
async function getRecipeForUser(userId, recipeId)
// -> { id, title, ingredients: [{ ingredientId, name, quantity, unit }] } or null
```

The ownership check in `getRecipeForUser` matters: it is what stops someone putting another user's
recipe in their plan (threat 6). The adapter is `integrations/libraryRecipes.js`.

**Every recipe needs structured ingredients, also the ones typed in by hand** (Phase 1 feedback:
"a recipe typed in manually through POST /api/recipes has no structured ingredients, so it adds nothing
to the shopping list"). If a recipe has no ingredients, the shopping list now warns the user
("Koshari has no ingredients yet"), but the fix is that `POST/PUT /api/recipes` accept and save
`ingredients` in the shape of section 3.

**When a recipe is deleted**, take it out of the user's meal plans too:

```js
await req.app.locals.mealPlans.removeRecipeEverywhere(req.user.id, recipeId); // returns how many entries
```

If that call is missing, nothing breaks: the planner shows "Recipe no longer in your library" and the
shopping list skips it with a warning.

Your `GET /api/recipes?q=` endpoint should return `[{ id, title, tags }]` like the stand-in in
`routes/sampleRecipes.js`. The stand-in is only mounted when `RECIPE_SOURCE=sample`, so it gets
out of the way automatically.

## 3. Import and Ingredient (Ahmed Bassem)

The shopping list adds ingredients up using the normalized shape your service produces. Each
ingredient saved on a recipe should look like:

```json
{ "ingredientId": "ing-onion", "name": "Onion", "quantity": 2, "unit": "" }
```

- `ingredientId`: from the ingredient dictionary. Same ingredient = same id, so "Onion" and
  "onions" from two recipes end up on one line.
- `quantity`: a number, or `null` for "to taste".
- `unit`: these are converted and added up: `g kg oz lb ml l tsp tbsp cup`. "piece/pieces" or `""`
  means a count. Other units (`clove`, `can`, `slice`...) are kept as they are and only added up with
  the same unit. The conversion table is in `services/ingredientMerge.js` if the dictionary needs more.

## 4. When an admin deletes a user (Authentication / identity)

Delete that user's meal plan data with the admin-only endpoint (or the same function in-process):

```
DELETE /api/admin/users/{userId}/mealplan-data     (Admin token; a User gets 403)
-> 200 { "userId": "...", "deleted": { "mealPlans": 2, "shoppingLists": 1, "pantry": 1 } }
```

## 5. Running everything together

- One `docker compose -f infra/floci/docker-compose.yml --profile app up -d --build` runs Floci,
  the API and the website. The DynamoDB tables are created by the API at startup; add yours to
  `storage/dynamoStore.js` (`tableDefinitions`) or a similar file.
- Logs go to CloudWatch Logs group `/recipe-organizer/api` as JSON lines. Use the same `logger.js`
  so your security events show up in the same alarms (`infra/scripts/setup-monitoring.sh`).
- Run `npm test` before every pull request. All tests must stay green (the GitHub Action runs them too).
- Deployment like the doctor's lab: `DEPLOY-FLOCI.bat` puts this service on Floci as its own Lambda
  (`meal-plan-service`) behind its own API Gateway routes. Your services can be added the same way
  (your own function, routes and least-privilege role) or behind the same HTTP API.
