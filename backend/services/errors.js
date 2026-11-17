// Errors the API sends back on purpose. The error handler turns them into
// { "error": { "code": "...", "message": "..." } } with the right status code.
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

const badRequest = (message) => new AppError(400, 'VALIDATION_ERROR', message);
const notFound = (code, message) => new AppError(404, code, message);
const conflict = (code, message) => new AppError(409, code, message);

module.exports = { AppError, badRequest, notFound, conflict };
