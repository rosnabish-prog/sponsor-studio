const { JSDOM } = require('jsdom');
const { buildSync } = require('esbuild');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const bundle = buildSync({ entryPoints: ['src/main.tsx'], bundle: true, write: false,
  format: 'iife', platform: 'browser', target: 'es2022', loader: { '.css': 'empty' }, logLevel: 'silent' });
const requests = [];
const user = { id: 'user-1', name: 'Admin', email: 'admin@example.org' };
let signedIn = false;
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
  url: 'http://localhost/', runScripts: 'dangerously',
  beforeParse(window) {
    window.fetch = async (url, options = {}) => {
      requests.push({ url, ...options });
      let status = 200, body = {};
      if (url === '/api/auth/login') { signedIn = true; body = { user }; }
      else if (url === '/api/auth/me') { status = signedIn ? 200 : 401; body = signedIn ? { user } : { message: 'Unauthorized' }; }
      else if (url === '/api/workspaces') body = [];
      else status = 404;
      return { ok: status === 200, status, json: async () => body };
    };
  },
});
const wait = () => new Promise(resolve => setTimeout(resolve, 50));
(async () => {
  dom.window.eval(bundle.outputFiles[0].text);
  await wait();
  const document = dom.window.document;
  assert.ok(document.querySelector('#loginemail'));
  assert.doesNotMatch(document.body.textContent, /demo/i);
  assert.doesNotMatch(document.body.textContent, /create account|new organization/i);
  document.querySelector('#loginemail').value = user.email;
  document.querySelector('#loginpass').value = 'real-password-123';
  document.querySelector('#signInForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await wait();
  const login = requests.find(request => request.url === '/api/auth/login');
  assert.equal(login.method, 'POST');
  assert.deepEqual(JSON.parse(login.body), { email: user.email, password: 'real-password-123' });
  assert.ok(requests.some(request => request.url === '/api/workspaces'));
  assert.ok(document.querySelector('#newWorkspaceName'));
  dom.window.close();
  console.log('API-backed login smoke test passed');
})().catch(error => { dom.window.close(); console.error(error); process.exitCode = 1; });
