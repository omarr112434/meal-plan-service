module.exports = function shoppingListController(service) {
  return {
    async getList(req, res) {
      const list = await service.getList(req.user.id, req.params.id);
      res.status(200).json(list);
    },

    async addItem(req, res) {
      const item = await service.addItem(req.user.id, req.params.id, req.body);
      res.status(201).json(item);
    },

    async updateItem(req, res) {
      const item = await service.updateItem(req.user.id, req.params.id, req.params.itemId, req.body);
      res.status(200).json(item);
    },

    async removeItem(req, res) {
      await service.removeItem(req.user.id, req.params.id, req.params.itemId);
      res.status(204).end();
    }
  };
};
