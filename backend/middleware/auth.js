// Checks the login token on every protected request and puts the user on req.user.
//
// Token agreement with the Authentication / identity part (see docs/integration-notes.md):
//   header:  Authorization: Bearer <token>
//   signed:  HS256 with JWT_SECRET
//   claims:  sub = user id, role = "user" or "admin", exp = expiry time
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../logger');

const ROLES = new Set(['user', 'admin']);

function deny(req, res, reason) {
  logger.warn('auth failed', { event: 'auth_failed', reason, method: req.method, path: req.originalUrl.split('?')[0] });
  res.status(401).json({
    error: { code: 'UNAUTHORIZED', message: 'Log in first (missing, invalid or expired token).' }
  });
}

function requireAuth(req, res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) return deny(req, res, 'missing_token');

  let claims;
  try {
    // algorithms is fixed, so a token with "alg": "none" or another algorithm is rejected
    claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (error) {
    return deny(req, res, error.name === 'TokenExpiredError' ? 'expired_token' : 'invalid_token');
  }

  if (typeof claims.sub !== 'string' || claims.sub.length === 0 || claims.sub.length > 128
    || !ROLES.has(claims.role) || typeof claims.exp !== 'number') {
    return deny(req, res, 'bad_claims');
  }

  req.user = { id: claims.sub, role: claims.role };
  next();
}

// Not needed by the meal plan routes (users and admins both manage their own plans),
// but here for the admin-only routes of the other services.
function requireRole(role) {
  return (req, res, next) => {
    if (req.user && req.user.role === role) return next();
    logger.warn('role check failed', { event: 'forbidden', user: req.user ? req.user.id : null, path: req.originalUrl });
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' } });
  };
}

module.exports = { requireAuth, requireRole };
