import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_DATE_OVERRIDES,
  isWorkdayForDate,
  localDateKey,
  parseDateKey,
  resolveScheduleForDate,
  toggleDateOverride,
  validateDateOverrides,
  workdaysInMonth,
} from "./earn.js";
import { setupCalendar } from "./calendar.js";

const base = { start: "09:30", end: "18:30", breakEnabled: true, breakStart: "12:00", breakEnd: "13:30", dinnerEnabled: false, rest: "双休", singleRest: 0 };

test("日期验证拒绝不存在日期并支持闰年和跨年", () => {
  assert.equal(localDateKey(parseDateKey("2028-02-29")), "2028-02-29");
  assert.equal(localDateKey(parseDateKey("2026-12-31")), "2026-12-31");
  assert.equal(localDateKey(parseDateKey("2027-01-01")), "2027-01-01");
  for (const value of ["2026-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-2-01", "0099-01-01", "2026-01-00", "", null]) {
    assert.equal(parseDateKey(value), null, String(value));
  }
});

test("日期键始终使用当地年月日，午夜不因 UTC 偏移而变成前一天", () => {
  assert.equal(localDateKey(new Date(2026, 9, 22, 0, 0)), "2026-10-22");
  assert.equal(localDateKey(new Date(2026, 9, 22, 23, 59)), "2026-10-22");
  assert.throws(() => localDateKey(new Date("invalid")), /日期无效/);
});

test("日历标记只保留班/休，旧备份里的逐日时段字段被丢弃且不修改原数据", () => {
  const input = {
    "2026-10-22": { mode: "work", start: "9:00", end: "18:00", breakEnabled: false, extra: "ignored" },
    "2026-10-23": { mode: "off", start: "bad", extra: true },
  };
  const before = JSON.stringify(input);
  assert.deepEqual(validateDateOverrides(input), { "2026-10-22": { mode: "work" }, "2026-10-23": { mode: "off" } });
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(validateDateOverrides(undefined), {});
});

test("日历标记的日期、结构和取值都会被验证", () => {
  for (const value of [null, [], "invalid"]) assert.throws(() => validateDateOverrides(value), /按日期保存/);
  assert.throws(() => validateDateOverrides({ "2026-02-29": { mode: "off" } }), /日期无效/);
  assert.throws(() => validateDateOverrides(JSON.parse('{"__proto__":{"mode":"off"}}')), /日期无效/);
  for (const mode of ["holiday", "", null, undefined]) {
    assert.throws(() => validateDateOverrides({ "2026-10-22": { mode } }), /选择上班或休息/);
  }
  assert.throws(() => validateDateOverrides({ "2026-10-22": null }), /选择上班或休息/);
  assert.throws(() => validateDateOverrides({ "2026-10-22": { mode: "work" }, "2026-10-23": [] }), /选择上班或休息/);
});

test("日历标记最多 730 条，拒绝无限增大的导入数据", () => {
  const records = {};
  for (let index = 0; index <= MAX_DATE_OVERRIDES; index += 1) records[localDateKey(new Date(2026, 0, 1 + index, 12))] = { mode: "off" };
  assert.throws(() => validateDateOverrides(records), /最多保存 730/);
  delete records[Object.keys(records)[0]];
  assert.equal(Object.keys(validateDateOverrides(records)).length, MAX_DATE_OVERRIDES);
});

test("点击日期在常规班表与手动标记之间来回切换", () => {
  const saturday = new Date(2026, 9, 24);
  const thursday = new Date(2026, 9, 22);
  assert.equal(isWorkdayForDate(saturday, base), false);
  const weekend = toggleDateOverride({}, saturday, base);
  assert.deepEqual(weekend, { "2026-10-24": { mode: "work" } });
  assert.equal(isWorkdayForDate(saturday, { ...base, dateOverrides: weekend }), true);
  // clicking again returns to the weekly rule, so the manual mark disappears
  assert.deepEqual(toggleDateOverride(weekend, saturday, base), {});

  const holiday = toggleDateOverride({}, thursday, base);
  assert.deepEqual(holiday, { "2026-10-22": { mode: "off" } });
  assert.equal(isWorkdayForDate(thursday, { ...base, dateOverrides: holiday }), false);
  assert.deepEqual(toggleDateOverride(holiday, thursday, base), {});
});

test("切换某一天不会影响其他手动标记", () => {
  const overrides = { "2026-10-17": { mode: "work" }, "2026-10-21": { mode: "off" } };
  const next = toggleDateOverride(overrides, new Date(2026, 9, 22), base);
  assert.deepEqual(next["2026-10-17"], { mode: "work" });
  assert.deepEqual(next["2026-10-21"], { mode: "off" });
  assert.deepEqual(next["2026-10-22"], { mode: "off" });
  assert.deepEqual(overrides, { "2026-10-17": { mode: "work" }, "2026-10-21": { mode: "off" } });
});

test("单休模式下点击周日的效果与其他日子一致", () => {
  const settings = { ...base, rest: "单休", singleRest: 0 };
  const sunday = new Date(2026, 9, 25);
  assert.equal(isWorkdayForDate(sunday, settings), false);
  const records = toggleDateOverride({}, sunday, settings);
  assert.deepEqual(records, { "2026-10-25": { mode: "work" } });
  assert.equal(workdaysInMonth(2026, 9, { ...settings, dateOverrides: records }), 28);
});

test("跨年和周末日期逐日解析，且不会把旧时段字段带入班表", () => {
  const settings = { ...base, dateOverrides: { "2026-12-31": { mode: "off" }, "2027-01-02": { mode: "work", end: "15:00" } } };
  assert.equal(resolveScheduleForDate(settings, new Date(2026, 11, 31, 12)).isWorkday, false);
  assert.equal(resolveScheduleForDate(settings, new Date(2027, 0, 1, 12)).isWorkday, true);
  const saturday = resolveScheduleForDate(settings, new Date(2027, 0, 2, 12));
  assert.equal(saturday.isWorkday, true);
  assert.equal(saturday.end, "18:30");
  assert.equal(resolveScheduleForDate(settings, new Date(2027, 0, 3, 12)).isWorkday, false);
  assert.equal(settings.end, "18:30");
});

test("日历接口要求宿主显式提供设置和保存方法", () => {
  assert.throws(() => setupCalendar({}), /容器、当前设置和保存方法/);
});
