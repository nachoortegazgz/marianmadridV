/*
MODULE: tools/dynE2eBootstrap.mjs
RESPONSIBILITY: Runner of the dynamic E2E suite. Imports the test file in
  THIS process (so the loader hooks registered via --experimental-loader are
  active for it and its transitive deps), then executes every exported DYN-*
  test function sequentially. node:test is intentionally NOT used here: its
  default worker isolation would drop the loader registration.
*/
import { installMockGlobals } from './wixLoader.mjs';

installMockGlobals();

const testFile = process.argv[2] || 'src/backend/__tests__/dynamic.e2e.test.js';
const mod = await import(new URL('../' + testFile, import.meta.url).href);

let pass = 0;
let fail = 0;
for (const [name, fn] of Object.entries(mod)) {
  if (!/^DYN_/.test(name) || typeof fn !== 'function') continue;
  try {
    await fn();
    console.log('  [PASS] ' + name);
    pass++;
  } catch (err) {
    console.error('  [FAIL] ' + name + ' :: ' + (err && err.message ? err.message : err));
    if (process.env.DYN_VERBOSE && err && err.stack) console.error(err.stack);
    fail++;
  }
}
console.log('DYNAMIC-E2E RESULT: PASS=' + pass + ' FAIL=' + fail);
process.exitCode = fail > 0 ? 1 : 0;
