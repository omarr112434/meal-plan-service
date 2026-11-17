// Makes a login token for testing, until the real login page (Authentication / identity) is ready.
// It signs with the JWT_SECRET from backend/.env, so the API accepts it.
//
//   npm run dev-token                         -> token for demo-user-1 (role user)
//   npm run dev-token -- demo-user-2          -> another user, for the "other user" tests
//   npm run dev-token -- demo-user-1 admin    -> admin role
require('dotenv').config({ quiet: true, path: require('path').join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');

const [userId = 'demo-user-1', role = 'user'] = process.argv.slice(2);
const secret = process.env.JWT_SECRET || '';

if (secret.length < 32) {
  console.error('JWT_SECRET in backend/.env is missing or too short. Copy .env.example to .env and set it first.');
  process.exit(1);
}
if (!['user', 'admin'].includes(role)) {
  console.error('Role must be user or admin.');
  process.exit(1);
}

const token = jwt.sign({ role }, secret, { subject: userId, expiresIn: '8h', algorithm: 'HS256' });
console.log(token);
