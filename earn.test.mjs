import assert from "node:assert/strict";
import test from "node:test";
import { computeSnapshot, isRegularWorkday, normalizeRestSettings, validateDateOverrides, workdaysInMonth } from "./earn.js";

// October 2026 starts on a Thursday and has 22 Monday–Friday workdays.
const base = {
  salary: "22000",
  rest: "双休",
  singleRest: 0,
  start: "09:30",
  end: "18:30",
  breakEnabled: true,
  breakStart: "12:00",
  breakEnd: "13:30",
  dinnerEnabled: false,
  dinnerStart: "18:00",
  dinnerEnd: "19:00",
};

function at(hour, minute, second = 0, day = 22) {
  return new Date(2026, 9, day, hour, minute, second);
}

test("全天工时会扣掉午休", () => {
  const snap = computeSnapshot(base, at(18, 30));
  assert.equal(snap.ok, true);
  assert.equal(snap.phase, "after");
  assert.equal(snap.dayMinutes, 450);
  assert.equal(snap.workdaysInMonth, 22);
  assert.equal(snap.perDay, 1000);
  assert.equal(snap.earned, 1000);
  assert.ok(Math.abs(snap.perMinute - 1000 / 450) < 1e-9);
});

test("上班前今天收入是 0", () => {
  const snap = computeSnapshot(base, at(9, 0));
  assert.equal(snap.phase, "before");
  assert.equal(snap.earned, 0);
  assert.equal(snap.workedMinutes, 0);
});

test("上午按已上班的分钟累计", () => {
  const snap = computeSnapshot(base, at(10, 30));
  assert.equal(snap.phase, "working");
  assert.ok(Math.abs(snap.workedMinutes - 60) < 1e-9);
  assert.ok(Math.abs(snap.earned - (1000 * 60) / 450) < 1e-9);
});

test("秒数也会计入", () => {
  const snap = computeSnapshot(base, at(9, 30, 30));
  assert.equal(snap.phase, "working");
  assert.ok(Math.abs(snap.workedMinutes - 0.5) < 1e-9);
  assert.ok(Math.abs(snap.earned - (1000 * 0.5) / 450) < 1e-9);
});

test("午休期间金额停在上午结束时", () => {
  const snap = computeSnapshot(base, at(12, 30));
  assert.equal(snap.phase, "break");
  assert.ok(Math.abs(snap.workedMinutes - 150) < 1e-9);
  assert.ok(Math.abs(snap.earned - (1000 * 150) / 450) < 1e-9);
});

test("午休结束后从上午的金额继续累加", () => {
  const snap = computeSnapshot(base, at(14, 0));
  assert.equal(snap.phase, "working");
  assert.ok(Math.abs(snap.workedMinutes - 180) < 1e-9);
  assert.ok(Math.abs(snap.earned - 400) < 1e-9);
});

test("午休结束的那一刻恢复计薪", () => {
  const snap = computeSnapshot(base, at(13, 30));
  assert.equal(snap.phase, "working");
  assert.ok(Math.abs(snap.workedMinutes - 150) < 1e-9);
});

test("休息日不累计", () => {
  const snap = computeSnapshot(base, at(11, 0, 0, 25));
  assert.equal(new Date(2026, 9, 25).getDay(), 0);
  assert.equal(snap.phase, "off");
  assert.equal(snap.earned, 0);
  assert.equal(snap.perDay, 1000);
});

test("不扣午休时按完整上下班时长计算", () => {
  const snap = computeSnapshot({ ...base, breakEnabled: false }, at(18, 30));
  assert.equal(snap.dayMinutes, 540);
  assert.ok(Math.abs(snap.perMinute - 1000 / 540) < 1e-9);
  assert.equal(snap.earned, 1000);
});

test("当月工作日由休息方式与日历推导，不再手工填写", () => {
  assert.equal(workdaysInMonth(2026, 9, base), 22);
  // November 2026: 21 Monday–Friday days, 25 when only Sunday rests.
  assert.equal(workdaysInMonth(2026, 10, { rest: "双休" }), 21);
  assert.equal(workdaysInMonth(2026, 10, { rest: "单休", singleRest: 0 }), 25);
  assert.equal(workdaysInMonth(2026, 10, { rest: "单休", singleRest: 3 }), 26);
});

test("双休与单休的常规工作日规则", () => {
  const saturday = new Date(2026, 9, 24);
  assert.equal(isRegularWorkday(saturday, { rest: "双休" }), false);
  assert.equal(isRegularWorkday(saturday, { rest: "单休", singleRest: 0 }), true);
  const sunday = new Date(2026, 9, 25);
  assert.equal(isRegularWorkday(sunday, { rest: "单休", singleRest: 0 }), false);
  assert.equal(isRegularWorkday(sunday, { rest: "单休", singleRest: 6 }), true);
});

