// One-click deployment of the Meal Plan and Shopping List service (Omar Hany) on Floci,
// following the doctor's lab setup (Final Report components, section 2):
//
//   browser -> S3 website (pages) -> API Gateway HTTP API -> Lambda (the Express app) -> DynamoDB
//   + IAM role with only the permissions this Lambda needs
//   + Secrets Manager for the JWT secret
//   + CloudWatch Logs, metric filters and alarms, with an SNS topic for the alarms
//
// DEPLOY-FLOCI.bat runs this inside a node:22 container on the team07_net Docker network,
// so Floci is at http://floci:4566. Running it again updates everything in place.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { zipDirectory } = require('./zip');

const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const {
  S3Client, CreateBucketCommand, PutObjectCommand, PutBucketWebsiteCommand,
  PutBucketPolicyCommand, PutPublicAccessBlockCommand
} = require('@aws-sdk/client-s3');
const {
  IAMClient, CreateRoleCommand, GetRoleCommand, PutRolePolicyCommand
} = require('@aws-sdk/client-iam');
const {
  SecretsManagerClient, CreateSecretCommand, PutSecretValueCommand, DescribeSecretCommand
} = require('@aws-sdk/client-secrets-manager');
const {
  LambdaClient, CreateFunctionCommand, GetFunctionCommand, UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand, AddPermissionCommand, InvokeCommand
} = require('@aws-sdk/client-lambda');
const {
  ApiGatewayV2Client, GetApisCommand, CreateApiCommand, UpdateApiCommand, GetIntegrationsCommand,
  CreateIntegrationCommand, GetRoutesCommand, CreateRouteCommand, GetStagesCommand, CreateStageCommand
} = require('@aws-sdk/client-apigatewayv2');
const {
  CloudWatchLogsClient, CreateLogGroupCommand, PutRetentionPolicyCommand, PutMetricFilterCommand
} = require('@aws-sdk/client-cloudwatch-logs');
const { CloudWatchClient, PutMetricAlarmCommand } = require('@aws-sdk/client-cloudwatch');
const { SNSClient, CreateTopicCommand } = require('@aws-sdk/client-sns');

// ---------- settings ----------

const PROJECT = process.env.PROJECT_DIR || path.resolve(__dirname, '../../..');
const OUT = path.join(PROJECT, 'infra', 'floci', 'deploy', 'out');
const ENDPOINT = process.env.FLOCI_ENDPOINT || 'http://floci:4566'; // from inside Docker
const BROWSER_ENDPOINT = 'http://localhost:4566'; // the same Floci, from the browser on this PC
const REGION = 'us-east-1';
// Floci accepts any keys; "test" is the value from the lab guide, not a secret.
const AWS = { region: REGION, endpoint: ENDPOINT, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } };

const NAMES = {
  fn: 'meal-plan-service',
  role: 'meal-plan-service-role',
  policy: 'meal-plan-service-least-privilege',
  api: 'meal-plan-http-api',
  secret: 'recipe-organizer/jwt-secret',
  webBucket: 'team07-meal-plan-web',
  codeBucket: 'team07-meal-plan-artifacts',
  logGroup: '/recipe-organizer/api',
  topic: 'meal-plan-alerts',
  namespace: 'RecipeOrganizer',
  tables: { mealPlans: 'MealPlans', shoppingLists: 'ShoppingLists', pantries: 'Pantries' }
};
const SITE_ORIGIN = `http://${NAMES.webBucket}.s3-website-${REGION}.localhost:4566`;

// Only the routes of this service go to its Lambda. The other two services add their own.
const ROUTES = [
  'GET /api/health',
  'GET /api/recipes', // stand-in for the Recipe Library until it is merged
  'ANY /api/mealplans',
  'ANY /api/mealplans/{proxy+}',
  'ANY /api/shoppinglists/{proxy+}',
  'ANY /api/pantry',
  'ANY /api/pantry/{proxy+}',
  'ANY /api/admin/{proxy+}'
];

const sts = new STSClient(AWS);
const s3 = new S3Client({ ...AWS, forcePathStyle: true });
const iam = new IAMClient(AWS);
const secrets = new SecretsManagerClient(AWS);
const lambda = new LambdaClient(AWS);
const apigw = new ApiGatewayV2Client(AWS);
const logs = new CloudWatchLogsClient(AWS);
const cloudwatch = new CloudWatchClient(AWS);
const sns = new SNSClient(AWS);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let stepNumber = 0;
function step(text) {
  stepNumber += 1;
  console.log(`\n[${stepNumber}] ${text}`);
}
const done = (text) => console.log(`    ok: ${text}`);

