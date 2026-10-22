import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGoals, validateGoal, validateGoals, loadGoals, saveGoals, escapeHTML, GOALS_STORAGE_KEY } from './goals.js';
const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
test('existing users get independent defaults without changing schedule storage', () => {
  const storage = memory();
  storage.setItem('work-encourager-settings-v1', '{"salary":"12345"}');
  const goals = loadGoals(storage);
  assert.equal(goals.rewards.length, 12);
  assert.equal(goals.bigGoals.length, 2);
  goals.rewards[0].label = 'changed';
  assert.notEqual(defaultGoals().rewards[0].label, 'changed');
  saveGoals(storage, goals);
  assert.equal(storage.getItem('work-encourager-settings-v1'), '{"salary":"12345"}');
});
test('custom labels, fractional amounts, additions and empty lists survive reload', () => {
  const storage = memory();
  const custom = { rewards: [{label:' 周末咖啡 ', amount:'19.90', unit:' 一杯 '}], bigGoals:[] };
  const saved = saveGoals(storage, custom);
  assert.deepEqual(saved, { rewards:[{label:'周末咖啡',amount:19.9,unit:'一杯'}], bigGoals:[] });
  assert.deepEqual(loadGoals(storage), saved);
  saveGoals(storage, {rewards:[],bigGoals:[]});
  assert.deepEqual(loadGoals(storage), {rewards:[],bigGoals:[]});
});
test('reject invalid money, labels and units before writing', () => {
  for (const amount of ['', 0, -1, 'Infinity', 'NaN', '2e3', '1.234', '100000000.01', null]) {
    assert.throws(() => validateGoal({label:'目标',amount,unit:'一份'}));
  }
  for (const extra of [{label:' '},{label:'长'.repeat(31)},{unit:''},{unit:'长'.repeat(11)}]) {
    assert.throws(() => validateGoal({label:'目标',amount:1,unit:'一份',...extra}));
  }
  assert.equal(validateGoal({label:'目标',amount:'0.01',unit:'一份'}).amount,0.01);
  assert.throws(() => validateGoals({rewards:Array(31).fill({label:'目标',amount:1,unit:'一份'}),bigGoals:[]}));
  const storage = memory();
  saveGoals(storage, defaultGoals());
  const before = storage.getItem(GOALS_STORAGE_KEY);
  assert.throws(() => saveGoals(storage, {rewards:[{label:'',amount:1,unit:'个'}],bigGoals:[]}));
  assert.equal(storage.getItem(GOALS_STORAGE_KEY), before);
});
test('corrupt storage falls back safely and storage errors remain visible to caller', () => {
  const storage = memory();
  for (const raw of ['null','{', '{"rewards":[]}', '{"rewards":{},"bigGoals":[]}']) {
    storage.setItem(GOALS_STORAGE_KEY,raw);
    assert.deepEqual(loadGoals(storage),defaultGoals());
  }
  const blocked = {getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('quota');}};
  assert.deepEqual(loadGoals(blocked),defaultGoals());
  assert.throws(()=>saveGoals(blocked,defaultGoals()),/quota/);
});
test('custom names and units cannot inject dashboard markup', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)"> & \'x\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;x&#39;');
});
