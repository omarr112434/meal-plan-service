// Keeps everything in memory. Used by the tests and by `npm run dev` without Floci.
// Same rules as the DynamoDB store: one plan per user per week, and version checks on save.
const { AlreadyExistsError, VersionConflictError } = require('./errors');

const copy = (value) => (value ? structuredClone(value) : null);

function create() {
  const plans = new Map(); // "userId|weekStart" -> plan
  const lists = new Map(); // "userId|listId" -> list

  const planKey = (plan) => `${plan.userId}|${plan.weekStart}`;
  const listKey = (list) => `${list.userId}|${list.id}`;

  return {
    kind: 'memory',

    async findPlanByWeek(userId, weekStart) {
      return copy(plans.get(`${userId}|${weekStart}`));
    },

    async findPlanById(userId, planId) {
      for (const plan of plans.values()) {
        if (plan.userId === userId && plan.id === planId) return copy(plan);
      }
      return null;
    },

    async createPlan(plan) {
      if (plans.has(planKey(plan))) throw new AlreadyExistsError();
      plans.set(planKey(plan), copy(plan));
      return copy(plan);
    },

    async savePlan(plan) {
      const current = plans.get(planKey(plan));
      if (!current || current.version !== plan.version) throw new VersionConflictError();
      const saved = { ...copy(plan), version: plan.version + 1 };
      plans.set(planKey(plan), saved);
      return copy(saved);
    },

    async findList(userId, listId) {
      return copy(lists.get(`${userId}|${listId}`));
    },

    async createList(list) {
      if (lists.has(listKey(list))) throw new AlreadyExistsError();
      lists.set(listKey(list), copy(list));
      return copy(list);
    },

    async saveList(list) {
      const current = lists.get(listKey(list));
      if (!current || current.version !== list.version) throw new VersionConflictError();
      const saved = { ...copy(list), version: list.version + 1 };
      lists.set(listKey(list), saved);
      return copy(saved);
    }
  };
}

module.exports = { create };