async function ignore(names, promise) {
  try {
    return await promise;
  } catch (error) {
    if (names.includes(error.name) || names.includes(error.Code)) return null;
    throw error;
  }
}

// ---------- 1. settings from backend/.env ----------

function readJwtSecret() {
  const file = path.join(PROJECT, 'backend', '.env');
  if (!fs.existsSync(file)) throw new Error('backend/.env is missing. Run START.bat or infra/windows/make-env.ps1 once.');
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((text) => text.startsWith('JWT_SECRET='));
  const secret = line ? line.slice('JWT_SECRET='.length).trim() : '';
  if (secret.length < 32 || /change-me/i.test(secret)) {
    throw new Error('JWT_SECRET in backend/.env is missing, too short or still the example value.');
  }
  return secret;
}

// ---------- 2. Lambda package ----------

const BACKEND_FILES = [
  'app.js', 'lambda.js', 'config.js', 'logger.js', 'cloudwatch.js', 'secrets.js', 'package.json', 'package-lock.json'
];
const BACKEND_FOLDERS = ['controllers', 'routes', 'services', 'storage', 'integrations', 'middleware', 'data', 'scripts'];

function buildLambdaPackage() {
  const build = fs.mkdtempSync(path.join(os.tmpdir(), 'meal-plan-lambda-'));
  for (const file of BACKEND_FILES) fs.copyFileSync(path.join(PROJECT, 'backend', file), path.join(build, file));
  for (const folder of BACKEND_FOLDERS) {
    fs.cpSync(path.join(PROJECT, 'backend', folder), path.join(build, folder), { recursive: true });
  }
  // production packages only: no test tools in the Lambda
  execFileSync('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: build, stdio: 'inherit' });
  const zipFile = path.join(os.tmpdir(), 'meal-plan-lambda.zip');
  const count = zipDirectory(build, zipFile);
  return { build, zipFile, count, size: fs.statSync(zipFile).size };
}

// ---------- AWS steps ----------

async function accountId() {
  const result = await ignore(['NotImplemented'], sts.send(new GetCallerIdentityCommand({})));
  return (result && result.Account) || '000000000000';
}

async function storeSecret(value) {
  const created = await ignore(['ResourceExistsException'],
    secrets.send(new CreateSecretCommand({ Name: NAMES.secret, SecretString: value, Description: 'JWT signing secret (Team 07)' })));
  if (!created) await secrets.send(new PutSecretValueCommand({ SecretId: NAMES.secret, SecretString: value }));
  const described = await secrets.send(new DescribeSecretCommand({ SecretId: NAMES.secret }));
  return described.ARN;
}

async function createTables(build) {
  // the same table definitions the API uses (backend/storage/dynamoStore.js)
  const dynamoStore = require(path.join(build, 'storage', 'dynamoStore.js'));
  const store = dynamoStore.create({ aws: AWS, tables: NAMES.tables });
  const created = await store.ensureTables({ attempts: 15, delayMs: 2000 });
  return { created, all: Object.values(NAMES.tables) };
}

async function createLogGroup() {
  await ignore(['ResourceAlreadyExistsException'], logs.send(new CreateLogGroupCommand({ logGroupName: NAMES.logGroup })));
  // keep logs 14 days: enough for the coursework, and old logs don't pile up
  await logs.send(new PutRetentionPolicyCommand({ logGroupName: NAMES.logGroup, retentionInDays: 14 }));
}

function leastPrivilegePolicy(account, secretArn) {
  const table = (name) => `arn:aws:dynamodb:${REGION}:${account}:table/${name}`;
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'OwnTablesOnly', // no Scan, no CreateTable, no DeleteTable, no other tables
        Effect: 'Allow',
        Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:Query'],
        Resource: Object.values(NAMES.tables).map(table)
      },
      {
        Sid: 'OwnLogsOnly',
        Effect: 'Allow',
        Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        Resource: [
          `arn:aws:logs:${REGION}:${account}:log-group:${NAMES.logGroup}:*`,
          `arn:aws:logs:${REGION}:${account}:log-group:/aws/lambda/${NAMES.fn}:*`
        ]
      },
      {
        Sid: 'ReadTheJwtSecretOnly',
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [secretArn]
      }
    ]
  };
}

