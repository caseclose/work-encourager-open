import assert from "node:assert/strict";
import test from "node:test";
import { computeSnapshot } from "./earn.js";

const base = {
  salary: "22000",
  workdays: "22",
  start: "09:30",
  end: "18:30",
  breakEnabled: true,
  breakStart: "12:00",
  breakEnd: "13:30",
  weekdays: [1, 2, 3, 4, 5],
};

function at(hour, minute, second = 0, day = 22) {
  return new Date(2026, 9, day, hour, minute, second);
}

test("全天工时会扣掉午休", () => {
  const snap = computeSnapshot(base, at(18, 30));
  assert.equal(snap.ok, true);
  assert.equal(snap.phase, "after");
  assert.equal(snap.dayMinutes, 450);
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

test("支持 21.75 个工作日", () => {
  const snap = computeSnapshot({ ...base, workdays: "21.75" }, at(18, 30));
  assert.ok(Math.abs(snap.perDay - 22000 / 21.75) < 1e-9);
});

const shift = {
  salary: "19800",
  workdays: "22",
  start: "10:00",
  end: "22:00",
  breakEnabled: true,
  breakStart: "12:00",
  breakEnd: "14:00",
  dinnerEnabled: true,
  dinnerStart: "17:30",
  dinnerEnd: "18:30",
  weekdays: [1, 2, 3, 4, 5, 6],
};

test("默认班表会同时扣掉午休和晚饭", () => {
  const snap = computeSnapshot(shift, at(22, 0));
  assert.equal(snap.dayMinutes, 540);
  assert.equal(snap.breakSpan, 120);
  assert.equal(snap.dinnerSpan, 60);
  assert.equal(snap.segments.length, 5);
  assert.equal(snap.phase, "after");
  assert.ok(Math.abs(snap.perDay - 19800 / 22) < 1e-9);
  assert.ok(Math.abs(snap.earned - 19800 / 22) < 1e-9);
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
  assert.match(computeSnapshot({ ...base, weekdays: [] }).error, /上班日/);
});
