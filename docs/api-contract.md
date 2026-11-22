# API Contract: Meal Plan and Shopping List Service

Owner: Omar Hany (Team 07).

Base URL on Floci:
- the doctor's lab setup (DEPLOY-FLOCI.bat): the API Gateway address printed at the end of the deploy
  (saved in `infra/floci/deploy/out/deployment.json`), for example `http://localhost:4566/execute-api/{apiId}`
- Docker mode (START.bat): `http://localhost:3000`

Every endpoint below needs a login token: `Authorization: Bearer <token>`.
Both roles (User and Admin) can use them, but only on their **own** plans and lists. The user id
always comes from the token, never from the request body or URL.

## Data dictionary

### MealPlan (DynamoDB table `MealPlans`, key `userId` + `weekStart`)

| Field | Type | Source | Rule |
|---|---|---|---|
| id | string (UUID) | Server | Unique, never changes. |
| userId | string | Server (token) | Owner. Stored but never sent back. |
| weekStart | string `YYYY-MM-DD` | Client | Any date is moved back to that week's Monday. One plan per user per week. |
| entries | list of MealPlanEntry | Server | Changed only through the entry endpoints. Max 60, max 4 per slot. |
| shoppingListId | string or null | Server | Set when the list is generated. |
| version | number | Server | Goes up on every save; used to stop two saves overwriting each other. Not sent back. |
| createdAt, updatedAt | ISO 8601 | Server | |

### MealPlanEntry (inside the plan)

| Field | Type | Source | Rule |
|---|---|---|---|
| id | string (UUID) | Server | |
| recipeId | string | Client | Must be one of the user's own recipes. |
| recipeTitle | string | Server | Looked up from the recipe library when sent back. |
| day | string | Client | `mon` `tue` `wed` `thu` `fri` `sat` `sun` |
| meal | string | Client | `breakfast` `lunch` `dinner` |

### ShoppingList (DynamoDB table `ShoppingLists`, key `userId` + `id`)

| Field | Type | Source | Rule |
|---|---|---|---|
| id | string (UUID) | Server | Generating again keeps the same id. |
| mealPlanId | string | Server | The plan it was built from. |
| weekStart | string | Server | Copied from the plan. |
| items | list of ShoppingListItem | Server | Max 300. |
| createdAt, updatedAt | ISO 8601 | Server | |

### ShoppingListItem

| Field | Type | Source | Rule |
|---|---|---|---|
| id | string (UUID) | Server | |
| ingredientId | string or null | Server | From the ingredient dictionary. |
| name | string | Server, editable | 1 to 60 characters, plain text only (no `<` or `>`). |
| quantity | number or null | Server, editable | Above 0 and up to 10000, rounded to 2 decimals. `null` = "as needed". |
| unit | string | Server, editable | Up to 15 letters, can be empty. |
| checked | boolean | Client | Ticked off or not. Starts `false`. Kept when the list is updated. |
| recipes | list of strings | Server | Which planned recipes need this item. |
| source | `plan` or `manual` | Server | `manual` = added by the user (kept when the list is updated). |
| edited | boolean | Server | The user changed the name, amount or unit; updating the list keeps their values. |
| needed | `{ quantity, unit }` or null | Server | What the plan needs before the pantry is taken off. |
| atHome | `{ quantity, unit }` or null | Server | What the pantry already has. |
| covered | boolean | Server | The pantry has all of it: nothing to buy ("Already at home"). |

