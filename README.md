# Recipe Organizer + Meal Plan (Team 07)

Cloud Computing and Cloud Security (26CSCN29H), group project.

| Service | Owner | Status |
|---|---|---|
| Recipe Library | Ahmed Shakib | not merged yet |
| Import and Ingredient | Ahmed Bassem | not merged yet |
| **Meal Plan and Shopping List** | **Omar Hany** | **done** (this code) |

The Meal Plan and Shopping List service lets a user:

- create a plan for a week and drag recipes into day/meal slots (or click a recipe, then a slot)
- move, copy and remove planned recipes
- generate one shopping list for the week, with the same ingredients added up
  (2 + 1 onions = 3 onions, 1 l + 300 ml milk = 1.3 l)
- edit list items, tick them off, add your own items and remove items
- keep a **pantry** of what is already at home: the list takes it off, so nothing is bought twice
- update the list after the plan changes: ticks, edits, added and removed items are kept

It runs on **Floci** (a free local copy of AWS) with **DynamoDB** for the data and **CloudWatch Logs**
for the logs, same setup as the labs. Until the other two services are merged it uses sample recipes
and test login tokens, so it can be run and demoed on its own (see `docs/integration-notes.md`).

## The doctor's lab setup on Floci (Windows): double-click DEPLOY-FLOCI.bat

1. Open **Docker Desktop** and wait for **Engine running**.
2. Double-click **`DEPLOY-FLOCI.bat`**. It starts Floci and deploys this service like the doctor's lab:

   | AWS service (on Floci) | What it does here |
   |---|---|
   | **S3** | Hosts the website (bucket `team07-meal-plan-web`) and the Lambda package |
   | **API Gateway** | HTTP API `meal-plan-http-api` with this service's 8 routes |
   | **Lambda** | `meal-plan-service`: the same Express app (`backend/lambda.js`) |
   | **DynamoDB** | Tables `MealPlans`, `ShoppingLists`, `Pantries` |
   | **IAM** | Role `meal-plan-service-role`: only its own tables, logs and secret |
   | **Secrets Manager** | `recipe-organizer/jwt-secret` (the Lambda reads it at start; it is not in its settings) |
   | **CloudWatch** | Log group `/recipe-organizer/api` (14 days), metric filters and 3 alarms |
   | **SNS** | Topic `meal-plan-alerts` that the alarms send to |

3. The planner opens from S3 with a test login token already copied: click the box, **Ctrl+V**,
   **Use this token**. The addresses are in `infra/floci/deploy/out/deployment.json`.
4. Look at everything in the **Floci console**: http://localhost:4566/_floci/ui

Running it again updates everything in place and keeps the data.

## Docker mode (Windows): double-click START.bat

1. Open **Docker Desktop** and wait for **Engine running**.
2. Double-click **`START.bat`** in this folder. The first time it makes `backend\.env` with a random
   secret, Docker downloads Floci and builds the app (a few minutes), then the planner opens in your
   browser with your test login token already copied: click the box, press **Ctrl+V**, then
   **Use this token**.
3. Double-click **`STOP.bat`** when you're done (data is kept). **`GET-TOKEN.bat`** copies a new
   token if the old one expired (they last 8 hours).
4. **`TEST-ON-FLOCI.bat`** runs the 40 API tests against DynamoDB on Floci (inside Docker, no Node
   needed) and writes the results to `docs/test-plan.md`.

Floci itself is never installed by hand: Docker downloads it the first time `START.bat` runs.
Keep Docker's storage on D: (Docker Desktop → Settings → Resources → Advanced → Disk image location).

## Run it on Floci (Git Bash, same commands as the lab guide)

You need Docker Desktop and Git Bash (installed in the lab guide). Every command runs in Git Bash
**inside this project folder** (the one with `backend`, `frontend` and `infra`).

### One time only

1. Make the settings file and put a real secret in it:

   ```bash
   cp backend/.env.example backend/.env
   ```

   Open `backend/.env` and replace the `JWT_SECRET=` value with a long random string. Easiest way
   (if Node is installed):

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   The API refuses to start with the example secret. `.env` is in `.gitignore` and never goes to GitHub.

2. If you haven't done Part 4 of the lab guide yet, set up the `floci` AWS CLI profile:

   ```bash
   aws configure set aws_access_key_id test --profile floci
   aws configure set aws_secret_access_key test --profile floci
   aws configure set region us-east-1 --profile floci
   aws configure set endpoint_url http://localhost:4566 --profile floci
   echo 'export AWS_PROFILE=floci AWS_PAGER="" MSYS_NO_PATHCONV=1' >> ~/.bashrc
   source ~/.bashrc
   ```

### Every time

1. Start Docker Desktop and wait for **Engine running**.
2. If the Lab 7 project is running, stop it first (it uses the same ports 4566, 3000 and 8080).
3. Start Floci, the API and the website:

   ```bash
   docker compose -f infra/floci/docker-compose.yml --profile app up -d --build
   ```

