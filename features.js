import { defaultLayout, validateLayout } from './layout.js';
import { pomodoroDefaults, validatePomodoro } from './pomodoro.js';
import { computeSnapshot } from './earn.js';
import { validateGoals, orderedGoals, GOALS_STORAGE_KEY } from './goals.js';
import { validateDateOverrides, localDateKey } from './earn.js';

export const FEATURES_KEY = 'work-encourager-features-v1';
export const BASE_KEY = 'work-encourager-settings-v1';
export const BAR_MODES = ['earned', 'remaining', 'plain', 'countdown', 'progress', 'goal', 'goalTime', 'adaptive', 'pomodoro'];
export const featureDefaults = () => ({
  moduleOrder: defaultLayout(), pomodoro: pomodoroDefaults(), dateOverrides: {}, celebrationMode: 'animation', rememberPage: true,
  companion: { enabled: false, character: 'cat' }, miniContent: 'income',
  reminders: { enabled: false, break: true, end: true, rest: false, restInterval: 60,
    activeStart: '08:00', activeEnd: '22:30', quietStart: '22:30', quietEnd: '08:00' },
});
const clock = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const bool = (value, fallback) => value === undefined ? fallback : typeof value === 'boolean' ? value : (() => { throw new Error('开关值无效。'); })();
const choice = (value, values, fallback) => value === undefined ? fallback : values.includes(value) ? value : (() => { throw new Error('设置选项无效。'); })();
export function validateFeatures(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设置格式无效。');
  for (const key of ['reminders','companion']) if (value[key] !== undefined && (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key]))) throw new Error('设置分组格式无效。');
  const defaults = featureDefaults(), r = value.reminders || {}, c = value.companion || {};
  const reminders = {};
  for (const k of ['enabled', 'break', 'end', 'rest']) reminders[k] = bool(r[k], defaults.reminders[k]);
  reminders.restInterval = r.restInterval ?? 60;
  if (![30, 45, 60, 90, 120].includes(reminders.restInterval)) throw new Error('休息提醒间隔无效。');
  for (const k of ['activeStart', 'activeEnd', 'quietStart', 'quietEnd']) {
    reminders[k] = r[k] ?? defaults.reminders[k];
    if (!clock(reminders[k])) throw new Error('提醒时间格式无效。');
  }
  return { moduleOrder: validateLayout(value.moduleOrder), pomodoro: validatePomodoro(value.pomodoro), dateOverrides: validateDateOverrides(value.dateOverrides || {}),
    celebrationMode: choice(value.celebrationMode, ['animation','notification','silent'], 'animation'),
    rememberPage: bool(value.rememberPage, true),
    miniContent: choice(value.miniContent, ['income','countdown','goal','pomodoro'], 'income'),
    companion: { enabled: bool(c.enabled, false), character: choice(c.character, ['cat','sprout'], 'cat') }, reminders };
}
export function loadFeatures(storage) {
  try { return validateFeatures(JSON.parse(storage.getItem(FEATURES_KEY) || '{}')); } catch { return featureDefaults(); }
}
export function validateBase(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('薪资与班表格式无效。');
  const result = {};
  for (const k of ['salary','workdays','start','end','breakStart','breakEnd','dinnerStart','dinnerEnd']) result[k] = String(value[k] ?? '');
  if (result.salary !== '' && (!/^\d+(?:\.\d{1,2})?$/.test(result.salary) || +result.salary <= 0 || +result.salary > 1e9)) throw new Error('备份中的月薪无效。');
  for (const k of ['breakEnabled','dinnerEnabled','masked','showStats','showTimeline','showRewards','showBigGoals']) result[k] = bool(value[k], !['breakEnabled','dinnerEnabled','masked'].includes(k));
  result.weekdays = value.weekdays;
  if (!Array.isArray(result.weekdays) || result.weekdays.length > 7 || result.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6) || new Set(result.weekdays).size !== result.weekdays.length) throw new Error('备份中的工作日无效。');
  result.theme = choice(value.theme, ['auto','light','dark'], 'auto');
  result.barMode = choice(value.barMode, BAR_MODES, 'earned');
  const snapshot = computeSnapshot({ ...result, salary: result.salary || '1' }, new Date(2026, 0, 5, 12));
  if (!snapshot.ok) throw new Error(snapshot.error || '备份中的班表无效。');
  return result;
}
export function createBackup({ goals, settings, features }, scope = 'full') {
  const data = { app: 'work-encourager', schema: 1, version: '1.4.1', scope, createdAt: new Date().toISOString(), goals: validateGoals(goals) };
  if (scope === 'full') { data.settings = validateBase(settings); data.features = validateFeatures(features); data.features.dateOverrides = validateDateOverrides(data.features.dateOverrides, data.settings); }
  else if (scope !== 'goals') throw new Error('备份类型无效。');
  return JSON.stringify(data, null, 2);
}
export function parseBackup(text) {
  if (typeof text !== 'string' || text.length > 4000000) throw new Error('备份文件过大，最多支持 4 MB。');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('无法读取 JSON 备份文件。'); }
  if (data?.app !== 'work-encourager' || data.schema !== 1 || !['full','goals'].includes(data.scope)) throw new Error('这不是受支持的上班鼓励器备份。');
  const result = { scope: data.scope, goals: validateGoals(data.goals) };
  if (data.scope === 'full') { if (!data.features) throw new Error('完整备份缺少应用偏好。'); result.settings = validateBase(data.settings); result.features = validateFeatures(data.features); result.features.dateOverrides = validateDateOverrides(result.features.dateOverrides, result.settings); }
  return result;
}
export function applyBackup(storage, backup) {
  const entries = [[GOALS_STORAGE_KEY, backup.goals]];
  if (backup.scope === 'full') entries.push([BASE_KEY, backup.settings], [FEATURES_KEY, backup.features]);
  const previous = new Map(entries.map(([key]) => [key, storage.getItem(key)]));
  const written = [];
  try { for (const [key,value] of entries) { storage.setItem(key, JSON.stringify(value)); written.push(key); } }
  catch {
    // Never touch a key whose write failed: localStorage.setItem is atomic for each key.
    let restored = true;
    for (const key of written) { try { storage.removeItem(key); } catch { restored = false; } }
    for (const key of written) { try { const value = previous.get(key); if (value !== null) storage.setItem(key, value); } catch { restored = false; } }
    throw new Error(restored ? '本机存储空间不足，已保留原来的设置。请减少目标封面后重试。' : '恢复失败，部分设置未能还原。请保留备份文件并重新导入。');
  }
}
const hm = value => Number(value.slice(0,2)) * 60 + Number(value.slice(3));
export function inTimeWindow(minute, start, end) {
  const a = hm(start), b = hm(end);
  return a === b || (a < b ? minute >= a && minute < b : minute >= a || minute < b);
}
export function remindersAllowed(reminders, now) {
  const minute = now.getHours() * 60 + now.getMinutes();
  return reminders.enabled && inTimeWindow(minute, reminders.activeStart, reminders.activeEnd)
    && (reminders.quietStart === reminders.quietEnd || !inTimeWindow(minute, reminders.quietStart, reminders.quietEnd));
}
export function createReminders({ storage, onNotify }) {
  let previous = null, signature = '', seen = {};
  try { seen = JSON.parse(storage.getItem('work-encourager-reminder-events-v1') || '{}'); if (!seen || typeof seen !== 'object' || Array.isArray(seen)) seen = {}; } catch { seen = {}; }
  return { reset() { previous = null; }, tick({ snapshot, now, settings }) {
    const currentSignature = JSON.stringify(settings);
    const date = localDateKey(now);
    const current = { time: +now, date, phase: snapshot.phase, worked: snapshot.workedMinutes || 0, stop: snapshot.nextStop };
    if (!snapshot.ok) { previous = null; signature = currentSignature; return; }
    if (!previous || signature !== currentSignature || previous.date !== date || +now - previous.time > 120000 || +now < previous.time) {
      previous = current; signature = currentSignature; return;
    }
    const events = [];
    if (settings.break && ['break','dinner'].includes(snapshot.phase) && snapshot.phase !== previous.phase) events.push([snapshot.phase, '休息时间到了', '放下手头的事，安心吃饭或休息一下。']);
    if (settings.end && snapshot.phase === 'after' && previous.phase !== 'after') events.push(['end', '今天辛苦了', '已经到下班时间，记得给自己留点生活。']);
    const bucket = Math.floor(current.worked / settings.restInterval);
    if (settings.rest && snapshot.phase === 'working' && bucket > Math.floor(previous.worked / settings.restInterval)) events.push([`rest-${bucket}`, '起来活动一下', '看看远处，喝口水，舒展一下身体。']);
    previous = current;
    for (const [id,title,body] of events) {
      const key = `${date}:${id}`;
      if (seen[key]) continue;
      seen[key] = true;
      seen = Object.fromEntries(Object.entries(seen).filter(([k]) => k.slice(0,10) >= localDateKey(new Date(+now - 35 * 86400000))));
      try { storage.setItem('work-encourager-reminder-events-v1', JSON.stringify(seen)); } catch { /* in-memory dedupe still applies */ }
      if (remindersAllowed(settings, now)) onNotify({ title, body });
    }
  }};
}
export function trackedGoal(goals, snapshot) {
  const all = [...orderedGoals(goals.rewards).map(goal => ({ goal, value: snapshot.earned })), ...orderedGoals(goals.bigGoals).map(goal => ({ goal, value: snapshot.monthEarned }))];
  return all.find(item => item.goal.pinned) || all.find(item => item.value < item.goal.amount) || all[0];
}
const shortTime = minutes => { const m = Math.max(0, Math.ceil(minutes)); return m >= 60 ? `${Math.floor(m/60)}时${m%60}分` : `${m}分`; };
export function barText(mode, snapshot, goals, masked = false, now = new Date()) {
  if (!snapshot.ok) return '鼓励器';
  const amount = value => masked ? '¥***' : `¥${Number(value).toFixed(2)}`;
  const countdown = snapshot.phase === 'off' ? '今日休息' : snapshot.phase === 'after' ? '已下班' : `${shortTime(Math.max(0, snapshot.endMinutes - (now.getHours()*60+now.getMinutes()+now.getSeconds()/60)))}下班`;
  const target = trackedGoal(goals, snapshot);
  if (mode === 'remaining') return `剩余 ${amount(Math.max(0,snapshot.perDay-snapshot.earned))}`;
  if (mode === 'plain') return amount(snapshot.earned);
  if (mode === 'countdown') return countdown;
  if (mode === 'progress') return `今日 ${Math.round(snapshot.progress*100)}%`;
  if (mode === 'goal' || mode === 'goalTime') {
    if (!target) return '暂无目标';
    const { goal, value } = target;
    const name = Array.from(goal.label).slice(0,5).join('');
    if (mode === 'goal') return `${goal.emoji || '🎯'} ${name} ${Math.min(100,Math.floor(value/goal.amount*100))}%`;
    return value >= goal.amount ? `${goal.emoji || '🎯'} 已点亮` : `${goal.emoji || '🎯'} 还需${shortTime((goal.amount-value)/snapshot.perMinute)}`;
  }
  if (mode === 'adaptive') {
    if (snapshot.phase === 'working') return snapshot.progress >= .8 ? countdown : `已挣 ${amount(snapshot.earned)}`;
    return { before:'等待开工', break:'午休中', dinner:'晚饭时间', after:'收工啦', off:'安心休息' }[snapshot.phase] || '鼓励器';
  }
  return `${({before:'待开工',working:'已挣',break:'午休',dinner:'晚饭',after:'今日',off:'休息'})[snapshot.phase]} ${amount(snapshot.earned)}`;
}