The list also sends `warnings` (a recipe was deleted from the library, or has no ingredients) and
`outOfDate` (the plan's recipes or the pantry changed after the list was made).

### Pantry (DynamoDB table `Pantries`, key `userId`)

One pantry per user: what they already have at home. Items: `id`, `name` (same rules as list items),
`quantity` (number, or `null` = "I have plenty"), `unit`. Max 200 items. The same name with the same
kind of unit can't be added twice (`409 PANTRY_ITEM_EXISTS`); change the amount instead.

**How items are added up:** the same ingredient with the same unit is summed (2 + 1 onions = 3).
Different units of the same kind are converted first (1 l + 300 ml = 1.3 l, 0.5 kg + 200 g = 700 g).
Units that can't be added (3 cloves of garlic and 1 tsp of garlic) stay as two lines.

**How the pantry is taken off:** names match with simple plurals ("onions" = "onion"), units of the
same kind are converted (1.3 l needed - 500 ml at home = 0.8 l to buy), "I have plenty" covers the
item completely, and amounts in units that can't be converted are shown but not subtracted.

**Updating a list keeps the user's work:** ticks, edits, items they added and items they removed
(removed items don't come back). Items are matched by ingredient, so a renamed item still matches.

## Endpoints

| Method | Endpoint | Purpose | Success | Errors |
|---|---|---|---|---|
| POST | `/api/mealplans` | Create the plan for one week | 201 | 400, 401, 409, 415 |
| GET | `/api/mealplans?week={date}` | Open the plan for the week that contains `date` | 200 | 400, 401, 404 |
| POST | `/api/mealplans/{id}/entries` | Put a recipe in a day/meal slot (also used to copy one) | 201 | 400, 401, 404, 415 |
| PATCH | `/api/mealplans/{id}/entries/{entryId}` | Move an entry to another day or meal | 200 | 400, 401, 404, 415 |
| DELETE | `/api/mealplans/{id}/entries/{entryId}` | Remove an entry | 204 | 401, 404 |
| DELETE | `/api/mealplans/{id}` | Delete the week's plan (its shopping list goes with it) | 204 | 401, 404 |
| POST | `/api/mealplans/{id}/shoppinglist` | Generate or update the week's shopping list (keeps ticks and edits, takes off the pantry) | 201 | 400, 401, 404 |
| GET | `/api/shoppinglists/{id}` | Open a shopping list (with `outOfDate` and `warnings`) | 200 | 401, 404 |
| POST | `/api/shoppinglists/{id}/items` | Add your own item (e.g. paper towels) | 201 | 400, 401, 404, 415 |
| PATCH | `/api/shoppinglists/{id}/items/{itemId}` | Edit an item or tick it off | 200 | 400, 401, 404, 415 |
| DELETE | `/api/shoppinglists/{id}/items/{itemId}` | Remove an item (stays removed when the list is updated) | 204 | 401, 404 |
| GET | `/api/pantry` | My pantry | 200 | 401 |
| POST | `/api/pantry/items` | Add something I already have at home | 201 | 400, 401, 409, 415 |
| PATCH | `/api/pantry/items/{itemId}` | Change its name or amount | 200 | 400, 401, 404, 409, 415 |
| DELETE | `/api/pantry/items/{itemId}` | Used it up | 204 | 401, 404 |
| DELETE | `/api/admin/users/{userId}/mealplan-data` | **Admin only:** delete all of a user's plans, lists and pantry (when their account is deleted) | 200 | 400, 401, 403 |
| GET | `/api/health` | Is the API up (no token) | 200 | |

**Roles:** every endpoint needs a logged-in User or Admin, and works only on that user's own data.
Only the Admin role may call `/api/admin/...`; a User gets `403 FORBIDDEN` from the backend
(`requireRole('admin')` in `routes/admin.js`), whatever the page shows.

### Create a plan

```http
POST /api/mealplans
Content-Type: application/json

{ "weekStart": "2026-11-18" }
```

`201 Created` (2026-11-18 is a Wednesday, so the plan starts on Monday the 16th):

```json
{
  "id": "8f40272e-e935-46e1-9090-8288c2b49376",
  "weekStart": "2026-11-16",
  "entries": [],
  "shoppingListId": null,
  "createdAt": "2026-11-17T15:38:16.114Z",
  "updatedAt": "2026-11-17T15:38:16.114Z"
}
```

`409 PLAN_EXISTS` if the user already has a plan for that week.

### Put a recipe in a slot

```http
POST /api/mealplans/{id}/entries
Content-Type: application/json

{ "recipeId": "rcp-koshari", "day": "mon", "meal": "dinner" }
```

`201 Created`:

```json
{ "id": "67864afd-7ebc-4fec-8e55-5bda213f88d5", "recipeId": "rcp-koshari", "recipeTitle": "Koshari", "day": "mon", "meal": "dinner" }
```

Copying an entry is the same request with the same `recipeId` and a different slot.

### Move an entry

```http
PATCH /api/mealplans/{id}/entries/{entryId}
Content-Type: application/json

{ "day": "fri", "meal": "lunch" }
```

`200 OK` with the moved entry. Only `day` and `meal` can change.

### Generate the shopping list

`POST /api/mealplans/{id}/shoppinglist` (no body) gives `201 Created`:

```json
{
  "id": "4d0c6a8e-6f8f-4a54-9a0e-3f3b1c2d9e11",
  "mealPlanId": "8f40272e-e935-46e1-9090-8288c2b49376",
  "weekStart": "2026-11-16",
  "items": [
    { "id": "...", "ingredientId": "ing-milk", "name": "Milk", "quantity": 1.3, "unit": "l", "checked": false, "recipes": ["Pancakes", "Macarona bechamel"] },
    { "id": "...", "ingredientId": "ing-salt", "name": "Salt", "quantity": null, "unit": "", "checked": false, "recipes": ["Koshari"] }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

Generating again updates the same list and keeps ticks, edits, added and removed items. Planned
recipes that were deleted from the library are skipped with a warning. `400` if the plan has no recipes.

### Edit or tick off an item

```http
PATCH /api/shoppinglists/{id}/items/{itemId}
Content-Type: application/json

{ "checked": true }
```

Any of `name`, `quantity`, `unit`, `checked` can be sent; at least one is required. Anything else in
the body is ignored. `200 OK` with the updated item.

## Errors

Every error has the same shape (same as the lab API):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "day must be one of: mon, tue, wed, thu, fri, sat, sun." } }
```

| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Missing or wrong data, bad JSON, full slot, empty plan |
| 401 | UNAUTHORIZED | No token, or it is expired, forged, unsigned or has an unknown role |
| 404 | PLAN_NOT_FOUND | No plan with that id **for this user** (someone else's plan looks exactly the same) |
| 404 | ENTRY_NOT_FOUND | No entry with that id in the plan |
| 404 | RECIPE_NOT_FOUND | The recipe is not in this user's library |
| 404 | LIST_NOT_FOUND / ITEM_NOT_FOUND | Same as above for lists and items |
| 404 | PANTRY_ITEM_NOT_FOUND | No item with that id in **this user's** pantry |
| 403 | FORBIDDEN | A User called an Admin-only endpoint |
| 409 | PANTRY_ITEM_EXISTS | That item is already in the pantry |
| 404 | ROUTE_NOT_FOUND | Unknown method and path |
| 409 | PLAN_EXISTS | A plan for that week already exists |
| 409 | CONFLICT | The same plan was saved at the same moment somewhere else (after 3 retries) |
| 413 | PAYLOAD_TOO_LARGE | Body bigger than 20 kB |
| 415 | UNSUPPORTED_MEDIA_TYPE | The request has a body but its `Content-Type` is not `application/json` (for example a form post or plain text). Only the endpoints that read a body can answer 415; it stops the API from guessing what other formats mean. |
| 500 | INTERNAL_ERROR | Anything unexpected. Details go to the logs only. |

Why 404 and not 403 for other people's data: a 403 would confirm that the id exists, so ids could be
probed. With 404 the API answers the same whether the id belongs to someone else or never existed.
