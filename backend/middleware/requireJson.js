// Endpoints that read a body only accept JSON (415 otherwise, same as Lab 4).
module.exports = function requireJson(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json.' }
    });
  }
  next();
};