async function createRole(account, secretArn) {
  const trust = {
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }]
  };
  await ignore(['EntityAlreadyExistsException', 'EntityAlreadyExists'], iam.send(new CreateRoleCommand({
    RoleName: NAMES.role,
    AssumeRolePolicyDocument: JSON.stringify(trust),
    Description: 'Meal Plan and Shopping List Lambda (Team 07): its own tables, logs and secret only'
  })));
  await iam.send(new PutRolePolicyCommand({
    RoleName: NAMES.role,
    PolicyName: NAMES.policy,
    PolicyDocument: JSON.stringify(leastPrivilegePolicy(account, secretArn))
  }));
  const role = await iam.send(new GetRoleCommand({ RoleName: NAMES.role }));
  return role.Role.Arn;
}

async function createBucket(name) {
  await ignore(['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'], s3.send(new CreateBucketCommand({ Bucket: name })));
}

async function waitForFunction(check) {
  for (let i = 0; i < 60; i += 1) {
    const { Configuration } = await lambda.send(new GetFunctionCommand({ FunctionName: NAMES.fn }));
    if (check(Configuration)) return Configuration;
    if (Configuration.State === 'Failed' || Configuration.LastUpdateStatus === 'Failed') {
      throw new Error(`Lambda failed: ${Configuration.StateReason || Configuration.LastUpdateStatusReason}`);
    }
    await sleep(2000);
  }
  throw new Error('The Lambda did not become ready in 2 minutes.');
}

async function deployFunction(roleArn, codeKey) {
  const environment = {
    Variables: {
      NODE_ENV: 'production',
      DATA_STORE: 'dynamodb',
      AUTO_CREATE_TABLES: 'false', // the role may not create tables; this script made them
      RECIPE_SOURCE: 'sample',
      AWS_ENDPOINT_URL: ENDPOINT,
      FLOCI_ACCESS_KEY_ID: 'test', // dummy keys for the emulator; real AWS uses the role
      FLOCI_SECRET_ACCESS_KEY: 'test',
      JWT_SECRET_ID: NAMES.secret, // the name of the secret, not the secret
      CORS_ORIGINS: [SITE_ORIGIN, BROWSER_ENDPOINT, 'http://localhost:8080'].join(','),
      LOG_TO_CLOUDWATCH: 'true',
      LOG_GROUP: NAMES.logGroup,
      LOG_LEVEL: 'info',
      MEALPLANS_TABLE: NAMES.tables.mealPlans,
      SHOPPINGLISTS_TABLE: NAMES.tables.shoppingLists,
      PANTRIES_TABLE: NAMES.tables.pantries
    }
  };
  const settings = {
    FunctionName: NAMES.fn,
    Runtime: 'nodejs22.x',
    Handler: 'lambda.handler',
    Role: roleArn,
    Timeout: 30,
    MemorySize: 512,
    Description: 'Meal Plan and Shopping List service (Team 07, Omar Hany)',
    Environment: environment
  };

  const exists = await ignore(['ResourceNotFoundException'], lambda.send(new GetFunctionCommand({ FunctionName: NAMES.fn })));
  if (!exists) {
    await lambda.send(new CreateFunctionCommand({ ...settings, Code: { S3Bucket: NAMES.codeBucket, S3Key: codeKey } }));
  } else {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: NAMES.fn, S3Bucket: NAMES.codeBucket, S3Key: codeKey }));
    await waitForFunction((config) => config.LastUpdateStatus !== 'InProgress');
    await lambda.send(new UpdateFunctionConfigurationCommand(settings));
  }
  const config = await waitForFunction((current) => current.State === 'Active' && current.LastUpdateStatus !== 'InProgress');
  return config.FunctionArn;
}

// A request in the same shape API Gateway sends (payload format 2.0).
function healthEvent() {
  return {
    version: '2.0',
    routeKey: 'GET /api/health',
    rawPath: '/api/health',
    rawQueryString: '',
    headers: { host: 'deploy-check', accept: 'application/json' },
    requestContext: { http: { method: 'GET', path: '/api/health', sourceIp: '127.0.0.1', userAgent: 'deploy' }, stage: '$default' },
    isBase64Encoded: false
  };
}

