import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoalCelebrations, CELEBRATIONS_STORAGE_KEY } from './celebrations.js';
const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
const goals = { rewards: [{ id: 'coffee', amount: 20, label: '咖啡' }], bigGoals: [{ id: 'phone', amount: 1000, label: '手机' }] };
const date = (day = 22, month = 10) => new Date(2026, month - 1, day, 12);
const snapshot = (earned, monthEarned = 500) => ({ ok: true, earned, monthEarned });

test('initial achieved goals establish a quiet baseline; live crossings carry stable IDs and categories', () => {
  const seen = [];
  const tracker = createGoalCelebrations({ storage: memory(), onCelebrate: event => seen.push(event) });
  tracker.tick({ goals, snapshot: snapshot(19, 1001), now: date() });
  assert.equal(seen.length, 0);
  tracker.tick({ goals, snapshot: snapshot(20, 1002), now: date(), mode: 'animation' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].goal.id, 'coffee');
  assert.equal(seen[0].category, 'rewards');
  assert.equal(seen[0].mode, 'animation');
  assert.equal(seen[0].key, 'rewards:2026-10-22:coffee');
  tracker.tick({ goals, snapshot: snapshot(21, 1003), now: date() });
  assert.equal(seen.length, 1);
});
test('restart and income corrections cannot replay an achievement already persisted', () => {
  const storage = memory();
  const seen = [];
  let tracker = createGoalCelebrations({ storage, onCelebrate: event => seen.push(event) });
  tracker.tick({ goals, snapshot: snapshot(19), now: date() });
  tracker.tick({ goals, snapshot: snapshot(21), now: date() });
  assert.equal(seen.length, 1);
  tracker = createGoalCelebrations({ storage, onCelebrate: event => seen.push(event) });
  tracker.tick({ goals, snapshot: snapshot(19), now: date() });
  tracker.tick({ goals, snapshot: snapshot(21), now: date() });
  assert.equal(seen.length, 1);
  assert.ok(JSON.parse(storage.getItem(CELEBRATIONS_STORAGE_KEY)).achieved.includes('rewards:2026-10-22:coffee'));
});
test('daily and monthly periods reset separately and completed new-period baselines stay quiet', () => {
  const seen = [];
  const tracker = createGoalCelebrations({ storage: memory(), onCelebrate: event => seen.push(event) });
  tracker.tick({ goals, snapshot: snapshot(0, 990), now: date(22) });
  tracker.tick({ goals, snapshot: snapshot(25, 1001), now: date(22) });
  assert.equal(seen.length, 2);
  tracker.tick({ goals, snapshot: snapshot(0, 1001), now: date(23) });
  tracker.tick({ goals, snapshot: snapshot(25, 1100), now: date(23) });
  assert.equal(seen.length, 3);
  assert.equal(seen.at(-1).category, 'rewards');
  tracker.tick({ goals, snapshot: snapshot(25, 1001), now: date(1, 11) });
  assert.equal(seen.length, 3);
  tracker.tick({ goals, snapshot: snapshot(0, 900), now: date(1, 11) });
  tracker.tick({ goals, snapshot: snapshot(25, 1100), now: date(1, 11) });
  assert.equal(seen.length, 3);
});
test('silent crossings are recorded; notification mode only dispatches new achievements', () => {
  const seen = [];
  const storage = memory();
  const tracker = createGoalCelebrations({ storage, onCelebrate: event => seen.push(event) });
  tracker.tick({ goals, snapshot: snapshot(19, 999), now: date(), mode: 'silent' });
  assert.deepEqual(tracker.tick({ goals, snapshot: snapshot(20, 999), now: date(), mode: 'silent' }), []);
  tracker.tick({ goals, snapshot: snapshot(21, 1000), now: date(), mode: 'notification' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].category, 'bigGoals');
  assert.equal(seen[0].mode, 'notification');
  assert.ok(JSON.parse(storage.getItem(CELEBRATIONS_STORAGE_KEY)).achieved.includes('rewards:2026-10-22:coffee'));
});
test('adding an already complete target or editing its price does not trigger a celebration', () => {
  const seen = [];
  const tracker = createGoalCelebrations({ storage: memory(), onCelebrate: event => seen.push(event) });
  tracker.tick({ goals, snapshot: snapshot(15), now: date() });
  const edited = { rewards: [{ ...goals.rewards[0], amount: 10 }, { id: 'new', amount: 5 }], bigGoals: goals.bigGoals };
  tracker.tick({ goals: edited, snapshot: snapshot(15), now: date() });
  assert.equal(seen.length, 0);
  tracker.tick({ goals: { ...edited, rewards: [...edited.rewards].reverse() }, snapshot: snapshot(16), now: date() });
  assert.equal(seen.length, 0);
});
test('invalid snapshots, corrupt storage and failed presentation do not break future ticks', () => {
  const storage = memory();
  storage.setItem(CELEBRATIONS_STORAGE_KEY, '{');
  let calls = 0;
  const tracker = createGoalCelebrations({ storage, onCelebrate: () => { calls++; throw Error('view gone'); } });
  assert.deepEqual(tracker.tick({ goals, snapshot: { ok: false }, now: date() }), []);
  tracker.tick({ goals, snapshot: snapshot(0), now: date() });
  assert.deepEqual(tracker.tick({ goals, snapshot: snapshot(20), now: new Date('invalid') }), []);
  assert.equal(tracker.tick({ goals, snapshot: snapshot(20), now: date() }).length, 1);
  assert.equal(tracker.tick({ goals, snapshot: snapshot(21), now: date() }).length, 0);
  assert.equal(calls, 1);
});
test('unavailable storage still deduplicates during this session', () => {
  const storage = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('full'); } };
  const tracker = createGoalCelebrations({ storage });
  tracker.tick({ goals, snapshot: snapshot(0), now: date() });
  assert.equal(tracker.tick({ goals, snapshot: snapshot(20), now: date() }).length, 1);
  tracker.tick({ goals, snapshot: snapshot(0), now: date() });
  assert.equal(tracker.tick({ goals, snapshot: snapshot(20), now: date() }).length, 0);
});
