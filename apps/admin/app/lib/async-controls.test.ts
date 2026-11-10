import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionLock } from './async-controls';

test('rapid clicks and competing order actions share a synchronous lock', async () => {
  const lock = createActionLock();
  let requests = 0;
  let complete!: () => void;
  const pending = new Promise<void>(resolve => { complete = resolve; });
  async function submit() {
    if (!lock.acquire()) return;
    try { requests++; await pending; } finally { lock.release(); }
  }
  const first = submit();
  await submit();
  assert.equal(requests, 1);
  assert.equal(lock.isLocked(), true);
  complete();
  await first;
  assert.equal(lock.isLocked(), false);
  await submit();
  assert.equal(requests, 2);
});

test('failed requests release the lock so a later deliberate retry can proceed', async () => {
  const lock = createActionLock();
  async function fail() {
    if (!lock.acquire()) return;
    try { throw new Error('request failed'); } finally { lock.release(); }
  }
  await assert.rejects(fail(), /request failed/);
  assert.equal(lock.isLocked(), false);
  assert.equal(lock.acquire(), true);
  lock.release();
});