async function warmUp() {
  // the first call downloads the Node.js Lambda image, so it can take a few minutes
  const started = Date.now();
  const result = await lambda.send(new InvokeCommand({ FunctionName: NAMES.fn, Payload: Buffer.from(JSON.stringify(healthEvent())) }));
  const text = Buffer.from(result.Payload || []).toString('utf8');
  if (result.FunctionError) throw new Error(`The Lambda answered with an error: ${text.slice(0, 500)}`);
  const answer = JSON.parse(text || '{}');
  if (answer.statusCode !== 200) throw new Error(`Health check through the Lambda gave ${answer.statusCode}: ${text.slice(0, 300)}`);
  return Math.round((Date.now() - started) / 1000);
}

async function deployApi(functionArn, account) {
  const cors = {
    AllowOrigins: [SITE_ORIGIN, BROWSER_ENDPOINT, 'http://localhost:8080'],
    AllowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    AllowHeaders: ['authorization', 'content-type'],
    MaxAge: 600
  };
  const apis = await apigw.send(new GetApisCommand({}));
  let api = (apis.Items || []).find((item) => item.Name === NAMES.api);
  if (!api) {
    api = await apigw.send(new CreateApiCommand({
      Name: NAMES.api, ProtocolType: 'HTTP', CorsConfiguration: cors, Description: 'Meal Plan and Shopping List API (Team 07)'
    }));
  } else {
    await apigw.send(new UpdateApiCommand({ ApiId: api.ApiId, CorsConfiguration: cors }));
  }
  const apiId = api.ApiId;

  const integrations = await apigw.send(new GetIntegrationsCommand({ ApiId: apiId }));
  let integration = (integrations.Items || []).find((item) => item.IntegrationUri === functionArn);
  if (!integration) {
    integration = await apigw.send(new CreateIntegrationCommand({
      ApiId: apiId, IntegrationType: 'AWS_PROXY', IntegrationUri: functionArn, PayloadFormatVersion: '2.0', TimeoutInMillis: 29000
    }));
  }

  const routes = await apigw.send(new GetRoutesCommand({ ApiId: apiId }));
  const existing = new Set((routes.Items || []).map((route) => route.RouteKey));
  for (const routeKey of ROUTES) {
    if (!existing.has(routeKey)) {
      await apigw.send(new CreateRouteCommand({ ApiId: apiId, RouteKey: routeKey, Target: `integrations/${integration.IntegrationId}` }));
    }
  }

  const stages = await apigw.send(new GetStagesCommand({ ApiId: apiId }));
  if (!(stages.Items || []).some((stage) => stage.StageName === '$default')) {
    await apigw.send(new CreateStageCommand({ ApiId: apiId, StageName: '$default', AutoDeploy: true }));
  }

  await ignore(['ResourceConflictException'], lambda.send(new AddPermissionCommand({
    FunctionName: NAMES.fn,
    StatementId: 'allow-meal-plan-http-api',
    Action: 'lambda:InvokeFunction',
    Principal: 'apigateway.amazonaws.com',
    SourceArn: `arn:aws:execute-api:${REGION}:${account}:${apiId}/*/*`
  })));
  return apiId;
}

