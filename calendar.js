import { isRegularWorkday, localDateKey, toggleDateOverride, validateDateOverrides, workdaysInMonth } from "./earn.js";

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

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

// The calendar follows the xindong model: every day is either 班 or 休, clicking a day flips it
// immediately, manual marks show a "*", and the month's workday count drives the daily target.
// This component stays storage-free: the host owns persistence and backup.
// Call refresh() after importing a backup or changing the regular schedule.
export function setupCalendar({ container, getSettings, onChange }) {
  if (!container || typeof getSettings !== "function" || typeof onChange !== "function") {
    throw new Error("临时班表需要容器、当前设置和保存方法。");
  }
  const root = element("div", "calendar-settings");
  container.replaceChildren(root);
  const now = new Date();
  let visibleMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  let saving = false;
  let destroyed = false;

  root.append(element(
    "p",
    "calendar-help",
    "点击日期切换班/休，* 表示手动调整。法定节假日、调休请手动标记。日薪 = 月薪 ÷ 当月工作日，班内连续线性增长。",
  ));

  const navigation = element("div", "calendar-navigation");
  const previous = button("‹", "calendar-nav-button", () => changeMonth(-1));
  previous.setAttribute("aria-label", "上个月");
  const monthTitle = element("strong", "calendar-month-title");
  monthTitle.setAttribute("aria-live", "polite");
  const next = button("›", "calendar-nav-button", () => changeMonth(1));
  next.setAttribute("aria-label", "下个月");
  const todayButton = button("今天", "calendar-today-button", () => {
    const current = new Date();
    visibleMonth = new Date(current.getFullYear(), current.getMonth(), 1, 12);
    renderMonth();
    updateControls();
  });
  navigation.append(previous, monthTitle, next, todayButton);
  root.append(navigation);

  const monthSummary = element("p", "calendar-help calendar-month-summary");
  monthSummary.setAttribute("role", "status");
  root.append(monthSummary);

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
  root.append(element("p", "calendar-legend", "班 / 休：按休息方式推算　·　*：手动调休"));

  const actions = element("div", "calendar-actions");
  const resetMonthButton = button("重置本月调休", "calendar-reset", resetVisibleMonth);
  actions.append(resetMonthButton);
  root.append(actions);

  const status = element("p", "calendar-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.append(status);

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function monthPrefix() {
    return `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, "0")}-`;
  }

  function hasMonthOverrides() {
    const prefix = monthPrefix();
    return Object.keys(getSettings().dateOverrides || {}).some((key) => key.startsWith(prefix));
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function renderMonth() {
    const settings = getSettings();
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const currentKey = localDateKey(new Date());
    monthTitle.textContent = `${year} 年 ${month + 1} 月`;
    const monthWorkdays = workdaysInMonth(year, month, settings);
    const salaryValue = Number(String(settings.salary ?? "").trim());
    const masked = Boolean(settings.masked);
    monthSummary.textContent = monthWorkdays <= 0
      ? "本月计薪工作日：0 天 · 请至少标记一天上班"
      : Number.isFinite(salaryValue) && salaryValue > 0 && !masked
        ? `本月计薪工作日：${monthWorkdays} 天 · 日薪 ${formatMoney(salaryValue / monthWorkdays)}`
        : `本月计薪工作日：${monthWorkdays} 天`;
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
      const override = settings.dateOverrides?.[key];
      const working = override ? override.mode === "work" : isRegularWorkday(date, settings);
      const manuallySet = Boolean(override);
      const dayButton = button(undefined, "calendar-day", () => { if (!saving) toggleDay(date); });
      dayButton.append(
        element("span", "calendar-day-number", String(day)),
        element("span", "calendar-day-kind", `${working ? "班" : "休"}${manuallySet ? "*" : ""}`),
      );
      dayButton.dataset.date = key;
      dayButton.classList.toggle("is-off", !working);
      dayButton.classList.toggle("is-override", manuallySet);
      dayButton.classList.toggle("is-today", key === currentKey);
      dayButton.setAttribute(
        "aria-label",
        `${year} 年 ${month + 1} 月 ${day} 日，星期${WEEKDAY_NAMES[date.getDay()]}，${working ? "上班" : "休息"}${manuallySet ? "，手动调整" : ""}。点击切换`,
      );
      if (key === currentKey) dayButton.setAttribute("aria-current", "date");
      days.append(dayButton);
    }
  }

  function updateControls() {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    previous.disabled = saving || (year <= 1900 && month === 0);
    next.disabled = saving || (year >= 9999 && month === 11);
    todayButton.disabled = saving;
    resetMonthButton.disabled = saving || !hasMonthOverrides();
    for (const dayButton of days.querySelectorAll("button")) dayButton.disabled = saving;
  }

  async function persist(records, message) {
    if (saving || destroyed) return;
    try {
      const cleaned = validateDateOverrides(records);
      saving = true;
      updateControls();
      await onChange(cleaned);
      if (destroyed) return;
      renderMonth();
      showStatus(message);
    } catch (error) {
      if (!destroyed) showStatus(error.message || "保存失败，请重试。", true);
    } finally {
      saving = false;
      if (!destroyed) updateControls();
    }
  }

  function toggleDay(date) {
    const settings = getSettings();
    const key = localDateKey(date);
    const records = toggleDateOverride(settings.dateOverrides || {}, date, settings);
    const working = records[key] ? records[key].mode === "work" : isRegularWorkday(date, settings);
    const message = records[key]
      ? `${key} 已标记为${working ? "上班" : "休息"}。`
      : `${key} 已恢复常规班表。`;
    return persist(records, message);
  }

  function resetVisibleMonth() {
    const prefix = monthPrefix();
    const records = { ...getSettings().dateOverrides };
    const keys = Object.keys(records).filter((key) => key.startsWith(prefix));
    if (keys.length === 0) {
      showStatus("本月没有需要重置的调休。");
      return;
    }
    for (const key of keys) delete records[key];
    return persist(records, `${visibleMonth.getFullYear()} 年 ${visibleMonth.getMonth() + 1} 月的调休已重置。`);
  }

  function changeMonth(offset) {
    const changed = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1, 12);
    if (changed.getFullYear() < 1900 || changed.getFullYear() > 9999) return;
    visibleMonth = changed;
    renderMonth();
    updateControls();
  }

  renderMonth();
  updateControls();
  return {
    refresh() {
      if (destroyed) return;
      renderMonth();
      updateControls();
    },
    destroy() { destroyed = true; root.remove(); },
  };
}
