// Frontend settings. Nothing here is secret: every visitor can read this file.
// On Floci everything runs on this PC, so the API is on localhost:3000.
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

// If the API is ever deployed somewhere else, replace YOUR-API-HOST with its address
// (and add that address to connect-src in nginx.conf).
const API_BASE_URL = isLocal
  ? 'http://localhost:3000/api'
  : 'https://YOUR-API-HOST/api';
