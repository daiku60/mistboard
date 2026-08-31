import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
test('Mistboard exposes a dependency-free server command', async()=>{const config=JSON.parse(await readFile('package.json','utf8'));assert.equal(config.scripts.dev,'node server.mjs')});
