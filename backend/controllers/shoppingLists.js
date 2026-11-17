module.exports = function shoppingListController(service) {
  return {
    async getList(req, res) {
      const list = await service.getList(req.user.id, req.params.id);
      res.status(200).json(list);
    },

    async updateItem(req, res) {
      const item = await service.updateItem(req.user.id, req.params.id, req.params.itemId, req.body);
      res.status(200).json(item);
    }
  };
};
