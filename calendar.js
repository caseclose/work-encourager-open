import { localDateKey, parseDateKey, resolveScheduleForDate, validateDateOverrides } from "./earn.js";

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];
const CLOCK_DEFAULTS = { start: "09:00", end: "18:00", breakStart: "12:00", breakEnd: "13:00", dinnerStart: "17:00", dinnerEnd: "18:00" };

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, className, onClick) {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

// This component is deliberately storage-free: the host owns persistence and backup.
// Call refresh() after importing a backup or changing the regular working schedule.
export function setupCalendar({ container, getSettings, onChange }) {
  if (!container || typeof getSettings !== "function" || typeof onChange !== "function") {
    throw new Error("临时班表需要容器、当前设置和保存方法。");
  }
  const root = element("div", "calendar-settings");
  container.replaceChildren(root);
  let selectedDate = new Date();
  selectedDate.setHours(12, 0, 0, 0);
  let visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12);
  let dirty = false;
  let saving = false;
  let destroyed = false;

  root.append(element("p", "calendar-help", "节假日和调休请手动标记。未设置的日期沿用每周班表；改动只影响选中的一天。"));
  const navigation = element("div", "calendar-navigation");
  const previous = button("‹", "calendar-nav-button", () => changeMonth(-1));
  previous.setAttribute("aria-label", "上个月");
  const monthTitle = element("strong", "calendar-month-title");
  monthTitle.setAttribute("aria-live", "polite");
  const next = button("›", "calendar-nav-button", () => changeMonth(1));
  next.setAttribute("aria-label", "下个月");
  const today = button("今天", "calendar-today-button", () => selectDate(new Date()));
  navigation.append(previous, monthTitle, next, today);
  root.append(navigation);

  const calendar = element("div", "calendar-month");
  calendar.setAttribute("aria-label", "临时班表日期");
  const weekdayRow = element("div", "calendar-weekdays");
  for (const name of ["一", "二", "三", "四", "五", "六", "日"]) {
    const heading = element("span", "", name);
    heading.setAttribute("aria-hidden", "true");
    weekdayRow.append(heading);
  }
  const days = element("div", "calendar-days");
  calendar.append(weekdayRow, days);
  root.append(calendar);
  const legend = element("p", "calendar-legend", "班 / 休：常规班表　·　补班 / 假 / 临班：已设置");
  root.append(legend);

  const editor = element("div", "calendar-editor");
  const selectedTitle = element("strong", "calendar-selected-title");
  const selectedStatus = element("span", "calendar-selected-status");
  const selectionHeader = element("div", "calendar-selection-header");
  selectionHeader.append(selectedTitle, selectedStatus);
  editor.append(selectionHeader);

  const jumpLabel = element("label", "calendar-field");
  jumpLabel.append(element("span", "", "选择日期"));
  const dateInput = element("input", "calendar-date-input");
  dateInput.type = "date";
  dateInput.min = "1900-01-01";
  dateInput.max = "9999-12-31";
  dateInput.addEventListener("change", () => {
    const parsed = parseDateKey(dateInput.value);
    if (parsed) selectDate(parsed);
    else showStatus("请选择有效日期。", true);
  });
  jumpLabel.append(dateInput);
  editor.append(jumpLabel);

  const modeLabel = element("label", "calendar-field");
  modeLabel.append(element("span", "", "当天安排"));
  const mode = element("select", "calendar-mode");
  for (const [value, label] of [["regular", "按常规班表"], ["off", "休息 / 放假"], ["work", "上班 / 临时班表"]]) {
    const option = element("option", "", label);
    option.value = value;
    mode.append(option);
  }
  modeLabel.append(mode);
  editor.append(modeLabel);

  const shiftFields = element("div", "calendar-shift-fields");
  const times = {};
  const switches = {};
  function timeField(name, label) {
    const wrapper = element("label", "calendar-field");
    wrapper.append(element("span", "", label));
    const input = element("input", `calendar-time calendar-${name}`);
    input.type = "time";
    input.step = "60";
    input.addEventListener("input", markDirty);
    times[name] = input;
    wrapper.append(input);
    return wrapper;
  }
  const shiftRow = element("div", "calendar-time-pair");
  shiftRow.append(timeField("start", "临时上班"), timeField("end", "临时下班"));
  shiftFields.append(shiftRow);

  function pauseFields(name, title, startName, endName) {
    const section = element("div", "calendar-pause");
    const label = element("label", "calendar-pause-toggle");
    const input = element("input", "");
    input.type = "checkbox";
    switches[name] = input;
    label.append(input, element("span", "", title));
    const row = element("div", "calendar-time-pair");
    row.append(timeField(startName, `${title}开始`), timeField(endName, `${title}结束`));
    input.addEventListener("change", () => { markDirty(); updateFieldAvailability(); });
    section.append(label, row);
    shiftFields.append(section);
  }
  pauseFields("breakEnabled", "午休", "breakStart", "breakEnd");
  pauseFields("dinnerEnabled", "晚饭", "dinnerStart", "dinnerEnd");
  editor.append(shiftFields);

  const salaryNote = element("p", "calendar-help calendar-salary-note", "按月薪估算：完整上班日仍按每日预计收入计算，临时时段决定当天的计薪节奏。月度累计会按当月实际班表折算。缩短工时后，请同步调整或关闭休息时段。");
  editor.append(salaryNote);
  const actions = element("div", "calendar-actions");
  const save = button("保存当天安排", "calendar-save", saveSelectedDate);
  const reset = button("恢复常规", "calendar-reset", resetSelectedDate);
  actions.append(save, reset);
  editor.append(actions);
  const status = element("p", "calendar-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  editor.append(status);
  root.append(editor);

  mode.addEventListener("change", () => { markDirty(); updateFieldAvailability(); });

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function markDirty() {
    dirty = true;
    showStatus("有未保存的改动，点击“保存当天安排”后生效。");
  }

  function updateFieldAvailability() {
    const working = mode.value === "work";
    shiftFields.hidden = !working;
    salaryNote.hidden = !working;
    for (const input of Object.values(times)) input.disabled = !working || saving;
    for (const input of Object.values(switches)) input.disabled = !working || saving;
    times.breakStart.disabled = times.breakEnd.disabled = !working || !switches.breakEnabled.checked || saving;
    times.dinnerStart.disabled = times.dinnerEnd.disabled = !working || !switches.dinnerEnabled.checked || saving;
    save.disabled = saving;
    reset.disabled = saving || !getSettings().dateOverrides?.[localDateKey(selectedDate)];
    mode.disabled = saving;
    dateInput.disabled = saving;
    previous.disabled = saving || visibleMonth.getFullYear() <= 1900 && visibleMonth.getMonth() === 0;
    next.disabled = saving || visibleMonth.getFullYear() >= 9999 && visibleMonth.getMonth() === 11;
    today.disabled = saving;
  }

  function renderMonth() {
    const settings = getSettings();
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const currentKey = localDateKey(new Date());
    monthTitle.textContent = `${year} 年 ${month + 1} 月`;
    days.replaceChildren();
    const leading = (new Date(year, month, 1, 12).getDay() + 6) % 7;
    for (let blank = 0; blank < leading; blank += 1) {
      const spacer = element("span", "calendar-day-spacer");
      spacer.setAttribute("aria-hidden", "true");
      days.append(spacer);
    }
    const count = new Date(year, month + 1, 0, 12).getDate();
    for (let day = 1; day <= count; day += 1) {
      const date = new Date(year, month, day, 12);
      const key = localDateKey(date);
      const schedule = resolveScheduleForDate(settings, date);
      const regularWorkday = Array.isArray(settings.weekdays) && settings.weekdays.map(Number).includes(date.getDay());
      const shortLabel = schedule.overrideMode === "off" ? "假" : schedule.overrideMode === "work" ? (regularWorkday ? "临班" : "补班") : schedule.isWorkday ? "班" : "休";
      const dayButton = button(undefined, "calendar-day", () => { if (!saving) selectDate(date); });
      dayButton.append(element("span", "calendar-day-number", String(day)), element("span", "calendar-day-kind", shortLabel));
      dayButton.dataset.date = key;
      dayButton.classList.toggle("is-off", !schedule.isWorkday);
      dayButton.classList.toggle("is-override", Boolean(schedule.overrideMode));
      dayButton.classList.toggle("is-today", key === currentKey);
      dayButton.setAttribute("aria-pressed", String(key === localDateKey(selectedDate)));
      dayButton.setAttribute("aria-label", `${year} 年 ${month + 1} 月 ${day} 日，星期${WEEKDAY_NAMES[date.getDay()]}，${schedule.overrideMode ? "已设置，" : ""}${schedule.isWorkday ? "上班" : "休息"}`);
      if (key === currentKey) dayButton.setAttribute("aria-current", "date");
      days.append(dayButton);
    }
  }

  function loadEditor() {
    const settings = getSettings();
    const key = localDateKey(selectedDate);
    const record = settings.dateOverrides?.[key];
    const effective = resolveScheduleForDate(settings, selectedDate);
    const source = { ...settings, ...(record?.mode === "work" ? record : {}) };
    dateInput.value = key;
    selectedTitle.textContent = `${selectedDate.getMonth() + 1} 月 ${selectedDate.getDate()} 日 · 星期${WEEKDAY_NAMES[selectedDate.getDay()]}`;
    selectedStatus.textContent = record ? record.mode === "off" ? "已设为休息" : "已设临时班表" : effective.isWorkday ? "常规上班日" : "常规休息日";
    mode.value = record?.mode || "regular";
    for (const [name, input] of Object.entries(times)) input.value = source[name] || CLOCK_DEFAULTS[name];
    for (const [name, input] of Object.entries(switches)) input.checked = Boolean(source[name]);
    dirty = false;
    updateFieldAvailability();
  }

  function selectDate(date) {
    selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12);
    renderMonth();
    loadEditor();
    showStatus("");
  }

  function changeMonth(offset) {
    const changed = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1, 12);
    if (changed.getFullYear() < 1900 || changed.getFullYear() > 9999) return;
    visibleMonth = changed;
    renderMonth();
    updateFieldAvailability();
  }

  async function persist(records, message) {
    if (saving || destroyed) return;
    try {
      const cleaned = validateDateOverrides(records, getSettings());
      saving = true;
      updateFieldAvailability();
      await onChange(cleaned);
      if (destroyed) return;
      dirty = false;
      renderMonth();
      loadEditor();
      showStatus(message);
    } catch (error) {
      if (!destroyed) showStatus(error.message || "保存失败，请重试。", true);
    } finally {
      saving = false;
      if (!destroyed) updateFieldAvailability();
    }
  }

  function saveSelectedDate() {
    const key = localDateKey(selectedDate);
    if (dateInput.value !== key) {
      showStatus("请选择有效日期后再保存。", true);
      return;
    }
    const settings = getSettings();
    const records = { ...settings.dateOverrides };
    if (mode.value === "regular") delete records[key];
    else if (mode.value === "off") records[key] = { mode: "off" };
    else {
      const record = { mode: "work" };
      for (const [name, input] of Object.entries(times)) {
        // Disabled pause times are not required, but keep valid defaults for later editing.
        if (input.value) record[name] = input.value;
      }
      for (const [name, input] of Object.entries(switches)) record[name] = input.checked;
      // An empty active time must fail validation rather than inherit an old value.
      record.start = times.start.value;
      record.end = times.end.value;
      if (record.breakEnabled) { record.breakStart = times.breakStart.value; record.breakEnd = times.breakEnd.value; }
      if (record.dinnerEnabled) { record.dinnerStart = times.dinnerStart.value; record.dinnerEnd = times.dinnerEnd.value; }
      records[key] = record;
    }
    return persist(records, `${key} ${mode.value === "regular" ? "已恢复常规班表" : "的安排已保存"}。`);
  }

  function resetSelectedDate() {
    const key = localDateKey(selectedDate);
    const records = { ...getSettings().dateOverrides };
    delete records[key];
    return persist(records, `${key} 已恢复常规班表。`);
  }

  renderMonth();
  loadEditor();
  return {
    refresh() {
      if (destroyed) return;
      renderMonth();
      if (!dirty && !saving) loadEditor();
      else updateFieldAvailability();
    },
    destroy() { destroyed = true; root.remove(); },
  };
}
