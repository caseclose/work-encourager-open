export function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}


export const MAX_DATE_OVERRIDES = 730;
/** "双休" = Monday–Friday, "单休" = every weekday except the chosen rest day (web getDay numbering). */
export const REST_MODES = ["双休", "单休"];

export function localDateKey(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("日期无效。");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}


// Calendar marks are plain work/off records (xindong model). Only the mode is kept; per-day shift
// fields from older backups are dropped instead of being applied, so the calendar always means
// "this day works" or "this day rests".
export function validateDateOverrides(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("临时班表需要按日期保存。");
  const entries = Object.entries(value);
  if (entries.length > MAX_DATE_OVERRIDES) throw new Error(`最多保存 ${MAX_DATE_OVERRIDES} 个特殊日期。`);
  const cleaned = {};
  for (const [key, record] of entries) {
    if (!parseDateKey(key)) throw new Error(`临时班表日期无效：${key}。`);
    if (!record || typeof record !== "object" || Array.isArray(record) || !["off", "work"].includes(record.mode)) {
      throw new Error(`${key} 需要选择上班或休息。`);
    }
    cleaned[key] = { mode: record.mode };
  }
  return cleaned;
}

/**
 * Normalizes the weekly rest model used to derive a month's workdays.
 * Mirrors the xindong model: "双休" (Mon–Fri) or "单休" (every day except one weekday),
 * plus per-date calendar overrides. Legacy weekday arrays are migrated so existing
 * installations and old backups keep working.
 */
export function normalizeRestSettings(input = {}) {
  if (input.rest !== undefined) {
    if (!REST_MODES.includes(input.rest)) throw new Error("休息方式无效。");
    if (input.rest === "双休") return { rest: "双休", singleRest: 0 };
    const singleRest = Number(input.singleRest ?? 0);
    if (!Number.isInteger(singleRest) || singleRest < 0 || singleRest > 6) throw new Error("单休的休息日无效。");
    return { rest: "单休", singleRest };
  }

  const legacy = Array.isArray(input.weekdays)
    ? [...new Set(input.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    : null;
  if (legacy && legacy.length === 6) {
    const missing = [0, 1, 2, 3, 4, 5, 6].find((day) => !legacy.includes(day));
    return { rest: "单休", singleRest: missing };
  }
  return { rest: "双休", singleRest: 0 };
}

/** Regular weekday rule, ignoring calendar overrides. */
export function isRegularWorkday(date, settings = {}) {
  if (settings.rest === "单休") return date.getDay() !== Number(settings.singleRest ?? 0);
  return date.getDay() >= 1 && date.getDay() <= 5;
}

/** Effective workday for a date: a calendar override wins over the weekly rule. */
export function isWorkdayForDate(date, settings = {}) {
  const override = settings.dateOverrides?.[localDateKey(date)];
  if (override) return override.mode === "work";
  return isRegularWorkday(date, settings);
}

/** Number of payable workdays in a month, after regular rules and calendar overrides. */
export function workdaysInMonth(year, monthIndex, settings = {}) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let total = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    if (isWorkdayForDate(new Date(year, monthIndex, day, 12), settings)) total += 1;
  }
  return total;
}

function workdaysBefore(now, settings) {
  const year = now.getFullYear();
  const month = now.getMonth();
  let total = 0;
  for (let day = 1; day < now.getDate(); day += 1) {
    if (isWorkdayForDate(new Date(year, month, day, 12), settings)) total += 1;
  }
  return total;
}

export function resolveScheduleForDate(input, date = new Date()) {
  const key = localDateKey(date);
  const override = input.dateOverrides?.[key];
  return {
    ...input,
    isWorkday: override ? override.mode === "work" : isRegularWorkday(date, input),
    overrideMode: override?.mode || null,
  };
}

/** Flips one calendar day between 班 and 休; a value equal to the weekly rule clears the override. */
export function toggleDateOverride(overrides, date, settings = {}) {
  const key = localDateKey(date);
  const records = { ...(overrides || {}) };
  const regular = isRegularWorkday(date, settings);
  const current = records[key] ? records[key].mode === "work" : regular;
  const next = !current;
  if (next === regular) delete records[key];
  else records[key] = { mode: next ? "work" : "off" };
  return records;
}

function invalid(error) {
  return { ok: false, error };
}

function minutesNow(now) {
  return (
    now.getHours() * 60 +
    now.getMinutes() +
    now.getSeconds() / 60 +
    now.getMilliseconds() / 60000
  );
}

function readPause(enabled, startValue, endValue, label, shiftStart, shiftEnd, phase) {
  if (!enabled) return { ok: true, span: 0, start: null, end: null, phase };
  const start = parseClock(startValue);
  const end = parseClock(endValue);
  if (start == null || end == null) return { ok: false, error: `${label}时间还没填完整。` };
  if (end <= start) return { ok: false, error: `${label}结束要晚于${label}开始。` };
  if (start < shiftStart || end > shiftEnd) return { ok: false, error: `${label}需要落在上班时间里面。` };
  return { ok: true, span: end - start, start, end, phase };
}

function buildSegments(shiftStart, shiftEnd, pauses) {
  const ordered = [...pauses].sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = shiftStart;
  for (const pause of ordered) {
    if (pause.start > cursor) {
      segments.push({ kind: "work", start: cursor, end: pause.start });
    }
    segments.push({ kind: pause.phase, start: pause.start, end: pause.end });
    cursor = pause.end;
  }
  if (cursor < shiftEnd) {
    segments.push({ kind: "work", start: cursor, end: shiftEnd });
  }
  return segments;
}

