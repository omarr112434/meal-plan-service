// Login token handling. The token lives in sessionStorage, so it is gone when the tab closes.
// The real login page belongs to the Authentication / identity part; until it is merged,
// on localhost you can paste a test token made with `npm run dev-token`.
const TOKEN_KEY = 'authToken';

function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // private mode with storage blocked: the token just won't survive a reload
  }
}

function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing to clear
  }
}

// Calls onReady() once there is a token. Otherwise shows the login panel first.
function requireLogin(onReady) {
  const panel = document.querySelector('#login-panel');
  const content = document.querySelector('[data-needs-login]');

  if (getToken()) {
    panel.hidden = true;
    content.hidden = false;
    onReady();
    return;
  }

  content.hidden = true;
  panel.hidden = false;

  const form = document.querySelector('#dev-token-form');
  const help = document.querySelector('#login-help');
  if (!isLocal) {
    help.textContent = 'Please log in on the main page first.';
    form.hidden = true;
    return;
  }

  help.textContent = 'The login page is not merged yet. For testing, run "npm run dev-token" in the backend folder and paste the token here.';
  form.hidden = false;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const token = document.querySelector('#dev-token').value.trim();
    if (token.split('.').length !== 3) {
      help.textContent = 'That does not look like a token (it should have two dots in it).';
      return;
    }
    setToken(token);
    panel.hidden = true;
    content.hidden = false;
    onReady();
  }, { once: true });
}

// Called when the API answers 401: the token expired or is wrong.
function loginAgain() {
  clearToken();
  window.location.reload();
}
