// Keeps everything in memory. Used by the tests and by `npm run dev` without Floci.
// Same rules as the DynamoDB store: one plan per user per week, and version checks on save.
const { AlreadyExistsError, VersionConflictError } = require('./errors');

const copy = (value) => (value ? structuredClone(value) : null);

function create() {
  const plans = new Map(); // "userId|weekStart" -> plan
  const lists = new Map(); // "userId|listId" -> list
  const pantries = new Map(); // userId -> pantry

  const planKey = (plan) => `${plan.userId}|${plan.weekStart}`;
  const listKey = (list) => `${list.userId}|${list.id}`;

  function saveIfVersion(map, key, item) {
    const current = map.get(key);
    if (!current || current.version !== item.version) throw new VersionConflictError();
    const saved = { ...copy(item), version: item.version + 1 };
    map.set(key, saved);
    return copy(saved);
  }

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

    async listPlans(userId) {
      return [...plans.values()].filter((plan) => plan.userId === userId).map(copy);
    },

    async createPlan(plan) {
      if (plans.has(planKey(plan))) throw new AlreadyExistsError();
      plans.set(planKey(plan), copy(plan));
      return copy(plan);
    },

    savePlan: async (plan) => saveIfVersion(plans, planKey(plan), plan),

    async deletePlan(userId, weekStart) {
      return plans.delete(`${userId}|${weekStart}`);
    },

    async findList(userId, listId) {
      return copy(lists.get(`${userId}|${listId}`));
    },

    async listLists(userId) {
      return [...lists.values()].filter((list) => list.userId === userId).map(copy);
    },

    async createList(list) {
      if (lists.has(listKey(list))) throw new AlreadyExistsError();
      lists.set(listKey(list), copy(list));
      return copy(list);
    },

    saveList: async (list) => saveIfVersion(lists, listKey(list), list),

    async deleteList(userId, listId) {
      return lists.delete(`${userId}|${listId}`);
    },

    async findPantry(userId) {
      return copy(pantries.get(userId));
    },

    async createPantry(pantry) {
      if (pantries.has(pantry.userId)) throw new AlreadyExistsError();
      pantries.set(pantry.userId, copy(pantry));
      return copy(pantry);
    },

    savePantry: async (pantry) => saveIfVersion(pantries, pantry.userId, pantry),

    async deletePantry(userId) {
      return pantries.delete(userId);
    }
  };
}

module.exports = { create };