export function computeSnapshot(input, now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return invalid("日期无效。");
  let dateOverrides;
  try { dateOverrides = validateDateOverrides(input.dateOverrides, input); }
  catch (error) { return invalid(error.message); }
  let rest;
  try { rest = normalizeRestSettings(input); }
  catch (error) { return invalid(error.message); }
  input = resolveScheduleForDate({ ...input, ...rest, dateOverrides }, now);
  const salaryText = String(input.salary ?? "").trim();
  if (!salaryText) {
    return { ok: false, code: "empty", error: "填上月薪，今天挣了多少就会开始跳。" };
  }

  const salary = Number(salaryText);
  const start = parseClock(input.start);
  const end = parseClock(input.end);

  if (!Number.isFinite(salary) || salary <= 0) {
    return invalid("月薪要填一个大于 0 的数字。");
  }
  if (start == null || end == null) {
    return invalid("上下班时间还没填完整。");
  }
  if (end <= start) {
    return invalid("下班时间要晚于上班时间。");
  }

  // Workdays are derived from the monthly calendar: weekly rest rule plus every
  // month-level adjustment (holiday, make-up workday) marked in the calendar.
  const monthWorkdays = workdaysInMonth(now.getFullYear(), now.getMonth(), input);
  if (monthWorkdays <= 0) {
    return invalid("日历里这个月还没有上班日，至少标记一天上班。");
  }

  const lunch = readPause(
    Boolean(input.breakEnabled),
    input.breakStart,
    input.breakEnd,
    "午休",
    start,
    end,
    "break",
  );
  if (!lunch.ok) return invalid(lunch.error);
  const dinner = readPause(
    Boolean(input.dinnerEnabled),
    input.dinnerStart,
    input.dinnerEnd,
    "dinner",
    start,
    end,
    "dinner",
  );
  if (!dinner.ok) {
    return invalid(dinner.error.replace("dinner", "晚饭"));
  }
  if (
    lunch.start != null &&
    dinner.start != null &&
    lunch.start < dinner.end &&
    dinner.start < lunch.end
  ) {
    return invalid("午休和晚饭的时间重叠了。");
  }

  const pauses = [lunch, dinner].filter((pause) => pause.start != null);
  const spanMinutes = end - start;
  const dayMinutes = spanMinutes - lunch.span - dinner.span;
  if (dayMinutes <= 0) {
    return invalid("扣掉休息之后，没有剩下的计薪时间。");
  }

  const segments = buildSegments(start, end, pauses);
  // Daily target: monthly salary spread over the days this month actually pays for.
  const perDay = salary / monthWorkdays;
  const perMinute = perDay / dayMinutes;
  const rates = {
    perMinute,
    perHour: perMinute * 60,
    perSecond: perMinute / 60,
    perDay,
    workdaysInMonth: monthWorkdays,
    dayMinutes,
    spanMinutes,
    startMinutes: start,
    endMinutes: end,
    breakSpan: lunch.span,
    dinnerSpan: dinner.span,
    segments,
    dateKey: localDateKey(now),
    isOverride: Boolean(input.overrideMode),
    effectiveSettings: input,
  };

  if (!input.isWorkday) {
    const pastWorkdays = workdaysBefore(now, input);
    return {
      ok: true,
      phase: "off",
      ...rates,
      workedMinutes: 0,
      earned: 0,
      progress: 0,
      shiftProgress: 0,
      monthWorkdays: pastWorkdays,
      monthEarned: pastWorkdays * perDay,
      nextStop: null,
    };
  }

  const nowMinutes = minutesNow(now);
  let phase = "working";
  let worked = 0;

  if (nowMinutes < start) {
    phase = "before";
  } else if (nowMinutes >= end) {
    phase = "after";
    worked = dayMinutes;
  } else {
    const active = pauses.find((pause) => nowMinutes >= pause.start && nowMinutes < pause.end);
    phase = active ? active.phase : "working";
    worked = nowMinutes - start;
    for (const pause of pauses) {
      if (nowMinutes > pause.start) worked -= Math.min(nowMinutes, pause.end) - pause.start;
    }
  }

  worked = Math.max(0, Math.min(dayMinutes, worked));
  const shiftProgress = Math.max(0, Math.min(1, (nowMinutes - start) / spanMinutes));

  let nextStop = null;
  if (phase === "before") {
    nextStop = { kind: "start", minutesLeft: start - nowMinutes };
  } else if (phase === "break" || phase === "dinner") {
    const active = pauses.find((pause) => pause.phase === phase);
    nextStop = { kind: "resume", phase, minutesLeft: active.end - nowMinutes };
  } else if (phase === "working") {
    const upcoming = [...pauses]
      .filter((pause) => pause.start > nowMinutes)
      .sort((a, b) => a.start - b.start)[0];
    nextStop = upcoming
      ? { kind: upcoming.phase, minutesLeft: upcoming.start - nowMinutes }
      : { kind: "end", minutesLeft: end - nowMinutes };
  }

  const progress = worked / dayMinutes;
  const pastWorkdays = workdaysBefore(now, input);
  const accruedWorkdays = Math.min(monthWorkdays, pastWorkdays + progress);
  const monthEarned = accruedWorkdays * perDay;

  return {
    ok: true,
    phase,
    ...rates,
    workedMinutes: worked,
    earned: perMinute * worked,
    progress,
    shiftProgress,
    monthWorkdays: accruedWorkdays,
    monthEarned,
    nextStop,
  };
}
