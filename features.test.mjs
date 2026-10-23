import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURES_KEY, BASE_KEY, BAR_MODES, featureDefaults, validateFeatures, loadFeatures,
  createBackup, parseBackup, applyBackup, inTimeWindow, remindersAllowed,
  createReminders, trackedGoal, barText,
} from './features.js';
import { GOALS_STORAGE_KEY, defaultGoals, validateGoals } from './goals.js';
import { computeSnapshot } from './earn.js';

const base = {
  salary: '22000', workdays: '22', start: '09:30', end: '18:30',
  breakEnabled: true, breakStart: '12:00', breakEnd: '13:30',
  dinnerEnabled: true, dinnerStart: '17:00', dinnerEnd: '17:30',
  weekdays: [1, 2, 3, 4, 5], barMode: 'earned', theme: 'auto', masked: false,
  showStats: true, showTimeline: true, showRewards: true, showBigGoals: true,
};
const at = (hour, minute, second = 0, day = 22) => new Date(2026, 9, day, hour, minute, second);
const memory = (initial = {}, beforeWrite = () => {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem(key, value) { beforeWrite(key, value, data); data.set(key, value); },
    removeItem: key => data.delete(key),
  };
};
const bundle = () => ({ goals: defaultGoals(), settings: { ...base }, features: featureDefaults() });
const fullBackup = () => parseBackup(createBackup(bundle()));
const allDay = overrides => ({ ...featureDefaults().reminders, enabled: true,
  activeStart: '00:00', activeEnd: '00:00', quietStart: '00:00', quietEnd: '00:00', ...overrides });
const phase = (name, worked = 0) => ({ ok: true, phase: name, workedMinutes: worked });
const tickAt = (reminders, now, settings = allDay(), snapshot = computeSnapshot(base, now)) => reminders.tick({ snapshot, now, settings });
const seed = () => ({ [GOALS_STORAGE_KEY]: 'old goals', [BASE_KEY]: 'old base', [FEATURES_KEY]: 'old features', untouched: 'keep me' });

test('full backup round-trips salary, schedule, dated overrides and personalized goals', () => {
  const source = bundle();
  source.features.dateOverrides = { '2026-10-23': { mode: 'off' } };
  source.features.companion = { enabled: true, character: 'sprout' };
  source.goals.rewards[0].label = '新咖啡';
  source.goals.rewards[0].pinned = true;
  const serialized = createBackup(source, 'full');
  const envelope = JSON.parse(serialized);
  assert.equal(envelope.app, 'work-encourager');
  assert.equal(envelope.version, '1.4.0');
  assert.ok(Number.isFinite(Date.parse(envelope.createdAt)));
  const parsed = parseBackup(serialized);
  assert.equal(parsed.scope, 'full');
  assert.deepEqual(parsed.settings, source.settings);
  assert.deepEqual(parsed.features, source.features);
  assert.deepEqual(parsed.goals, source.goals);
  assert.equal(Object.hasOwn(parsed.features, 'launchAtLogin'), false);
});

test('goals-only export omits salary and app preferences and works without a salary form', () => {
  const text = createBackup({ goals: defaultGoals() }, 'goals');
  const raw = JSON.parse(text);
  assert.equal(Object.hasOwn(raw, 'settings'), false);
  assert.equal(Object.hasOwn(raw, 'features'), false);
  assert.deepEqual(parseBackup(text), { scope: 'goals', goals: defaultGoals() });
});

test('rejects malformed, oversized, foreign, future-schema and incomplete backup files', () => {
  const valid = JSON.parse(createBackup(bundle()));
  for (const text of ['{bad', 'null', '[]', 'x'.repeat(4_000_001)]) assert.throws(() => parseBackup(text));
  for (const patch of [{ app: 'another-app' }, { schema: 2 }, { scope: 'mystery' },
    { goals: { rewards: [], bigGoals: 'bad' } }, { settings: null }, { features: undefined }]) {
    assert.throws(() => parseBackup(JSON.stringify({ ...valid, ...patch })));
  }
  assert.throws(() => createBackup(bundle(), 'mystery'));
});

test('backup validation rejects invalid salary, schedule, working days and typed preference values', () => {
  const valid = JSON.parse(createBackup(bundle()));
  for (const patch of [{ salary: '-1' }, { salary: '1.234' }, { end: '08:00' },
    { weekdays: [1, 1] }, { weekdays: [7] }, { masked: 'yes' }, { barMode: 'unknown' }]) {
    assert.throws(() => parseBackup(JSON.stringify({ ...valid, settings: { ...base, ...patch } })));
  }
  for (const features of [{ reminders: 'yes' }, { reminders: [] }, { companion: false },
    { reminders: { restInterval: 1 } }, { reminders: { activeStart: '24:00' } },
    { rememberPage: 1 }, { miniContent: 'unknown' }]) assert.throws(() => validateFeatures(features));
});