test("旧版的每周工作日数组会迁移成休息方式", () => {
  assert.deepEqual(normalizeRestSettings({ weekdays: [1, 2, 3, 4, 5] }), { rest: "双休", singleRest: 0 });
  assert.deepEqual(normalizeRestSettings({ weekdays: [1, 2, 3, 4, 5, 6] }), { rest: "单休", singleRest: 0 });
  assert.deepEqual(normalizeRestSettings({ weekdays: [0, 2, 3, 4, 5, 6] }), { rest: "单休", singleRest: 1 });
  assert.deepEqual(normalizeRestSettings({}), { rest: "双休", singleRest: 0 });
  const legacy = { salary: "22000", weekdays: [1, 2, 3, 4, 5], start: "09:30", end: "18:30", breakEnabled: false };
  const snap = computeSnapshot(legacy, at(18, 30));
  assert.equal(snap.ok, true);
  assert.equal(snap.workdaysInMonth, 22);
});

test("非法休息方式与休息日会被拦住", () => {
  assert.match(computeSnapshot({ ...base, rest: "大小周" }, at(10, 0)).error, /休息方式/);
  assert.match(computeSnapshot({ ...base, rest: "单休", singleRest: 7 }, at(10, 0)).error, /休息日/);
});

const shift = {
  salary: "7500",
  rest: "单休",
  singleRest: 0,
  start: "10:00",
  end: "22:00",
  breakEnabled: true,
  breakStart: "12:00",
  breakEnd: "14:00",
  dinnerEnabled: true,
  dinnerStart: "17:30",
  dinnerEnd: "18:30",
};

test("单休会把周六计入当月工作日", () => {
  const snap = computeSnapshot(shift, at(18, 30));
  assert.equal(snap.workdaysInMonth, 27);
  assert.ok(Math.abs(snap.perDay - 7500 / 27) < 1e-9);
});

test("默认班表会同时扣掉午休和晚饭", () => {
  const snap = computeSnapshot(shift, at(22, 0));
  assert.equal(snap.dayMinutes, 540);
  assert.equal(snap.breakSpan, 120);
  assert.equal(snap.dinnerSpan, 60);
  assert.equal(snap.segments.length, 5);
  assert.equal(snap.phase, "after");
  assert.ok(Math.abs(snap.perDay - 7500 / 27) < 1e-9);
  assert.ok(Math.abs(snap.earned - 7500 / 27) < 1e-9);
});

test("上午、午休和晚饭后的下一个节点都能算对", () => {
  const morning = computeSnapshot(shift, at(11, 0));
  assert.equal(morning.nextStop.kind, "break");
  assert.ok(Math.abs(morning.nextStop.minutesLeft - 60) < 1e-9);
  const lunch = computeSnapshot(shift, at(12, 30));
  assert.equal(lunch.nextStop.kind, "resume");
  assert.ok(Math.abs(lunch.nextStop.minutesLeft - 90) < 1e-9);
  const evening = computeSnapshot(shift, at(19, 0));
  assert.equal(evening.nextStop.kind, "end");
  assert.ok(Math.abs(evening.nextStop.minutesLeft - 180) < 1e-9);
});

test("晚饭期间金额停住，结束后继续累加", () => {
  const during = computeSnapshot(shift, at(18, 0));
  assert.equal(during.phase, "dinner");
  assert.ok(Math.abs(during.workedMinutes - 330) < 1e-9);
  const resumed = computeSnapshot(shift, at(19, 0));
  assert.equal(resumed.phase, "working");
  assert.ok(Math.abs(resumed.workedMinutes - 360) < 1e-9);
  assert.ok(resumed.earned > during.earned);
});

test("周六计薪，周日休息", () => {
  assert.equal(new Date(2026, 9, 24).getDay(), 6);
  assert.equal(computeSnapshot(shift, at(11, 0, 0, 24)).phase, "working");
  assert.equal(computeSnapshot(shift, at(11, 0, 0, 25)).phase, "off");
});

test("午休和晚饭重叠会被拦住", () => {
  assert.match(
    computeSnapshot({ ...shift, dinnerStart: "13:30", dinnerEnd: "15:00" }).error,
    /重叠/,
  );
});

test("本月累计工作日与累计收入随今日进度递增", () => {
  const morning = computeSnapshot(shift, at(11, 0));
  const evening = computeSnapshot(shift, at(21, 0));
  assert.ok(morning.monthWorkdays > 0);
  assert.ok(evening.monthWorkdays > morning.monthWorkdays);
  assert.ok(evening.monthEarned > morning.monthEarned);
});

test("空月薪、倒序时间和午休越界都会拦住", () => {
  assert.equal(computeSnapshot({ ...base, salary: "" }).code, "empty");
  assert.match(computeSnapshot({ ...base, end: "09:00" }).error, /晚于上班/);
  assert.match(
    computeSnapshot({ ...base, breakEnd: "19:00" }).error,
    /落在上班时间/,
  );
});

