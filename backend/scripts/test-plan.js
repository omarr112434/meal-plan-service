// Runs the API tests and writes docs/test-plan.md with the actual results (like the Lab 4 test plan).
//
//   npm run test:floci     against DynamoDB on Floci (http://localhost:4566); start Floci first
//   npm run test:memory    without Floci (memory store)
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const target = process.argv[2] === 'memory' ? 'memory' : 'floci';
const backendDir = path.join(__dirname, '..');
const planFile = path.join(backendDir, '..', 'docs', 'test-plan.md');
const reportFile = path.join(os.tmpdir(), `mealplan-test-report-${Date.now()}.json`);

const env = { ...process.env, TEST_REPORT: reportFile };
let where = 'the memory store (no database)';
if (target === 'floci') {
  env.TEST_DYNAMODB_ENDPOINT = process.env.TEST_DYNAMODB_ENDPOINT || 'http://localhost:4566';
  env.AWS_ACCESS_KEY_ID = env.AWS_ACCESS_KEY_ID || 'test';
  env.AWS_SECRET_ACCESS_KEY = env.AWS_SECRET_ACCESS_KEY || 'test';
  env.AWS_REGION = env.AWS_REGION || 'us-east-1';
  where = process.argv[3] || `DynamoDB on Floci (${env.TEST_DYNAMODB_ENDPOINT})`;
}

console.log(`Running the API tests against ${where}...\n`);
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'tests/api.test.js'], {
  cwd: backendDir,
  env,
  stdio: 'inherit'
});

if (!fs.existsSync(reportFile)) {
  console.error('\nNo results were recorded. If you used test:floci, is Floci running? (docker compose -f infra/floci/docker-compose.yml up -d)');
  process.exit(run.status || 1);
}

const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
fs.unlinkSync(reportFile);

const escape = (text) => String(text).replace(/\|/g, '\\|');
const passed = report.rows.filter((row) => row.pass).length;
const ranOn = new Date(report.ranAt).toUTCString().replace(' GMT', ' UTC');

const lines = [
  '# Test Plan: Meal Plan and Shopping List API',
  '',
  'Normal, invalid and security cases for the Meal Plan and Shopping List service.',
  'Every row is an automated test in `backend/tests/api.test.js`, so the whole table can be run again with one command.',
  '',
  `- Actual results recorded on **${ranOn}** against **${where}**.`,
  `- Result: **${passed} of ${report.rows.length} passed**.`,
  '- Run again: start Floci, then `cd backend` and `npm run test:floci` (rewrites this file).',
  '- The same requests can be sent by hand with `backend/requests.http` (VS Code REST Client) or the Postman collection in `evidence/`.',
  '- Tokens: user 1 is `demo-user-1`, user 2 is `demo-user-2` (made with `npm run dev-token`).',
  '',
  '| Test ID | Type | What we test | Request | Expected Result | Actual Result | Pass/Fail |',
  '|---|---|---|---|---|---|---|'
];
for (const row of report.rows) {
  lines.push(`| ${row.id} | ${row.type} | ${escape(row.title)} | \`${escape(row.request)}\` | ${escape(row.expected)} | ${escape(row.actual)} | ${row.pass ? 'Pass' : 'Fail'} |`);
}
lines.push(
  '',
  '## What the security cases cover',
  '',
  '| Threat (proposal section 6.4) | Tests |',
  '|---|---|',
  '| 5. Another user changes the id in the URL (IDOR) | T32, T33, T34, T35 |',
  '| 6. Using another user\'s recipe in your own plan | T36 |',
  '| 7. Script typed into an item name (stored XSS) | T38 (plus the page only uses textContent) |',
  '| Missing, expired, forged or unsigned tokens | T27, T28, T29, T30, T31 |',
  '| Client setting server-owned fields (id, userId) | T37 |',
  '| Other websites calling the API from a browser (CORS) | T39 |',
  '| Error responses leaking internal details | T21, T40 |',
  ''
);

fs.writeFileSync(planFile, lines.join('\n'));
console.log(`\n${passed}/${report.rows.length} passed. Wrote docs/test-plan.md`);
process.exit(run.status);
