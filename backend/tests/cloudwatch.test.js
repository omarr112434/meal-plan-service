// Checks the CloudWatch log shipping with a fake client (no Floci needed).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCloudWatchSink } = require('../cloudwatch');

function fakeClient({ failPuts = false } = {}) {
  const sent = [];
  return {
    sent,
    async send(command) {
      const name = command.constructor.name;
      if (name === 'CreateLogGroupCommand' && sent.some((c) => c.name === name)) {
        const error = new Error('exists');
        error.name = 'ResourceAlreadyExistsException';
        throw error;
      }
      if (name === 'PutLogEventsCommand' && failPuts) throw new Error('CloudWatch is down');
      sent.push({ name, input: command.input });
      return {};
    }
  };
}

test('creates the group and stream, then sends lines in time order', async () => {
  const client = fakeClient();
  const sink = createCloudWatchSink({ client, logGroup: '/recipe-organizer/api', intervalMs: 60000 });
  await sink.start();
  sink.push(2000, 'second');
  sink.push(1000, 'first');
  await sink.stop();

  assert.deepEqual(client.sent.map((c) => c.name), ['CreateLogGroupCommand', 'CreateLogStreamCommand', 'PutLogEventsCommand']);
  const put = client.sent[2].input;
  assert.equal(put.logGroupName, '/recipe-organizer/api');
  assert.deepEqual(put.logEvents.map((e) => e.message), ['first', 'second']);
});

test('an existing log group is fine', async () => {
  const client = fakeClient();
  await createCloudWatchSink({ client, logGroup: 'g', intervalMs: 60000 }).start();
  const second = createCloudWatchSink({ client, logGroup: 'g', intervalMs: 60000 });
  await assert.doesNotReject(second.start());
  await second.stop();
});

test('if CloudWatch fails, nothing throws', async () => {
  const client = fakeClient({ failPuts: true });
  const sink = createCloudWatchSink({ client, logGroup: 'g', intervalMs: 60000 });
  await sink.start();
  sink.push(Date.now(), 'hello');
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.doesNotReject(sink.flush());
  } finally {
    console.error = originalError;
    await sink.stop();
  }
});
