module.exports = function pantryController(service) {
  return {
    async getPantry(req, res) {
      res.status(200).json(await service.getPantry(req.user.id));
    },

    async addItem(req, res) {
      res.status(201).json(await service.addItem(req.user.id, req.body));
    },

    async updateItem(req, res) {
      res.status(200).json(await service.updateItem(req.user.id, req.params.itemId, req.body));
    },

    async removeItem(req, res) {
      await service.removeItem(req.user.id, req.params.itemId);
      res.status(204).end();
    }
  };
};
