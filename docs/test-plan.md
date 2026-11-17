# Test Plan: Meal Plan and Shopping List API

Normal, invalid and security cases for the Meal Plan and Shopping List service.
Every row is an automated test in `backend/tests/api.test.js`, so the whole table can be run again with one command.

- Actual results recorded on **Tue, 17 Nov 2026 15:48:28 UTC** against **a DynamoDB emulator (dynalite, same API as Floci's DynamoDB). Rerun with npm run test:floci on Floci**.
- Result: **40 of 40 passed**.
- Run again: start Floci, then `cd backend` and `npm run test:floci` (rewrites this file).
- The same requests can be sent by hand with `backend/requests.http` (VS Code REST Client) or the Postman collection in `evidence/`.
- Tokens: user 1 is `demo-user-1`, user 2 is `demo-user-2` (made with `npm run dev-token`).

| Test ID | Type | What we test | Request | Expected Result | Actual Result | Pass/Fail |
|---|---|---|---|---|---|---|
| T01 | Normal | Health check | `GET /api/health` | 200 | 200 | Pass |
| T02 | Normal | List my recipes for the planner | `GET /api/recipes?q=sou` | 200 | 200 | Pass |
| T03 | Normal | Create a weekly plan (date given is a Wednesday) | `POST /api/mealplans` | 201 | 201 | Pass |
| T04 | Normal | Open the plan using any day of that week | `GET /api/mealplans?week=2026-11-22` | 200 | 200 | Pass |
| T05 | Normal | Drag a recipe into Monday dinner | `POST /api/mealplans/{id}/entries` | 201 | 201 | Pass |
| T06 | Normal | Copy Koshari to Thursday dinner | `POST /api/mealplans/{id}/entries` | 201 | 201 | Pass |
| T07 | Normal | Move the copy to Friday lunch | `PATCH /api/mealplans/{id}/entries/{id}` | 200 | 200 | Pass |
| T08 | Normal | Remove Greek salad from the plan | `DELETE /api/mealplans/{id}/entries/{id}` | 204 | 204, no body | Pass |
| T09 | Normal | Generate the week's shopping list | `POST /api/mealplans/{id}/shoppinglist` | 201 | 201 | Pass |
| T10 | Normal | Open the shopping list | `GET /api/shoppinglists/{id}` | 200 | 200 | Pass |
| T11 | Normal | Tick off milk | `PATCH /api/shoppinglists/{id}/items/{id}` | 200 | 200 | Pass |
| T12 | Normal | Edit onion to 4 (already have some) | `PATCH /api/shoppinglists/{id}/items/{id}` | 200 | 200 | Pass |
| T13 | Normal | Generate the list again | `POST /api/mealplans/{id}/shoppinglist` | 201 | 201 | Pass |
| T14 | Invalid | Create a plan for 30 February | `POST /api/mealplans` | 400; VALIDATION_ERROR | 400; VALIDATION_ERROR | Pass |
| T15 | Invalid | Create a plan for a week that already has one | `POST /api/mealplans` | 409; PLAN_EXISTS | 409; PLAN_EXISTS | Pass |
| T16 | Invalid | Open a plan with ?week=next-week | `GET /api/mealplans?week=next-week` | 400; VALIDATION_ERROR | 400; VALIDATION_ERROR | Pass |
| T17 | Invalid | Open a week that has no plan | `GET /api/mealplans?week=2027-01-04` | 404; PLAN_NOT_FOUND | 404; PLAN_NOT_FOUND | Pass |
| T18 | Invalid | Add a recipe on day "funday" | `POST /api/mealplans/{id}/entries` | 400; VALIDATION_ERROR | 400; VALIDATION_ERROR | Pass |
| T19 | Invalid | Add a 5th recipe to the same slot | `POST /api/mealplans/{id}/entries` | 400; VALIDATION_ERROR | 400; VALIDATION_ERROR | Pass |
| T20 | Invalid | Add an entry with Content-Type text/plain | `POST /api/mealplans/{id}/entries` | 415; UNSUPPORTED_MEDIA_TYPE | 415; UNSUPPORTED_MEDIA_TYPE | Pass |
| T21 | Invalid | Add an entry with a trailing comma in the JSON | `POST /api/mealplans/{id}/entries` | 400; VALIDATION_ERROR | 400; VALIDATION_ERROR | Pass |
| T22 | Invalid | Move an entry id that does not exist | `PATCH /api/mealplans/{id}/entries/{id}` | 404; ENTRY_NOT_FOUND | 404; ENTRY_NOT_FOUND | Pass |
| T23 | Invalid | Set an item quantity to -2 | `PATCH /api/shoppinglists/{id}/items/{id}` | 400; VALIDATION_ERROR | 400; VALIDATION_ERROR | Pass |
| T24 | Invalid | Edit an item with an empty body {} | `PATCH /api/shoppinglists/{id}/items/{id}` | 400; VALIDATION_ERROR | 400; VALIDATION_ERROR | Pass |
| T25 | Invalid | Generate a list for a plan with no recipes | `POST /api/mealplans/{id}/shoppinglist` | 400; VALIDATION_ERROR | 400; VALIDATION_ERROR | Pass |
| T26 | Invalid | Unknown route | `PATCH /api/fake-url` | 404; ROUTE_NOT_FOUND | 404; ROUTE_NOT_FOUND | Pass |
| T27 | Security | Open a plan without logging in | `GET /api/mealplans?week=2026-11-16` | 401; UNAUTHORIZED | 401; UNAUTHORIZED | Pass |
| T28 | Security | Use an expired token | `GET /api/mealplans?week=2026-11-16` | 401; UNAUTHORIZED | 401; UNAUTHORIZED | Pass |
| T29 | Security | Use a token signed with a made-up secret | `GET /api/mealplans?week=2026-11-16` | 401; UNAUTHORIZED | 401; UNAUTHORIZED | Pass |
| T30 | Security | Use an unsigned token ("alg": "none") | `GET /api/mealplans?week=2026-11-16` | 401; UNAUTHORIZED | 401; UNAUTHORIZED | Pass |
| T31 | Security | Use a token with role "superuser" | `GET /api/mealplans?week=2026-11-16` | 401; UNAUTHORIZED | 401; UNAUTHORIZED | Pass |
| T32 | Security | User 2 adds an entry to user 1's plan | `POST /api/mealplans/{id}/entries` | 404; PLAN_NOT_FOUND | 404; PLAN_NOT_FOUND | Pass |
| T33 | Security | User 2 opens user 1's shopping list | `GET /api/shoppinglists/{id}` | 404; LIST_NOT_FOUND | 404; LIST_NOT_FOUND | Pass |
| T34 | Security | User 2 edits an item in user 1's list | `PATCH /api/shoppinglists/{id}/items/{id}` | 404; LIST_NOT_FOUND | 404; LIST_NOT_FOUND | Pass |
| T35 | Security | User 2 opens the same week | `GET /api/mealplans?week=2026-11-16` | 404; PLAN_NOT_FOUND | 404; PLAN_NOT_FOUND | Pass |
| T36 | Security | User 1 adds user 2's recipe to their plan | `POST /api/mealplans/{id}/entries` | 404; RECIPE_NOT_FOUND | 404; RECIPE_NOT_FOUND | Pass |
| T37 | Security | Create a plan with userId and id in the body | `POST /api/mealplans` | 201 | 201 | Pass |
| T38 | Security | Rename an item to <script>alert(1)</script> | `PATCH /api/shoppinglists/{id}/items/{id}` | 400; VALIDATION_ERROR | 400; VALIDATION_ERROR | Pass |
| T39 | Security | Browser request from another website | `GET /api/health with Origin: http://evil.example` | no Access-Control-Allow-Origin header | no Access-Control-Allow-Origin header | Pass |
| T40 | Security | Body that is a JSON array instead of an object | `POST /api/mealplans` | 400; VALIDATION_ERROR | 400; VALIDATION_ERROR | Pass |

## What the security cases cover

| Threat (proposal section 6.4) | Tests |
|---|---|
| 5. Another user changes the id in the URL (IDOR) | T32, T33, T34, T35 |
| 6. Using another user's recipe in your own plan | T36 |
| 7. Script typed into an item name (stored XSS) | T38 (plus the page only uses textContent) |
| Missing, expired, forged or unsigned tokens | T27, T28, T29, T30, T31 |
| Client setting server-owned fields (id, userId) | T37 |
| Other websites calling the API from a browser (CORS) | T39 |
| Error responses leaking internal details | T21, T40 |