test("周末补班只覆盖当天，次日继续沿用常规班表", () => {
  const settings = { ...base, dateOverrides: { "2026-10-24": { mode: "work" } } };
  const saturday = computeSnapshot(settings, at(10, 30, 0, 24));
  assert.equal(saturday.ok, true);
  assert.equal(saturday.phase, "working");
  assert.equal(saturday.isOverride, true);
  assert.equal(saturday.dateKey, "2026-10-24");
  assert.equal(saturday.workedMinutes, 60);
  assert.equal(computeSnapshot(settings, at(10, 30, 0, 25)).phase, "off");
  assert.equal(computeSnapshot(settings, at(10, 30, 0, 26)).isOverride, false);
  assert.equal(base.dateOverrides, undefined);
});

test("工作日休假当天暂停收入，后续工作日恢复正常", () => {
  const settings = { ...base, dateOverrides: { "2026-10-22": { mode: "off" } } };
  const today = computeSnapshot(settings, at(18, 30));
  assert.equal(today.ok, true);
  assert.equal(today.phase, "off");
  assert.equal(today.earned, 0);
  assert.equal(today.effectiveSettings.overrideMode, "off");
  assert.equal(computeSnapshot(settings, at(10, 30, 0, 23)).phase, "working");
});

test("日历调休只切换班/休，旧的逐日时段字段不再生效", () => {
  const settings = { ...base, dateOverrides: { "2026-10-22": { mode: "work", end: "12:00", breakEnabled: false } } };
  const morning = computeSnapshot(settings, at(11, 0));
  assert.equal(morning.ok, true);
  assert.equal(morning.dayMinutes, 450);
  assert.equal(morning.perDay, 1000);
  assert.equal(morning.effectiveSettings.end, "18:30");
  assert.equal(morning.nextStop.kind, "break");
  assert.equal(computeSnapshot(settings, at(18, 30)).earned, 1000);
});

test("备份里遗留的逐日时段字段会被清洗掉", () => {
  assert.deepEqual(validateDateOverrides({ "2026-10-22": { mode: "work", end: "12:00", breakEnabled: false } }), { "2026-10-22": { mode: "work" } });
  assert.deepEqual(validateDateOverrides({ "2026-10-22": { mode: "off", start: "09:00" } }), { "2026-10-22": { mode: "off" } });
});

test("日历调休直接改变当月工作日与日薪", () => {
  const snapshot = computeSnapshot(base, at(9, 0));
  assert.equal(snapshot.workdaysInMonth, 22);
  assert.equal(snapshot.perDay, 1000);
  const extra = computeSnapshot({ ...base, dateOverrides: { "2026-10-17": { mode: "work" } } }, at(9, 0));
  assert.equal(extra.workdaysInMonth, 23);
  assert.ok(Math.abs(extra.perDay - 22000 / 23) < 1e-9);
  const removed = computeSnapshot({ ...base, dateOverrides: { "2026-10-21": { mode: "off" } } }, at(9, 0));
  assert.equal(removed.workdaysInMonth, 21);
  assert.ok(Math.abs(removed.perDay - 22000 / 21) < 1e-9);
});

test("本月历史补班和休假参与月薪工作日折算", () => {
  // October 2026 contains 22 regular workdays; 15 precede October 22.
  const regular = computeSnapshot(base, at(9, 0));
  assert.ok(Math.abs(regular.monthWorkdays - 15) < 1e-9);
  const added = computeSnapshot({ ...base, dateOverrides: { "2026-10-17": { mode: "work" } } }, at(9, 0));
  assert.equal(added.monthWorkdays, 16);
  assert.ok(Math.abs(added.monthEarned - 16 * (22000 / 23)) < 1e-9);
  const removed = computeSnapshot({ ...base, dateOverrides: { "2026-10-21": { mode: "off" } } }, at(9, 0));
  assert.equal(removed.monthWorkdays, 14);
  assert.ok(Math.abs(removed.monthEarned - 14 * (22000 / 21)) < 1e-9);
  const exchanged = computeSnapshot({ ...base, dateOverrides: { "2026-10-17": { mode: "work" }, "2026-10-21": { mode: "off" } } }, at(9, 0));
  assert.equal(exchanged.monthWorkdays, 15);
});

test("跨月临时班表不会改变本月累计，短班完成后按完整工作日折算", () => {
  const regular = computeSnapshot(base, at(9, 0));
  const settings = { ...base, dateOverrides: { "2026-09-30": { mode: "off" }, "2026-11-01": { mode: "work" }, "2026-10-21": { mode: "work" } } };
  const changed = computeSnapshot(settings, at(9, 0));
  assert.equal(changed.monthWorkdays, regular.monthWorkdays);
  assert.equal(changed.monthEarned, regular.monthEarned);
});

test("整个当月都休息时提示先标记上班日", () => {
  const dateOverrides = {};
  for (let day = 1; day <= 31; day += 1) dateOverrides[`2026-10-${String(day).padStart(2, "0")}`] = { mode: "off" };
  const snap = computeSnapshot({ ...base, dateOverrides }, at(18, 30));
  assert.equal(snap.ok, false);
  assert.match(snap.error, /上班日/);
});