4. Get a test login token (until the login page is merged):

   ```bash
   docker compose -f infra/floci/docker-compose.yml exec api node scripts/dev-token.js
   ```

5. Open **http://localhost:8080**, go to the meal planner and paste the token.

Stop everything (your data is kept):

```bash
docker compose -f infra/floci/docker-compose.yml --profile app down
```

Never add `-v` to that command unless you want to delete all tables and logs.

### Useful commands

| What | Command |
|---|---|
| Floci console (looks like the AWS console) | open http://localhost:4566/_floci/ui |
| Is the API up? | `curl http://localhost:3000/api/health` |
| What is stored in DynamoDB | `bash infra/scripts/show-data.sh` |
| API logs from CloudWatch | `bash infra/scripts/tail-logs.sh` (add `--follow` or `--denied`) |
| Turn on the alarms (once, after the app started) | `bash infra/scripts/setup-monitoring.sh` |
| Create the tables by hand | `bash infra/scripts/create-tables.sh` (the API also does it at startup) |
| API container logs | `docker compose -f infra/floci/docker-compose.yml logs api` |

## Tests

```bash
cd backend
npm install
npm test               # 57 tests, no Floci needed
npm run test:floci     # the 40 API tests against DynamoDB on Floci, and rewrites docs/test-plan.md
```

`test:floci` makes its own `test-...` tables and deletes them at the end, so it doesn't touch the
real data. The results table is in `docs/test-plan.md`. The same requests can be sent by hand with
`backend/requests.http` (VS Code REST Client) or the Postman collection in `evidence/`.

## Quick run without Docker

For working on the code. Data is kept in memory and lost when the API stops.

```bash
cd backend && npm install && cp .env.example .env && npm run dev     # http://localhost:3000
cd frontend && npm install && npm start                               # http://localhost:8080
cd backend && npm run dev-token                                       # test token
```

(Set a real `JWT_SECRET` in `.env` first; the example one is only accepted outside production.)

## Folders

| Folder | What is in it |
|---|---|
| `backend/` | Express API: `routes/` → `controllers/` → `services/` → `storage/` (memory or DynamoDB) |
| `backend/integrations/` | Where recipes come from: sample recipes now, the Recipe Library later |
| `backend/tests/` | Automated tests (normal, invalid and security cases) |
| `frontend/` | `planner.html`, `shopping-list.html`, plain JS in `js/`, served by nginx |
| `infra/floci/` | Docker Compose file: Floci + API + website |
| `infra/scripts/` | AWS CLI scripts for tables, data, logs and alarms |
| `docs/` | API contract, test plan with results, notes for the other services |
| `evidence/` | Postman collection |

## Security in this service

| Control | Where |
|---|---|
| Every route needs a valid token (HS256 only, must have an expiry and a known role) | `middleware/auth.js` |
| User id always comes from the token. Every DynamoDB read uses it as the partition key, so other users' plans and lists can't be reached (404, same as an id that doesn't exist) | `services/*`, `storage/dynamoStore.js` |
| Only your own recipes can go in your plan | `services/mealPlanService.js` |
| All input checked on the server (dates, day, meal, ids, amounts, plain-text names), server-owned fields ignored, 20 kB body limit | `services/validation.js`, `app.js` |
| Pages only use `textContent`; nginx sends a strict Content-Security-Policy and other security headers | `frontend/js/*`, `frontend/nginx.conf` |
| CORS only allows the frontend's address | `app.js`, `CORS_ORIGINS` |
| No secrets in the code: `JWT_SECRET` only in `.env`; the API refuses to start with a weak or example secret | `config.js` |
| Two saves at the same time can't overwrite each other (version check on every write) | `storage/*` |
| Logs as JSON in CloudWatch, no tokens or bodies logged; alarms for failed logins and 500 errors | `logger.js`, `infra/scripts/setup-monitoring.sh` |
| Floci, its console, the API and the website only listen on 127.0.0.1, not the Wi-Fi network | `infra/floci/docker-compose.yml` |
| Containers: API runs as a non-root user, production install without dev packages | `backend/Dockerfile` |

## If something goes wrong

| What you see | What to do |
|---|---|
| `api` keeps restarting, logs say `JWT_SECRET` | Put a real secret in `backend/.env` (step 1 above), then run the start command again |
| `env file ... backend/.env not found` | You skipped `cp backend/.env.example backend/.env` |
| `port is already allocated` | The lab project (or `npm run dev`) is using the port. Stop it first |
| Page says "Cannot reach the API" | `docker compose -f infra/floci/docker-compose.yml ps` and check `api` is running |
| Page asks for a token again | Tokens last 8 hours. Make a new one (step 4) |
| `show-data.sh` says the account is not 000000000000 | `source ~/.bashrc` so the `floci` profile is used |
