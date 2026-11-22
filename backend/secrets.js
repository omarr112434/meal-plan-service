// Reads the JWT secret from AWS Secrets Manager when JWT_SECRET_ID is set (the Lambda on Floci).
// That way the secret is not in the code, the repo or the Lambda's settings; only the Lambda's
// IAM role may read it (secretsmanager:GetSecretValue on this one secret).
// Locally (npm run dev, Docker) JWT_SECRET_ID is empty and the secret comes from backend/.env.
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function loadSecrets(config) {
  if (!config.jwtSecretId) return false;
  const client = new SecretsManagerClient({
    region: config.aws.region,
    endpoint: config.aws.endpoint,
    ...(config.aws.credentials ? { credentials: config.aws.credentials } : {})
  });
  const result = await client.send(new GetSecretValueCommand({ SecretId: config.jwtSecretId }));
  config.jwtSecret = result.SecretString || '';
  return true;
}

module.exports = { loadSecrets };
