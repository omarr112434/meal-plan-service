const logger = require('../logger');

module.exports = function adminController(service) {
  return {
    async deleteUserData(req, res) {
      const result = await service.deleteUserData(req.params.userId);
      // audit trail: who deleted whose data, and how much
      logger.warn('admin deleted a user\'s meal plan data', {
        event: 'admin_delete_user_data',
        admin: req.user.id,
        target: result.userId,
        ...result.deleted
      });
      res.status(200).json(result);
    }
  };
};
