// One JSON line per log entry, so the logs are easy to search in CloudWatch Logs
// (and in `docker compose logs api`). Never log tokens, passwords or request bodies.
const config = require('./config');

const LEVELS = { info: 1, warn: 2, error: 3, silent: 9 };
const minimum = LEVELS[config.logLevel] || LEVELS.info;

let cloudWatchSink = null;

function write(level, msg, fields = {}) {
  if (LEVELS[level] < minimum) return;

  const entry = { time: new Date().toISOString(), level, msg, ...fields };
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }

  if (cloudWatchSink) {
    cloudWatchSink.push(Date.parse(entry.time), line);
  }
}

module.exports = {
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
  // server.js calls this when LOG_TO_CLOUDWATCH=true
  sendTo(sink) {
    cloudWatchSink = sink;
  }
};