test('full backup checks inherited date overrides against the imported base schedule', () => {
  const value = bundle();
  value.features.dateOverrides = { '2026-10-23': { mode: 'work', end: '11:00' } };
  assert.throws(() => createBackup(value));
  const raw = JSON.parse(createBackup(bundle()));
  raw.features = value.features;
  assert.throws(() => parseBackup(JSON.stringify(raw)));
});

test('feature defaults are independent and corrupt persisted preferences recover safely', () => {
  const first = featureDefaults();
  first.reminders.enabled = true;
  first.companion.character = 'sprout';
  assert.equal(featureDefaults().reminders.enabled, false);
  assert.equal(featureDefaults().companion.character, 'cat');
  assert.deepEqual(loadFeatures(memory({ [FEATURES_KEY]: '{bad' })), featureDefaults());
  assert.deepEqual(loadFeatures(memory({ [FEATURES_KEY]: '[]' })), featureDefaults());
});

test('full restore updates precisely the three app data keys', () => {
  const storage = memory(seed());
  const backup = fullBackup();
  applyBackup(storage, backup);
  assert.deepEqual(JSON.parse(storage.getItem(GOALS_STORAGE_KEY)), backup.goals);
  assert.deepEqual(JSON.parse(storage.getItem(BASE_KEY)), backup.settings);
  assert.deepEqual(JSON.parse(storage.getItem(FEATURES_KEY)), backup.features);
  assert.equal(storage.getItem('untouched'), 'keep me');
});

test('goals-only restore preserves salary, preferences and unrelated values byte for byte', () => {
  const storage = memory(seed());
  const backup = parseBackup(createBackup(bundle(), 'goals'));
  applyBackup(storage, backup);
  assert.deepEqual(JSON.parse(storage.getItem(GOALS_STORAGE_KEY)), backup.goals);
  assert.equal(storage.getItem(BASE_KEY), 'old base');
  assert.equal(storage.getItem(FEATURES_KEY), 'old features');
  assert.equal(storage.getItem('untouched'), 'keep me');
});

test('write failure at each restore position rolls back existing data', () => {
  for (const failedKey of [GOALS_STORAGE_KEY, BASE_KEY, FEATURES_KEY]) {
    let failed = false;
    const original = seed();
    const storage = memory(original, key => { if (key === failedKey && !failed) { failed = true; throw new Error('quota'); } });
    assert.throws(() => applyBackup(storage, fullBackup()), /已保留/);
    assert.deepEqual(Object.fromEntries(storage.data), original);
  }
});

test('rollback keeps absent values absent and never removes a key whose write failed', () => {
  const storage = memory({ [BASE_KEY]: 'protected base' }, key => { if (key === BASE_KEY) throw new Error('persistent write failure'); });
  assert.throws(() => applyBackup(storage, fullBackup()), /已保留/);
  assert.equal(storage.getItem(GOALS_STORAGE_KEY), null);
  assert.equal(storage.getItem(BASE_KEY), 'protected base');
  assert.equal(storage.getItem(FEATURES_KEY), null);
});

test('a rollback failure is reported truthfully while untouched data remains intact', () => {
  const storage = memory(seed(), (key, value) => {
    if (key === BASE_KEY || (key === GOALS_STORAGE_KEY && value === 'old goals')) throw new Error('storage unavailable');
  });
  assert.throws(() => applyBackup(storage, fullBackup()), /部分设置未能还原/);
  assert.equal(storage.getItem(BASE_KEY), 'old base');
  assert.equal(storage.getItem(FEATURES_KEY), 'old features');
  assert.equal(storage.getItem('untouched'), 'keep me');
});

test('time windows include the start, exclude the end and span midnight', () => {
  assert.equal(inTimeWindow(9 * 60, '09:00', '18:00'), true);
  assert.equal(inTimeWindow(18 * 60, '09:00', '18:00'), false);
  assert.equal(inTimeWindow(23 * 60, '22:30', '08:00'), true);
  assert.equal(inTimeWindow(7 * 60 + 59, '22:30', '08:00'), true);
  assert.equal(inTimeWindow(8 * 60, '22:30', '08:00'), false);
  assert.equal(inTimeWindow(12 * 60, '00:00', '00:00'), true);
});

