const { AppError } = require('../services/errors');
const logger = require('../logger');

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// Nothing matched the method and path
function notFound(req, res) {
  sendError(res, 404, 'ROUTE_NOT_FOUND', 'Route not found.');
}

// Central error handler. Internal details only go to the logs, never to the client.
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  if (error instanceof AppError) {
    return sendError(res, error.status, error.code, error.message);
  }
  if (error.type === 'entity.parse.failed') {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Request body is not valid JSON.');
  }
  if (error.type === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  if (error.code === 'VERSION_CONFLICT') {
    return sendError(res, 409, 'CONFLICT', 'This was changed at the same time somewhere else. Reload and try again.');
  }

  logger.error('unexpected error', { event: 'server_error', error: error.name, detail: error.message });
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
}

module.exports = { notFound, errorHandler };
