export function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}


const OVERRIDE_TIME_FIELDS = ["start", "end", "breakStart", "breakEnd", "dinnerStart", "dinnerEnd"];
const OVERRIDE_BOOLEAN_FIELDS = ["breakEnabled", "dinnerEnabled"];
export const MAX_DATE_OVERRIDES = 730;

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

function validateShift(input) {
  const start = parseClock(input.start);
  const end = parseClock(input.end);
  if (start == null || end == null) throw new Error("上下班时间还没填完整。");
  if (end <= start) throw new Error("下班时间要晚于上班时间。");
  const lunch = readPause(Boolean(input.breakEnabled), input.breakStart, input.breakEnd, "午休", start, end, "break");
  const dinner = readPause(Boolean(input.dinnerEnabled), input.dinnerStart, input.dinnerEnd, "晚饭", start, end, "dinner");
  if (!lunch.ok) throw new Error(lunch.error);
  if (!dinner.ok) throw new Error(dinner.error);
  if (lunch.start != null && dinner.start != null && lunch.start < dinner.end && dinner.start < lunch.end) {
    throw new Error("午休和晚饭的时间重叠了。");
  }
  if (end - start - lunch.span - dinner.span <= 0) throw new Error("扣掉休息之后，没有剩下的计薪时间。");
}

// Accept only date-keyed work/off records. Optional shift fields inherit the regular schedule.
export function validateDateOverrides(value, baseSettings) {
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
    const item = { mode: record.mode };
    if (record.mode === "work") {
      for (const field of OVERRIDE_TIME_FIELDS) {
        if (record[field] === undefined) continue;
        if (typeof record[field] !== "string" || !/^\d{1,2}:\d{2}$/.test(record[field]) || parseClock(record[field]) == null) throw new Error(`${key} 的时间格式无效。`);
        const minutes = parseClock(record[field]);
        item[field] = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      }
      for (const field of OVERRIDE_BOOLEAN_FIELDS) {
        if (record[field] === undefined) continue;
        if (typeof record[field] !== "boolean") throw new Error(`${key} 的休息开关格式无效。`);
        item[field] = record[field];
      }
      if (baseSettings || (item.start && item.end)) {
        try { validateShift({ ...baseSettings, ...item }); }
        catch (error) { throw new Error(`${key}：${error.message}`); }
      }
    }
    cleaned[key] = item;
  }
  return cleaned;
}

export function resolveScheduleForDate(input, date = new Date()) {
  const key = localDateKey(date);
  const override = input.dateOverrides?.[key];
  const weekdays = Array.isArray(input.weekdays) ? input.weekdays.map(Number) : [];
  return {
    ...input,
    ...(override?.mode === "work" ? override : {}),
    isWorkday: override ? override.mode === "work" : weekdays.includes(date.getDay()),
    overrideMode: override?.mode || null,
  };
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

function computeMonthProgress(now, weekdays, workdays, dateOverrides = {}) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let totalMatching = 0;
  let pastMatching = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day, 12);
    const override = dateOverrides[localDateKey(date)];
    const isWorkday = override ? override.mode === "work" : weekdays.includes(date.getDay());
    if (isWorkday) {
      totalMatching += 1;
      if (day < todayDate) pastMatching += 1;
    }
  }
  if (totalMatching === 0) return 0;
  return (pastMatching / totalMatching) * workdays;
}

export function computeSnapshot(input, now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return invalid("日期无效。");
  let dateOverrides;
  try { dateOverrides = validateDateOverrides(input.dateOverrides, input); }
  catch (error) { return invalid(error.message); }
  input = resolveScheduleForDate({ ...input, dateOverrides }, now);
  const salaryText = String(input.salary ?? "").trim();
  if (!salaryText) {
    return { ok: false, code: "empty", error: "填上月薪，今天挣了多少就会开始跳。" };
  }

  const salary = Number(salaryText);
  const workdays = Number(String(input.workdays ?? "").trim());
  const start = parseClock(input.start);
  const end = parseClock(input.end);
  const weekdays = Array.isArray(input.weekdays) ? input.weekdays.map(Number) : [];

  if (!Number.isFinite(salary) || salary <= 0) {
    return invalid("月薪要填一个大于 0 的数字。");
  }
  if (!Number.isFinite(workdays) || workdays <= 0 || workdays > 31) {
    return invalid("每月工作日要在 0 和 31 之间。");
  }
  if (start == null || end == null) {
    return invalid("上下班时间还没填完整。");
  }
  if (end <= start) {
    return invalid("下班时间要晚于上班时间。");
  }
  if (weekdays.length === 0 || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return invalid("至少选一个上班日。");
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
  const perDay = salary / workdays;
  const perMinute = perDay / dayMinutes;
  const rates = {
    perMinute,
    perHour: perMinute * 60,
    perSecond: perMinute / 60,
    perDay,
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
    const pastWorkdays = computeMonthProgress(now, weekdays, workdays, dateOverrides);
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
  const pastWorkdays = computeMonthProgress(now, weekdays, workdays, dateOverrides);
  const monthWorkdays = Math.min(workdays, pastWorkdays + progress);
  const monthEarned = monthWorkdays * perDay;

  return {
    ok: true,
    phase,
    ...rates,
    workedMinutes: worked,
    earned: perMinute * worked,
    progress,
    shiftProgress,
    monthWorkdays,
    monthEarned,
    nextStop,
  };
}
