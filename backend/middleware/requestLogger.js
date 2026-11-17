// One log line per request: method, path, status, time taken and the user id.
// No headers or bodies, so tokens and personal data never end up in the logs.
const logger = require('../logger');

module.exports = function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const fields = {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      user: req.user ? req.user.id : null
    };

    if (res.statusCode >= 500) {
      logger.error('request failed', { ...fields, event: 'server_error' });
    } else if (res.statusCode === 401 || res.statusCode === 403) {
      logger.warn('request denied', { ...fields, event: 'access_denied' });
    } else {
      logger.info('request', fields);
    }
  });

  next();
};
