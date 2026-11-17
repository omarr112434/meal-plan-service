// Small helper around fetch(): adds the token, sends JSON, and throws ApiError
// with the API's own message when the status is not 2xx.
// API errors look like { "error": { "code": "...", "message": "..." } } (docs/api-contract.md).
class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the API. Is it running on port 3000?');
  }

  let data = null;
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    if (response.status === 401) {
      loginAgain();
    }
    const message = (data && data.error && data.error.message) || `Request failed (${response.status})`;
    throw new ApiError(response.status, data && data.error ? data.error.code : null, message);
  }
  return data;
}

// Dates are handled as "YYYY-MM-DD" strings in UTC, same as the API.
const dates = {
  today() {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
  },
  isValid(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  },
  addDays(value, days) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  },
  mondayOf(value) {
    const date = new Date(`${value}T00:00:00Z`);
    return dates.addDays(value, -((date.getUTCDay() + 6) % 7));
  },
  short(value) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
    });
  },
  long(value) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
    });
  }
};
