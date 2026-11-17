// Both stores (memory and DynamoDB) throw these, so the services don't care which one is used.
class AlreadyExistsError extends Error {
  constructor(message = 'Item already exists.') {
    super(message);
    this.code = 'ALREADY_EXISTS';
  }
}

// Someone saved the item after we read it (we compare the version number).
class VersionConflictError extends Error {
  constructor(message = 'Item changed since it was read.') {
    super(message);
    this.code = 'VERSION_CONFLICT';
  }
}

module.exports = { AlreadyExistsError, VersionConflictError };