// GET with an optional Host header (for the execute-api host name that only resolves on the PC).
function get(url, host) {
  return new Promise((resolve) => {
    const request = http.get(url, { headers: host ? { Host: host } : {}, timeout: 60000 }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', () => resolve({ status: 0, body: '' }));
  });
}

// Floci answers API Gateway calls on a few kinds of address. Use the first one that works.
async function findApiAddress(apiId) {
  const candidates = [
    { inside: `${ENDPOINT}/execute-api/${apiId}`, browser: `${BROWSER_ENDPOINT}/execute-api/${apiId}` },
    { inside: `${ENDPOINT}/execute-api/${apiId}/$default`, browser: `${BROWSER_ENDPOINT}/execute-api/${apiId}/$default` },
    { inside: ENDPOINT, host: `${apiId}.execute-api.localhost.floci.io:4566`, browser: `http://${apiId}.execute-api.localhost.floci.io:4566` }
  ];
  for (const candidate of candidates) {
    const answer = await get(`${candidate.inside}/api/health`, candidate.host);
    if (answer.status === 200 && answer.body.includes('"ok"')) return candidate.browser;
  }
  return null;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

async function deployWebsite(apiBase) {
  await createBucket(NAMES.webBucket);
  await ignore(['NotImplemented', 'AccessDenied'], s3.send(new PutPublicAccessBlockCommand({
    Bucket: NAMES.webBucket,
    PublicAccessBlockConfiguration: { BlockPublicAcls: false, IgnorePublicAcls: false, BlockPublicPolicy: false, RestrictPublicBuckets: false }
  })));
  await s3.send(new PutBucketWebsiteCommand({
    Bucket: NAMES.webBucket,
    WebsiteConfiguration: { IndexDocument: { Suffix: 'index.html' }, ErrorDocument: { Key: 'index.html' } }
  }));
  // anyone may READ the pages (it's a public website); nobody may write without credentials
  await s3.send(new PutBucketPolicyCommand({
    Bucket: NAMES.webBucket,
    Policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Sid: 'PublicReadPagesOnly', Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `arn:aws:s3:::${NAMES.webBucket}/*` }]
    })
  }));

  const site = path.join(PROJECT, 'frontend');
  const files = ['index.html', 'planner.html', 'shopping-list.html', 'pantry.html', 'css/style.css', 'img/favicon.svg',
    ...fs.readdirSync(path.join(site, 'js')).filter((name) => name.endsWith('.js') && name !== 'config.js').map((name) => `js/${name}`)];
  for (const file of files) {
    await s3.send(new PutObjectCommand({
      Bucket: NAMES.webBucket,
      Key: file,
      Body: fs.readFileSync(path.join(site, file)),
      ContentType: TYPES[path.extname(file)] || 'application/octet-stream',
      CacheControl: 'no-cache'
    }));
  }
  const config = [
    '// Made by infra/floci/deploy/deploy.js: the pages are in S3 and the API is API Gateway + Lambda,',
    '// all on Floci on this PC. Nothing here is secret.',
    'const isLocal = true;',
    `const API_BASE_URL = '${apiBase}/api';`,
    ''
  ].join('\n');
  await s3.send(new PutObjectCommand({ Bucket: NAMES.webBucket, Key: 'js/config.js', Body: config, ContentType: TYPES['.js'], CacheControl: 'no-cache' }));
  return files.length + 1;
}

async function setUpMonitoring() {
  const topic = await sns.send(new CreateTopicCommand({ Name: NAMES.topic }));
  const filters = [
    { name: 'auth-failures', pattern: '{ $.event = "auth_failed" }', metric: 'AuthFailures' },
    { name: 'access-denied', pattern: '{ $.event = "access_denied" }', metric: 'AccessDenied' },
    { name: 'server-errors', pattern: '{ $.event = "server_error" }', metric: 'ServerErrors' }
  ];
  for (const filter of filters) {
    await logs.send(new PutMetricFilterCommand({
      logGroupName: NAMES.logGroup,
      filterName: filter.name,
      filterPattern: filter.pattern,
      metricTransformations: [{ metricName: filter.metric, metricNamespace: NAMES.namespace, metricValue: '1', defaultValue: 0 }]
    }));
  }
  const alarms = [
    { name: 'recipe-organizer-auth-failures', metric: 'AuthFailures', threshold: 5, text: '5+ requests with a bad or missing token in 5 minutes' },
    { name: 'recipe-organizer-access-denied', metric: 'AccessDenied', threshold: 10, text: '10+ refused requests (401/403) in 5 minutes' },
    { name: 'recipe-organizer-server-errors', metric: 'ServerErrors', threshold: 1, text: 'Any 500 error from the API' }
  ];
  for (const alarm of alarms) {
    await cloudwatch.send(new PutMetricAlarmCommand({
      AlarmName: alarm.name,
      AlarmDescription: alarm.text,
      Namespace: NAMES.namespace,
      MetricName: alarm.metric,
      Statistic: 'Sum',
      Period: 300,
      EvaluationPeriods: 1,
      Threshold: alarm.threshold,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      TreatMissingData: 'notBreaching',
      AlarmActions: [topic.TopicArn]
    }));
  }
  return { topicArn: topic.TopicArn, filters: filters.length, alarms: alarms.length };
}

