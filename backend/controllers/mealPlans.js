// Turns HTTP requests into service calls. req.user comes from the auth middleware,
// never from the request body. Express 5 sends errors from these async functions
// to the error handler by itself.
module.exports = function mealPlanController(service) {
  return {
    async create(req, res) {
      const plan = await service.createPlan(req.user.id, req.body);
      res.status(201).json(plan);
    },

    async getForWeek(req, res) {
      const plan = await service.getPlanForWeek(req.user.id, req.query.week);
      res.status(200).json(plan);
    },

    async deletePlan(req, res) {
      await service.deletePlan(req.user.id, req.params.id);
      res.status(204).end();
    },

    async addEntry(req, res) {
      const entry = await service.addEntry(req.user.id, req.params.id, req.body);
      res.status(201).json(entry);
    },

    async moveEntry(req, res) {
      const entry = await service.moveEntry(req.user.id, req.params.id, req.params.entryId, req.body);
      res.status(200).json(entry);
    },

    async removeEntry(req, res) {
      await service.removeEntry(req.user.id, req.params.id, req.params.entryId);
      res.status(204).end();
    },

    async generateShoppingList(req, res) {
      const list = await service.generateShoppingList(req.user.id, req.params.id);
      res.status(201).json(list);
    }
  };
};
