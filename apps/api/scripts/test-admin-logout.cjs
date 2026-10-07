const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
async function main() {
  const source = fs.readFileSync(path.join(__dirname, '../../admin/app/lib/api.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let token = 'test-access-token';
  let failure = false;
  const events = [];
  const context = {
    exports: {}, process: { env: {} }, FormData,
    window: { localStorage: { getItem: () => token, removeItem: () => { events.push('clear'); token = null; } } },
    fetch: async (url, options) => {
      events.push('request');
      assert(url.endsWith('/auth/logout'));
      assert.equal(options.method, 'POST');
      assert.equal(options.credentials, 'include');
      assert.equal(options.headers.Authorization, 'Bearer test-access-token');
      assert.equal(token, 'test-access-token');
      if (failure) throw new Error('offline');
      return { ok: true, status: 204 };
    },
  };
  vm.runInNewContext(code, context);
  failure = true;
  await assert.rejects(context.exports.logout(), /offline/);
  assert.equal(token, 'test-access-token');
  assert.deepEqual(events, ['request']);
  events.length = 0; failure = false;
  await context.exports.logout();
  assert.equal(token, null);
  assert.deepEqual(events, ['request', 'clear']);
  console.log('Admin logout: bearer and cookie request, token clearing after success, and offline failure handling passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