function makeTokens(build, secret) {
  const jwt = require(path.join(build, 'node_modules', 'jsonwebtoken'));
  const sign = (user, role) => jwt.sign({ role }, secret, { subject: user, expiresIn: '8h', algorithm: 'HS256' });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'token.txt'), sign('demo-user-1', 'user'));
  fs.writeFileSync(path.join(OUT, 'admin-token.txt'), sign('admin-1', 'admin'));
}

// ---------- main ----------

async function main() {
  console.log('Deploying the Meal Plan and Shopping List service on Floci (the doctor\'s lab setup)');
  console.log(`Floci: ${ENDPOINT}`);

  step('Reading the JWT secret from backend/.env (it is never printed)');
  const secret = readJwtSecret();
  done('found');

  step('Building the Lambda package (backend code + production packages, no tests)');
  const pkg = buildLambdaPackage();
  done(`${pkg.count} files, ${(pkg.size / 1024 / 1024).toFixed(1)} MB`);

  const account = await accountId();

  step('Secrets Manager: storing the JWT secret');
  const secretArn = await storeSecret(secret);
  done(secretArn);

  step('DynamoDB: tables MealPlans, ShoppingLists, Pantries');
  const tables = await createTables(pkg.build);
  done(tables.created.length ? `created ${tables.created.join(', ')}` : 'already there (data kept)');

  step('CloudWatch Logs: log group with 14-day retention');
  await createLogGroup();
  done(NAMES.logGroup);

  step('IAM: Lambda role with least privilege (own tables, own logs, own secret)');
  const roleArn = await createRole(account, secretArn);
  done(roleArn);

  step('S3: uploading the Lambda package');
  await createBucket(NAMES.codeBucket);
  const codeKey = `lambda/${NAMES.fn}.zip`;
  await s3.send(new PutObjectCommand({ Bucket: NAMES.codeBucket, Key: codeKey, Body: fs.readFileSync(pkg.zipFile) }));
  done(`s3://${NAMES.codeBucket}/${codeKey}`);

  step('Lambda: creating or updating the function');
  const functionArn = await deployFunction(roleArn, codeKey);
  done(functionArn);

  if (process.env.SKIP_INVOKE !== '1') {
    step('Lambda: first call (downloads the Node.js image the first time, can take a few minutes)');
    done(`health check answered in ${await warmUp()} s`);
  }

  step('API Gateway: HTTP API with this service\'s routes');
  const apiId = await deployApi(functionArn, account);
  done(`${apiId} (${ROUTES.length} routes, stage $default)`);

  step('Finding the API address that works from the browser');
  const apiBase = (await findApiAddress(apiId)) || `http://${apiId}.execute-api.localhost.floci.io:4566`;
  done(apiBase);

  step('S3: website bucket with the pages');
  const uploaded = await deployWebsite(apiBase);
  done(`${uploaded} files in s3://${NAMES.webBucket}`);

  step('CloudWatch: metric filters and alarms, alarms send to an SNS topic');
  const monitoring = await setUpMonitoring();
  done(`${monitoring.filters} metric filters, ${monitoring.alarms} alarms -> ${monitoring.topicArn}`);

  step('Login tokens for testing (until the login page is merged)');
  makeTokens(pkg.build, secret);
  done('saved for DEPLOY-FLOCI.bat (copied to the clipboard, then deleted)');

  const site = `${SITE_ORIGIN}/`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'site-url.txt'), site);
  fs.writeFileSync(path.join(OUT, 'deployment.json'), JSON.stringify({
    deployedAt: new Date().toISOString(),
    website: site,
    websitePathStyle: `${BROWSER_ENDPOINT}/${NAMES.webBucket}/index.html`,
    api: apiBase,
    apiId,
    function: functionArn,
    role: roleArn,
    secret: secretArn,
    tables: tables.all,
    logGroup: NAMES.logGroup,
    alarmTopic: monitoring.topicArn
  }, null, 2));

  console.log('\nDeployed.');
  console.log(`  Website (S3):        ${site}`);
  console.log(`  Same, path style:    ${BROWSER_ENDPOINT}/${NAMES.webBucket}/index.html`);
  console.log(`  API (API Gateway):   ${apiBase}/api/health`);
  console.log('  AWS services used:   S3, API Gateway, Lambda, DynamoDB, IAM, Secrets Manager, CloudWatch, SNS');
}

main().catch((error) => {
  console.error(`\nDEPLOY FAILED: ${error.name || 'Error'}: ${error.message}`);
  process.exit(1);
});
