import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGoals, validateGoal, validateGoals, loadGoals, saveGoals, orderedGoals, createGoalId, escapeHTML, GOALS_STORAGE_KEY, MAX_GOAL_IMAGE_LENGTH } from './goals.js';
const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=';
const goal = extra => ({ label: '目标', amount: 20, unit: '一份', ...extra });

test('existing users get independent defaults without changing schedule storage', () => {
  const storage = memory();
  storage.setItem('work-encourager-settings-v1', '{"salary":"12345"}');
  const goals = loadGoals(storage);
  assert.equal(goals.rewards.length, 12);
  assert.equal(goals.bigGoals.length, 2);
  assert.equal(new Set([...goals.rewards, ...goals.bigGoals].map(item => item.id)).size, 14);
  goals.rewards[0].label = 'changed';
  assert.notEqual(defaultGoals().rewards[0].label, 'changed');
  saveGoals(storage, goals);
  assert.equal(storage.getItem('work-encourager-settings-v1'), '{"salary":"12345"}');
});
test('custom labels, fractional amounts, additions and empty lists survive reload', () => {
  const storage = memory();
  const custom = { rewards: [{ label: ' 周末咖啡 ', amount: '19.90', unit: ' 一杯 ' }], bigGoals: [] };
  const saved = saveGoals(storage, custom);
  assert.equal(saved.rewards[0].label, '周末咖啡');
  assert.equal(saved.rewards[0].amount, 19.9);
  assert.equal(saved.rewards[0].unit, '一杯');
  assert.match(saved.rewards[0].id, /^legacy-rewards-/);
  assert.deepEqual(loadGoals(storage), saved);
  saveGoals(storage, { rewards: [], bigGoals: [] });
  assert.deepEqual(loadGoals(storage), { rewards: [], bigGoals: [] });
});
test('legacy migration gives duplicate targets distinct stable identities without discarding data', () => {
  const legacy = { rewards: [goal(), goal()], bigGoals: [goal()] };
  const migrated = validateGoals(legacy);
  assert.deepEqual(validateGoals(legacy), migrated);
  assert.deepEqual(validateGoals(migrated), migrated);
  assert.equal(new Set([...migrated.rewards, ...migrated.bigGoals].map(item => item.id)).size, 3);
  assert.equal(migrated.rewards[0].emoji, '🎯');
  assert.equal(migrated.rewards[0].pinned, false);
  assert.equal(migrated.rewards[0].image, '');
  assert.notEqual(createGoalId(), createGoalId());
});
test('personalization persists and pinning preserves manual order without mutating the source', () => {
  const storage = memory();
  const items = ['a', 'b', 'c', 'd'].map((id, i) => goal({ id, emoji: '☕️', color: '#AB12CD', pinned: i % 2 === 1, image: i === 0 ? png : '' }));
  const saved = saveGoals(storage, { rewards: items, bigGoals: [] });
  assert.deepEqual(loadGoals(storage), saved);
  assert.equal(saved.rewards[0].color, '#ab12cd');
  assert.equal(saved.rewards[0].image, png);
  assert.deepEqual(orderedGoals(saved.rewards).map(item => item.id), ['b', 'd', 'a', 'c']);
  assert.deepEqual(saved.rewards.map(item => item.id), ['a', 'b', 'c', 'd']);
  saved.rewards[0].label = '改名';
  assert.equal(validateGoals(saved).rewards[0].id, 'a');
});
test('reject invalid money, labels and units before writing', () => {
  for (const amount of ['', 0, -1, 'Infinity', 'NaN', '2e3', '1.234', '100000000.01', null]) {
    assert.throws(() => validateGoal(goal({ amount })));
  }
  for (const extra of [{ label: ' ' }, { label: '长'.repeat(31) }, { unit: '' }, { unit: '长'.repeat(11) }]) assert.throws(() => validateGoal(goal(extra)));
  assert.equal(validateGoal(goal({ amount: '0.01' })).amount, 0.01);
  assert.throws(() => validateGoals({ rewards: Array(31).fill(goal()), bigGoals: [] }));
  const storage = memory();
  saveGoals(storage, defaultGoals());
  const before = storage.getItem(GOALS_STORAGE_KEY);
  assert.throws(() => saveGoals(storage, { rewards: [goal({ label: '' })], bigGoals: [] }));
  assert.equal(storage.getItem(GOALS_STORAGE_KEY), before);
});
test('reject external, active, malformed or excessive image data and invalid appearance values', () => {
  for (const image of ['https://example.com/a.png', 'file:///tmp/a.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AA==', 'data:image/png;base64,a', png + 'A'.repeat(MAX_GOAL_IMAGE_LENGTH)]) {
    assert.throws(() => validateGoal(goal({ image })), /封面/);
  }
  for (const extra of [{ emoji: 'x'.repeat(17) }, { color: 'red' }, { color: '#fff' }, { pinned: 'yes' }, { id: '<bad>' }]) assert.throws(() => validateGoal(goal(extra)));
  assert.throws(() => validateGoals({ rewards: [goal({ id: 'same' })], bigGoals: [goal({ id: 'same' })] }), /重复/);
});
test('the same overall cover cap applies to editor save and backup import validation', () => {
  const largeImage = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(100000)]).toString('base64');
  assert.equal(validateGoal(goal({ image: largeImage })).image, largeImage);
  const oversized = { rewards: Array.from({ length: 20 }, (_, i) => goal({ id: `goal-${i}`, image: largeImage })), bigGoals: [] };
  assert.throws(() => validateGoals(oversized), /总容量/);
  const storage = memory();
  saveGoals(storage, defaultGoals());
  const before = storage.getItem(GOALS_STORAGE_KEY);
  assert.throws(() => saveGoals(storage, oversized), /总容量/);
  assert.equal(storage.getItem(GOALS_STORAGE_KEY), before);
});
test('corrupt storage falls back safely and storage errors remain visible to caller', () => {
  const storage = memory();
  for (const raw of ['null', '{', '{"rewards":[]}', '{"rewards":{},"bigGoals":[]}']) {
    storage.setItem(GOALS_STORAGE_KEY, raw);
    assert.deepEqual(loadGoals(storage), defaultGoals());
  }
  const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('quota'); } };
  assert.deepEqual(loadGoals(blocked), defaultGoals());
  assert.throws(() => saveGoals(blocked, defaultGoals()), /quota/);
});
test('custom names and units cannot inject dashboard markup', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)"> & \'x\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;x&#39;');
});
