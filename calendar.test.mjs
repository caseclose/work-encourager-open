import assert from "node:assert/strict";
import test from "node:test";
import { MAX_DATE_OVERRIDES, localDateKey, parseDateKey, resolveScheduleForDate, validateDateOverrides } from "./earn.js";
import { setupCalendar } from "./calendar.js";

const base = { start: "09:30", end: "18:30", breakEnabled: true, breakStart: "12:00", breakEnd: "13:30", dinnerEnabled: false, weekdays: [1, 2, 3, 4, 5] };

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

test("清洗临时班表只保留受支持字段且不会改变原数据", () => {
  const input = { "2026-10-22": { mode: "work", start: "9:00", end: "18:00", extra: "ignored" }, "2026-10-23": { mode: "off", start: "bad", extra: true } };
  const before = JSON.stringify(input);
  assert.deepEqual(validateDateOverrides(input, base), { "2026-10-22": { mode: "work", start: "09:00", end: "18:00" }, "2026-10-23": { mode: "off" } });
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(validateDateOverrides(undefined, base), {});
});

test("备份中的日期、类型、开关、时间和空工时均被验证", () => {
  for (const value of [null, [], "invalid"]) assert.throws(() => validateDateOverrides(value, base), /按日期保存/);
  assert.throws(() => validateDateOverrides({ "2026-02-29": { mode: "off" } }, base), /日期无效/);
  assert.throws(() => validateDateOverrides(JSON.parse('{"__proto__":{"mode":"off"}}'), base), /日期无效/);
  for (const mode of ["holiday", "", null]) assert.throws(() => validateDateOverrides({ "2026-10-22": { mode } }, base), /选择上班或休息/);
  assert.throws(() => validateDateOverrides({ "2026-10-22": { mode: "work", breakEnabled: "false" } }, base), /开关格式/);
  assert.throws(() => validateDateOverrides({ "2026-10-22": { mode: "work", start: 900 } }, base), /时间格式/);
  assert.throws(() => validateDateOverrides({ "2026-10-22": { mode: "work", end: "24:00" } }, base), /时间格式/);
  assert.throws(() => validateDateOverrides({ "2026-10-22": { mode: "work", end: "18:00:99" } }, base), /时间格式/);
  assert.throws(() => validateDateOverrides({ "2026-10-22": { mode: "work", start: "18:30", end: "18:30" } }, base), /下班时间要晚于/);
  assert.throws(() => validateDateOverrides({ "2026-10-22": { mode: "work", start: "12:00", end: "13:30" } }, base), /没有剩下/);
});

test("休息时段越界和重叠必须修正，关闭休息后短班可保存", () => {
  assert.throws(() => validateDateOverrides({ "2026-10-22": { mode: "work", end: "12:00" } }, base), /午休需要落在/);
  assert.throws(() => validateDateOverrides({ "2026-10-22": { mode: "work", dinnerEnabled: true, dinnerStart: "13:00", dinnerEnd: "14:00" } }, base), /重叠/);
  assert.deepEqual(validateDateOverrides({ "2026-10-22": { mode: "work", end: "12:00", breakEnabled: false } }, base), { "2026-10-22": { mode: "work", end: "12:00", breakEnabled: false } });
});

test("临时日期最多 730 条，拒绝无限增大的导入数据", () => {
  const records = {};
  for (let index = 0; index <= MAX_DATE_OVERRIDES; index += 1) records[localDateKey(new Date(2026, 0, 1 + index, 12))] = { mode: "off" };
  assert.throws(() => validateDateOverrides(records, base), /最多保存 730/);
  delete records[Object.keys(records)[0]];
  assert.equal(Object.keys(validateDateOverrides(records, base)).length, MAX_DATE_OVERRIDES);
});

test("跨年和周末日期逐日解析，不修改基础班表", () => {
  const settings = { ...base, dateOverrides: { "2026-12-31": { mode: "off" }, "2027-01-02": { mode: "work", end: "15:00" } } };
  assert.equal(resolveScheduleForDate(settings, new Date(2026, 11, 31, 12)).isWorkday, false);
  assert.equal(resolveScheduleForDate(settings, new Date(2027, 0, 1, 12)).isWorkday, true);
  const saturday = resolveScheduleForDate(settings, new Date(2027, 0, 2, 12));
  assert.equal(saturday.isWorkday, true);
  assert.equal(saturday.end, "15:00");
  assert.equal(resolveScheduleForDate(settings, new Date(2027, 0, 3, 12)).isWorkday, false);
  assert.equal(settings.end, "18:30");
});

test("日历接口要求宿主显式提供设置和保存方法", () => {
  assert.throws(() => setupCalendar({}), /容器、当前设置和保存方法/);
});