test('overnight quiet hours and active-hours overlap gate reminders consistently', () => {
  const settings = allDay({ quietStart: '22:30', quietEnd: '08:00' });
  assert.equal(remindersAllowed(settings, at(22, 29)), true);
  assert.equal(remindersAllowed(settings, at(22, 30)), false);
  assert.equal(remindersAllowed(settings, at(7, 59)), false);
  assert.equal(remindersAllowed(settings, at(8, 0)), true);
  assert.equal(remindersAllowed({ ...settings, enabled: false }, at(12, 0)), false);
  assert.equal(remindersAllowed(allDay({ activeStart: '22:00', activeEnd: '06:00' }), at(23, 0)), true);
  assert.equal(remindersAllowed(allDay({ activeStart: '22:00', activeEnd: '06:00' }), at(12, 0)), false);
});

test('first observation never backfills lunch, end-of-day or activity reminders', () => {
  for (const snapshot of [phase('break', 180), phase('after', 480), phase('working', 180)]) {
    const sent = [];
    const reminder = createReminders({ storage: memory(), onNotify: event => sent.push(event) });
    tickAt(reminder, at(12, 0), allDay({ rest: true }), snapshot);
    tickAt(reminder, at(12, 0, 30), allDay({ rest: true }), snapshot);
    assert.deepEqual(sent, []);
  }
});

test('actual lunch, dinner and end boundaries notify once with salary-free text', () => {
  const sent = [];
  const reminder = createReminders({ storage: memory(), onNotify: event => sent.push(event) });
  for (const [before, boundary] of [[at(11, 59), at(12, 0)], [at(16, 59), at(17, 0)], [at(18, 29), at(18, 30)]]) {
    tickAt(reminder, before);
    tickAt(reminder, boundary);
    tickAt(reminder, new Date(+boundary + 30_000));
  }
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map(item => item.title), ['休息时间到了', '休息时间到了', '今天辛苦了']);
  for (const event of sent) assert.doesNotMatch(event.title + event.body, /[¥￥\d]|工资|月薪/);
});

test('activity reminder follows paid minutes and is deduplicated within its interval', () => {
  const sent = [];
  const reminder = createReminders({ storage: memory(), onNotify: event => sent.push(event) });
  const settings = allDay({ rest: true });
  tickAt(reminder, at(10, 29), settings, phase('working', 59));
  tickAt(reminder, at(10, 30), settings, phase('working', 60));
  tickAt(reminder, at(10, 31), settings, phase('working', 61));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, '起来活动一下');
});

test('persisted deduplication suppresses the same boundary after restart or reset', () => {
  const storage = memory();
  const sent = [];
  const start = () => createReminders({ storage, onNotify: event => sent.push(event) });
  let reminder = start();
  tickAt(reminder, at(11, 59)); tickAt(reminder, at(12, 0));
  reminder = start();
  tickAt(reminder, at(11, 59)); tickAt(reminder, at(12, 0));
  reminder.reset();
  tickAt(reminder, at(11, 59)); tickAt(reminder, at(12, 0));
  assert.equal(sent.length, 1);
});

test('quiet-hours events are recorded and never replayed later', () => {
  const storage = memory(), sent = [];
  const reminder = createReminders({ storage, onNotify: event => sent.push(event) });
  const quiet = allDay({ quietStart: '11:00', quietEnd: '13:00' });
  tickAt(reminder, at(11, 59), quiet); tickAt(reminder, at(12, 0), quiet);
  reminder.reset();
  tickAt(reminder, at(11, 59)); tickAt(reminder, at(12, 0));
  assert.deepEqual(sent, []);
});

test('invalid snapshots, sleep gaps, clock rollback and changed settings establish a new baseline', () => {
  for (const scenario of ['invalid', 'sleep', 'clock', 'settings', 'date']) {
    const sent = [];
    const reminder = createReminders({ storage: memory(), onNotify: event => sent.push(event) });
    if (scenario === 'invalid') {
      tickAt(reminder, at(11, 59), allDay(), { ok: false });
      tickAt(reminder, at(12, 0), allDay(), phase('break', 150));
    } else if (scenario === 'sleep') {
      tickAt(reminder, at(11, 57)); tickAt(reminder, at(12, 0));
    } else if (scenario === 'clock') {
      tickAt(reminder, at(12, 1), allDay(), phase('working', 150)); tickAt(reminder, at(12, 0));
    } else if (scenario === 'settings') {
      tickAt(reminder, at(11, 59)); tickAt(reminder, at(12, 0), allDay({ restInterval: 90 }));
    } else {
      tickAt(reminder, at(23, 59), allDay(), phase('working', 150));
      tickAt(reminder, at(0, 0, 0, 23), allDay(), phase('after', 150));
    }
    assert.deepEqual(sent, [], scenario);
  }
});

test('storage failures retain in-memory reminder deduplication', () => {
  const sent = [];
  const reminder = createReminders({ storage: memory({}, () => { throw new Error('quota'); }), onNotify: event => sent.push(event) });
  tickAt(reminder, at(11, 59)); tickAt(reminder, at(12, 0));
  reminder.reset(); tickAt(reminder, at(11, 59)); tickAt(reminder, at(12, 0));
  assert.equal(sent.length, 1);
});

