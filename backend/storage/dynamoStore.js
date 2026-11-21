// DynamoDB storage (Floci locally, the same code would run on real AWS).
//
// MealPlans      partition key userId, sort key weekStart  -> one plan per user per week
// ShoppingLists  partition key userId, sort key id
// Pantries       partition key userId                      -> one pantry per user
//
// Every read uses the userId from the token as the partition key, so a user can only
// ever reach items in their own partition.
const {
  DynamoDBClient,
  DescribeTableCommand,
  CreateTableCommand,
  waitUntilTableExists
} = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand
} = require('@aws-sdk/lib-dynamodb');
const { AlreadyExistsError, VersionConflictError } = require('./errors');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function tableDefinitions(tables) {
  return [
    {
      TableName: tables.mealPlans,
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'weekStart', KeyType: 'RANGE' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'userId', AttributeType: 'S' },
        { AttributeName: 'weekStart', AttributeType: 'S' }
      ],
      BillingMode: 'PAY_PER_REQUEST'
    },
    {
      TableName: tables.shoppingLists,
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'id', KeyType: 'RANGE' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'userId', AttributeType: 'S' },
        { AttributeName: 'id', AttributeType: 'S' }
      ],
      BillingMode: 'PAY_PER_REQUEST'
    },
    {
      TableName: tables.pantries,
      KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'userId', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST'
    }
  ];
}

// Network problems (Floci still starting) have no HTTP status; DynamoDB errors do.
function isConnectionProblem(error) {
  return !error.$metadata || !error.$metadata.httpStatusCode;
}

function create({ aws, tables }) {
  const client = new DynamoDBClient({
    region: aws.region,
    endpoint: aws.endpoint,
    ...(aws.credentials ? { credentials: aws.credentials } : {})
  });
  const db = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
  });

  async function putNew(tableName, item) {
    try {
      await db.send(new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(userId)'
      }));
      return item;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') throw new AlreadyExistsError();
      throw error;
    }
  }

  // Saves only if nobody changed the item since we read it (optimistic locking).
  async function putIfVersion(tableName, item) {
    const saved = { ...item, version: item.version + 1 };
    try {
      await db.send(new PutCommand({
        TableName: tableName,
        Item: saved,
        ConditionExpression: '#version = :expected',
        ExpressionAttributeNames: { '#version': 'version' },
        ExpressionAttributeValues: { ':expected': item.version }
      }));
      return saved;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') throw new VersionConflictError();
      throw error;
    }
  }

  // All items in one user's partition (their plans, or their lists).
  async function queryUser(tableName, userId) {
    const items = [];
    let startKey;
    do {
      const result = await db.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
        ExclusiveStartKey: startKey
      }));
      items.push(...(result.Items || []));
      startKey = result.LastEvaluatedKey;
    } while (startKey);
    return items;
  }

  // Returns true if something was deleted.
  async function deleteKey(tableName, key) {
    const result = await db.send(new DeleteCommand({ TableName: tableName, Key: key, ReturnValues: 'ALL_OLD' }));
    return Boolean(result.Attributes);
  }

  async function createTableIfMissing(definition) {
    try {
      await client.send(new DescribeTableCommand({ TableName: definition.TableName }));
      return false;
    } catch (error) {
      if (error.name !== 'ResourceNotFoundException') throw error;
    }
    try {
      await client.send(new CreateTableCommand(definition));
    } catch (error) {
      if (error.name !== 'ResourceInUseException') throw error; // created by someone else meanwhile
    }
    // check every 1-5 s (the SDK default waits 20 s between checks)
    await waitUntilTableExists(
      { client, maxWaitTime: 60, minDelay: 1, maxDelay: 5 },
      { TableName: definition.TableName }
    );
    return true;
  }

  return {
    kind: 'dynamodb',

    // Creates the tables if they are missing. Retries for a while because the API
    // container usually starts before Floci is ready to answer.
    async ensureTables({ attempts = 30, delayMs = 2000 } = {}) {
      const created = [];
      for (const definition of tableDefinitions(tables)) {
        for (let attempt = 1; ; attempt += 1) {
          try {
            if (await createTableIfMissing(definition)) created.push(definition.TableName);
            break;
          } catch (error) {
            if (!isConnectionProblem(error) || attempt >= attempts) throw error;
            await sleep(delayMs);
          }
        }
      }
      return created;
    },

    async findPlanByWeek(userId, weekStart) {
      const result = await db.send(new GetCommand({
        TableName: tables.mealPlans,
        Key: { userId, weekStart }
      }));
      return result.Item || null;
    },

    // The URL has the plan id, but the key is (userId, weekStart), so we look through
    // this user's plans only. One plan per week keeps that partition small.
    async findPlanById(userId, planId) {
      let startKey;
      do {
        const result = await db.send(new QueryCommand({
          TableName: tables.mealPlans,
          KeyConditionExpression: 'userId = :userId',
          FilterExpression: '#id = :planId',
          ExpressionAttributeNames: { '#id': 'id' },
          ExpressionAttributeValues: { ':userId': userId, ':planId': planId },
          ExclusiveStartKey: startKey
        }));
        if (result.Items && result.Items.length > 0) return result.Items[0];
        startKey = result.LastEvaluatedKey;
      } while (startKey);
      return null;
    },

    listPlans: (userId) => queryUser(tables.mealPlans, userId),
    createPlan: (plan) => putNew(tables.mealPlans, plan),
    savePlan: (plan) => putIfVersion(tables.mealPlans, plan),
    deletePlan: (userId, weekStart) => deleteKey(tables.mealPlans, { userId, weekStart }),

    async findList(userId, listId) {
      const result = await db.send(new GetCommand({
        TableName: tables.shoppingLists,
        Key: { userId, id: listId }
      }));
      return result.Item || null;
    },

    listLists: (userId) => queryUser(tables.shoppingLists, userId),
    createList: (list) => putNew(tables.shoppingLists, list),
    saveList: (list) => putIfVersion(tables.shoppingLists, list),
    deleteList: (userId, listId) => deleteKey(tables.shoppingLists, { userId, id: listId }),

    async findPantry(userId) {
      const result = await db.send(new GetCommand({ TableName: tables.pantries, Key: { userId } }));
      return result.Item || null;
    },

    createPantry: (pantry) => putNew(tables.pantries, pantry),
    savePantry: (pantry) => putIfVersion(tables.pantries, pantry),
    deletePantry: (userId) => deleteKey(tables.pantries, { userId }),

    // used by the tests to clean up after themselves
    client,
    tableNames: () => tableDefinitions(tables).map((definition) => definition.TableName)
  };
}

module.exports = { create, tableDefinitions };
