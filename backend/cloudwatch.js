// Ships our log lines to CloudWatch Logs on Floci (log group /recipe-organizer/api).
// Lines are buffered and sent every 2 seconds. If CloudWatch is not reachable the API keeps
// working and the lines still go to the container output.
const os = require('os');
const {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand
} = require('@aws-sdk/client-cloudwatch-logs');

const MAX_QUEUE = 5000;
const MAX_BATCH = 500;

function createCloudWatchSink({ region, endpoint, logGroup, client, intervalMs = 2000 }) {
  const cloudWatch = client || new CloudWatchLogsClient({ region, endpoint });
  const streamName = `${os.hostname()}-${new Date().toISOString().slice(0, 10)}`;
  let queue = [];
  let timer = null;
  let warned = false;

  async function createIfMissing(command) {
    try {
      await cloudWatch.send(command);
    } catch (error) {
      if (error.name !== 'ResourceAlreadyExistsException') throw error;
    }
  }

  async function start() {
    await createIfMissing(new CreateLogGroupCommand({ logGroupName: logGroup }));
    await createIfMissing(new CreateLogStreamCommand({ logGroupName: logGroup, logStreamName: streamName }));
    timer = setInterval(() => flush(), intervalMs);
    timer.unref();
  }

  function push(timestamp, message) {
    queue.push({ timestamp, message });
    if (queue.length > MAX_QUEUE) {
      queue = queue.slice(-MAX_QUEUE); // drop the oldest lines instead of eating memory
    }
  }

  async function flush() {
    if (queue.length === 0) return;
    const batch = queue.splice(0, MAX_BATCH).sort((a, b) => a.timestamp - b.timestamp);
    try {
      await cloudWatch.send(new PutLogEventsCommand({
        logGroupName: logGroup,
        logStreamName: streamName,
        logEvents: batch
      }));
    } catch (error) {
      // console.error here, not the logger, or a failing CloudWatch would log about itself forever
      if (!warned) {
        console.error(JSON.stringify({ level: 'warn', msg: 'could not send logs to CloudWatch', reason: error.message }));
        warned = true;
      }
    }
  }

  async function stop() {
    if (timer) clearInterval(timer);
    await flush();
  }

  return { start, push, flush, stop, streamName };
}

module.exports = { createCloudWatchSink };