const goals = () => validateGoals({ rewards: [{ id: 'coffee', label: '咖啡目标', amount: 200, unit: '杯', emoji: '☕' }], bigGoals: [{ id: 'trip', label: '旅行', amount: 5000, unit: '次', emoji: '🚆' }] });
const snapshot = () => ({ ok: true, phase: 'working', earned: 120, monthEarned: 2000, perDay: 480, perMinute: 1, progress: .25, endMinutes: 18 * 60 });

test('all status-bar modes produce their expected concise content', () => {
  const expected = { earned: '已挣 ¥120.00', remaining: '剩余 ¥360.00', plain: '¥120.00',
    countdown: '8时0分下班', progress: '今日 25%', goal: '☕ 咖啡目标 60%', goalTime: '☕ 还需1时20分', adaptive: '已挣 ¥120.00' };
  assert.deepEqual(Object.keys(expected).sort(), BAR_MODES.filter(mode=>mode!=='pomodoro').sort());
  for (const mode of BAR_MODES.filter(mode=>mode!=='pomodoro')) assert.equal(barText(mode, snapshot(), goals(), false, at(10, 0)), expected[mode], mode);
});

test('money status-bar modes mask amounts and remaining income cannot be negative', () => {
  for (const mode of ['earned', 'remaining', 'plain']) {
    const label = barText(mode, snapshot(), goals(), true, at(10, 0));
    assert.match(label, /¥\*\*\*/);
    assert.doesNotMatch(label, /120|360/);
  }
  assert.equal(barText('remaining', { ...snapshot(), earned: 600 }, goals()), '剩余 ¥0.00');
  for (const mode of BAR_MODES) assert.equal(barText(mode, { ok: false }, goals()), '鼓励器');
});

test('countdown and adaptive modes distinguish time off, breaks, work and late-day progress', () => {
  assert.equal(barText('countdown', { ...snapshot(), phase: 'off' }, goals()), '今日休息');
  assert.equal(barText('countdown', { ...snapshot(), phase: 'after' }, goals()), '已下班');
  for (const [name, label] of Object.entries({ before: '等待开工', break: '午休中', dinner: '晚饭时间', after: '收工啦', off: '安心休息' })) {
    assert.equal(barText('adaptive', { ...snapshot(), phase: name }, goals()), label);
  }
  assert.equal(barText('adaptive', { ...snapshot(), progress: .8 }, goals(), false, at(17, 30)), '30分下班');
});

test('pinned monthly targets take precedence and use monthly income without mutating goal order', () => {
  const targets = goals(); targets.bigGoals[0].pinned = true;
  const before = structuredClone(targets);
  assert.equal(trackedGoal(targets, snapshot()).goal.id, 'trip');
  assert.equal(trackedGoal(targets, snapshot()).value, 2000);
  assert.equal(barText('goal', snapshot(), targets), '🚆 旅行 40%');
  assert.equal(barText('goalTime', snapshot(), targets), '🚆 还需50时0分');
  assert.deepEqual(targets, before);
  targets.rewards[0].pinned = true;
  assert.equal(trackedGoal(targets, snapshot()).goal.id, 'coffee');
});

test('goal tracking chooses the next unfinished target and handles empty or achieved targets', () => {
  const targets = goals();
  assert.equal(trackedGoal(targets, { ...snapshot(), earned: 250 }).goal.id, 'trip');
  assert.equal(trackedGoal(targets, { ...snapshot(), earned: 250, monthEarned: 6000 }).goal.id, 'coffee');
  assert.equal(barText('goalTime', { ...snapshot(), earned: 250, monthEarned: 6000 }, targets), '☕ 已点亮');
  targets.rewards[0].pinned = true;
  assert.equal(barText('goal', { ...snapshot(), earned: 250 }, targets), '☕ 咖啡目标 100%');
  assert.equal(trackedGoal({ rewards: [], bigGoals: [] }, snapshot()), undefined);
  for (const mode of ['goal', 'goalTime']) assert.equal(barText(mode, snapshot(), { rewards: [], bigGoals: [] }), '暂无目标');
});


test('full backups preserve custom layout, collapsed state and growth style',()=>{
 const data=bundle();data.features.moduleOrder.reverse();data.features.pomodoro.style='tree';data.features.pomodoro.collapsed=true;
 const restored=parseBackup(createBackup(data));
 assert.deepEqual(restored.features.moduleOrder,data.features.moduleOrder);
 assert.equal(restored.features.pomodoro.style,'tree');assert.equal(restored.features.pomodoro.collapsed,true);
});
