import { computeSnapshot } from "./earn.js";

const STORAGE_KEY = "work-encourager-settings-v1";

const defaults = {
  salary: "",
  workdays: "22",
  start: "09:30",
  end: "18:30",
  breakEnabled: true,
  breakStart: "12:00",
  breakEnd: "13:30",
  dinnerEnabled: false,
  dinnerStart: "18:00",
  dinnerEnd: "19:00",
  weekdays: [1, 2, 3, 4, 5],
  collapsed: true,
  barMode: "earned",
  masked: false,
  theme: "auto",
};

const BAR_MODES = [
  { key: "earned", label: "已挣" },
  { key: "remaining", label: "剩余" },
  { key: "plain", label: "仅金额" },
];

const REWARD_POOL = [
  { amount: 17, label: "营养工作餐", unit: "一顿" },
  { amount: 22, label: "通勤打车", unit: "一趟" },
  { amount: 25, label: "韩式炸鸡", unit: "一份" },
  { amount: 30, label: "披萨", unit: "一个" },
  { amount: 49, label: "有线耳机", unit: "一副" },
  { amount: 80, label: "自助烤肉", unit: "一位" },
  { amount: 99, label: "无线鼠标", unit: "一个" },
  { amount: 125, label: "欢乐牧场自助", unit: "一位" },
  { amount: 199, label: "磁吸充电宝", unit: "一个" },
  { amount: 249, label: "智能手环", unit: "一个" },
  { amount: 268, label: "Steam 3A 大作", unit: "一份" },
  { amount: 329, label: "骨传导运动耳机", unit: "一副" },
];

const BIG_GOALS = [
  { amount: 5999, label: "iPhone", unit: "一台" },
  { amount: 7999, label: "MacBook Air", unit: "一台" },
];

const PAT_NOTES = [
  "这一分钟不是白坐的，它已经变成真金白银落进今天里。",
  "不用一口气扛完十二个小时，先挣到手边这一杯喝的。",
  "觉得累就去接杯水，连歇口气的那几步路都在算钱。",
  "你只管把眼前的事做完，跳数字这件事交给我。",
  "距离下一顿饭或者下班，其实已经比刚才又近了一截。",
  "今天每往前推一分钟，都是在给下班后的自己攒底气。",
];

const PHASE_LABEL = {
  before: "未开始",
  working: "计薪中",
  break: "午休中",
  dinner: "晚饭中",
  after: "已下班",
  off: "休息日",
};

const DAY_NAMES = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 0: "日" };

const form = document.querySelector("#form");
const amountEl = document.querySelector("#amount");
const wholeEl = document.querySelector("#amount-whole");
const centsEl = document.querySelector("#amount-cents");
const headlineEl = document.querySelector("#headline");
const nextStopEl = document.querySelector("#next-stop");
const patBtn = document.querySelector("#pat");
const patLineEl = document.querySelector("#pat-line");
const patToastEl = document.querySelector("#pat-toast");
const timelineCardEl = document.querySelector("#timeline-card");
const timelinePctEl = document.querySelector("#timeline-pct");
const segmentsEl = document.querySelector("#segments");
const cursorEl = document.querySelector("#cursor");
const scaleStartEl = document.querySelector("#scale-start");
const scaleBreaksEl = document.querySelector("#scale-breaks");
const scaleEndEl = document.querySelector("#scale-end");
const statusEl = document.querySelector("#status");
const rewardsWrapEl = document.querySelector("#rewards-wrap");
const rewardsNextEl = document.querySelector("#rewards-next");
const rewardsEl = document.querySelector("#rewards");
const bigGoalsWrapEl = document.querySelector("#big-goals-wrap");
const bigGoalsSummaryEl = document.querySelector("#big-goals-summary");
const bigGoalsEl = document.querySelector("#big-goals");
const formulaEl = document.querySelector("#formula");
const statsEl = document.querySelector("#stats");
const pillEl = document.querySelector("#pill");
const clockEl = document.querySelector("#clock");
const messageEl = document.querySelector("#form-message");
const foldBtn = document.querySelector("#fold-btn");
const foldLabelEl = document.querySelector("#fold-label");
const sheetHeadEl = document.querySelector("#sheet-head");
const sheetBodyEl = document.querySelector("#sheet-body");
const sheetSubEl = document.querySelector("#sheet-sub");
const privacyBadgeEl = document.querySelector("#privacy-badge");
const themeBtn = document.querySelector("#theme-btn");
const themeSunEl = document.querySelector("#theme-sun");
const themeMoonEl = document.querySelector("#theme-moon");
const maskBtn = document.querySelector("#mask-btn");
const eyeOpenEl = document.querySelector("#eye-open");
const eyeOffEl = document.querySelector("#eye-off");
const barModeBtn = document.querySelector("#bar-mode-btn");
const barModeLabelEl = document.querySelector("#bar-mode-label");
const quitBtn = document.querySelector("#quit-btn");
const dayButtons = [...document.querySelectorAll(".day")];

const urlParams = new URLSearchParams(window.location.search);
const isMenuBarApp = urlParams.get("menubar") === "1";
const initialSystemTheme = urlParams.get("systemTheme");
if (isMenuBarApp) {
  document.documentElement.classList.add("is-menubar");
  if (quitBtn) quitBtn.hidden = false;
}

let patIndex = -1;
let isCollapsed = true;
let barMode = "earned";
let isMasked = false;
let themeMode = "auto";
let toastTimer = null;
const darkMedia = window.matchMedia("(prefers-color-scheme: dark)");

const money = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value, digits = 2) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatRate(value) {
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
  return formatMoney(value, digits);
}

function formatDuration(minutes, rounding = "round") {
  const safe = Math.max(0, minutes);
  const whole =
    rounding === "floor" ? Math.floor(safe) : rounding === "ceil" ? Math.ceil(safe) : Math.round(safe);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours <= 0) return `${rest} 分钟`;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分钟`;
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return { ...defaults, weekdays: [...defaults.weekdays] };
    return {
      ...defaults,
      ...parsed,
      weekdays: Array.isArray(parsed.weekdays)
        ? parsed.weekdays.map(Number)
        : [...defaults.weekdays],
    };
  } catch {
    return { ...defaults, weekdays: [...defaults.weekdays] };
  }
}

function fillForm(settings) {
  form.salary.value = settings.salary;
  form.workdays.value = settings.workdays;
  form.start.value = settings.start;
  form.end.value = settings.end;
  form.breakEnabled.checked = Boolean(settings.breakEnabled);
  form.breakStart.value = settings.breakStart;
  form.breakEnd.value = settings.breakEnd;
  form.dinnerEnabled.checked = Boolean(settings.dinnerEnabled);
  form.dinnerStart.value = settings.dinnerStart;
  form.dinnerEnd.value = settings.dinnerEnd;
  for (const button of dayButtons) {
    button.setAttribute("aria-pressed", settings.weekdays.includes(Number(button.dataset.day)) ? "true" : "false");
  }
  isCollapsed = true;
  barMode = BAR_MODES.some((item) => item.key === settings.barMode) ? settings.barMode : "earned";
  isMasked = Boolean(settings.masked);
  themeMode = ["light", "dark", "auto"].includes(settings.theme) ? settings.theme : "auto";
  syncBreakFields();
}

function readForm() {
  return {
    salary: form.salary.value.trim(),
    workdays: form.workdays.value.trim(),
    start: form.start.value,
    end: form.end.value,
    breakEnabled: form.breakEnabled.checked,
    breakStart: form.breakStart.value,
    breakEnd: form.breakEnd.value,
    dinnerEnabled: form.dinnerEnabled.checked,
    dinnerStart: form.dinnerStart.value,
    dinnerEnd: form.dinnerEnd.value,
    weekdays: dayButtons
      .filter((button) => button.getAttribute("aria-pressed") === "true")
      .map((button) => Number(button.dataset.day)),
    collapsed: isCollapsed,
    barMode,
    masked: isMasked,
    theme: themeMode,
  };
}

function effectiveTheme() {
  if (themeMode === "light" || themeMode === "dark") return themeMode;
  if (initialSystemTheme === "dark" || initialSystemTheme === "light") return initialSystemTheme;
  return darkMedia.matches ? "dark" : "light";
}

function syncThemeUI() {
  const current = effectiveTheme();
  document.documentElement.dataset.theme = current;
  const isDark = current === "dark";
  themeSunEl.style.display = isDark ? "block" : "none";
  themeMoonEl.style.display = isDark ? "none" : "block";
  themeSunEl.hidden = !isDark;
  themeMoonEl.hidden = isDark;
  themeBtn.setAttribute("aria-pressed", isDark ? "true" : "false");
  themeBtn.title = isDark ? "当前深色模式，点击切换到浅色模式" : "当前浅色模式，点击切换到深色模式";
}

function syncMaskUI() {
  maskBtn.setAttribute("aria-pressed", isMasked ? "true" : "false");
  maskBtn.title = isMasked ? "显示金额" : "隐藏金额（隐私模式）";
  eyeOpenEl.hidden = isMasked;
  eyeOffEl.hidden = !isMasked;
  form.salary.type = isMasked ? "password" : "text";
}

function formatCollapsedSummary(settings) {
  const parts = [];
  if (settings.start && settings.end) {
    parts.push(`${settings.start}–${settings.end}`);
  }
  const dayLabels = settings.weekdays.map((day) => DAY_NAMES[day]).filter(Boolean);
  if (dayLabels.length > 0) {
    parts.push(`周${dayLabels.join("、")}`);
  }
  return parts.join(" · ");
}

function syncFoldUI(settings, snapshot) {
  const effectiveCollapsed = isCollapsed && snapshot.ok;
  form.classList.toggle("is-collapsed", effectiveCollapsed);
  sheetBodyEl.hidden = effectiveCollapsed;
  privacyBadgeEl.hidden = !effectiveCollapsed;
  foldBtn.setAttribute("aria-expanded", effectiveCollapsed ? "false" : "true");
  foldLabelEl.textContent = effectiveCollapsed ? "展开修改" : "收起班表";
  sheetSubEl.textContent = effectiveCollapsed
    ? formatCollapsedSummary(settings)
    : "改完立刻重算，仅保存在本机。";
}

function syncBreakFields() {
  const lunchOn = form.breakEnabled.checked;
  form.breakStart.disabled = !lunchOn;
  form.breakEnd.disabled = !lunchOn;
  const dinnerOn = form.dinnerEnabled.checked;
  form.dinnerStart.disabled = !dinnerOn;
  form.dinnerEnd.disabled = !dinnerOn;
}

function save(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function pickRewards(perDay) {
  const within = REWARD_POOL.filter((item) => item.amount <= perDay * 0.99);
  const picked = within.length <= 12
    ? within
    : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(
        (slot) => within[Math.round((slot * (within.length - 1)) / 11)],
      );
  if (picked.length > 0) return picked;
  return [0.2, 0.5, 0.85].map((ratio, index) => ({
    amount: Math.max(0.5, Number((perDay * ratio).toFixed(1))),
    label: ["今日起步", "今日过半", "今日收尾"][index],
    unit: "一档",
  }));
}

function headlineFor(snapshot) {
  if (snapshot.phase === "before") {
    return "还没到打卡点，先把今天的心情放轻松。";
  }
  if (snapshot.phase === "break") {
    return "午休时间，上午挣到的那笔已经稳稳落袋。";
  }
  if (snapshot.phase === "dinner") {
    return "先好好吃晚饭，白天的大半程已经拿下了。";
  }
  if (snapshot.phase === "after") {
    return "今天这一班圆满收工，挣到的每一分都算数。";
  }
  if (snapshot.phase === "off") {
    return "今天不在班表里，安心歇着就是最好的安排。";
  }
  if (snapshot.progress < 0.18) {
    return "今天刚开张，每一分钟都在往口袋里添钱。";
  }
  if (snapshot.progress < 0.5) {
    return "上午的进度正在铺开，不知不觉已经攒下一小笔。";
  }
  if (snapshot.progress < 0.8) {
    return "今天已经过半，后面的每一分钟都在冲刺。";
  }
  return "已经在收尾路段了，下班就在前面。";
}

function nextStopText(settings, snapshot) {
  const stop = snapshot.nextStop;
  if (!stop) {
    return snapshot.phase === "after" ? `已完成 ${settings.end} 下班打卡` : "今日休息";
  }
  const wait = formatDuration(stop.minutesLeft, "ceil");
  if (stop.kind === "start") return `${wait}后开工`;
  if (stop.kind === "break") return `${wait}后午休`;
  if (stop.kind === "dinner") return `${wait}后晚饭`;
  if (stop.kind === "resume") return `${wait}后恢复计薪`;
  return `${wait}后下班`;
}

function renderTimeline(snapshot, now) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  segmentsEl.replaceChildren(
    ...snapshot.segments.map((seg) => {
      const box = document.createElement("div");
      const span = seg.end - seg.start;
      box.className = `seg ${seg.kind === "work" ? "seg-work" : "seg-pause"}`;
      box.style.flexGrow = String(span);
      if (seg.kind === "work") {
        const fill = document.createElement("div");
        fill.className = "seg-fill";
        const ratio =
          snapshot.phase === "off"
            ? 0
            : Math.max(0, Math.min(1, (nowMinutes - seg.start) / span));
        fill.style.width = `${Math.round(ratio * 1000) / 10}%`;
        box.append(fill);
      }
      return box;
    }),
  );
  cursorEl.hidden = snapshot.phase === "off";
  cursorEl.style.left = `${Math.round(snapshot.shiftProgress * 1000) / 10}%`;
}

function renderRewards(snapshot) {
  const items = pickRewards(snapshot.perDay);
  const nextItem = items.find((item) => snapshot.earned + 0.005 < item.amount);

  if (nextItem) {
    const gap = Math.max(0, nextItem.amount - snapshot.earned);
    const mins = formatDuration(gap / snapshot.perMinute, "ceil");
    rewardsNextEl.textContent = isMasked
      ? `再挣 ****（约 ${mins}）点亮「${nextItem.label}」`
      : `再挣 ${formatMoney(gap)}（约 ${mins}）点亮「${nextItem.label}」`;
  } else {
    rewardsNextEl.textContent = "今天的小目标已经全部点亮";
  }

  rewardsEl.replaceChildren(
    ...items.map((item) => {
      const done = snapshot.earned + 0.005 >= item.amount;
      const isNext = nextItem && nextItem.amount === item.amount;
      const ratio = Math.max(0, Math.min(1, snapshot.earned / item.amount));
      const li = document.createElement("li");
      li.className = `reward${done ? " is-done" : ""}${isNext ? " is-next" : ""}`;
      const costText = isMasked ? "****" : formatMoney(item.amount, item.amount % 1 ? 1 : 0);
      const subText = done
        ? `已挣够${item.unit}`
        : isNext
          ? `差 ${isMasked ? "****" : formatMoney(item.amount - snapshot.earned)}`
          : item.unit;
      li.innerHTML = `
        <div class="reward-top">
          <span class="reward-name">${item.label}</span>
          <span class="reward-cost">${costText}</span>
        </div>
        <p class="reward-sub">${subText}</p>
        <div class="reward-bar"><span style="width:${Math.round(ratio * 100)}%"></span></div>
      `;
      return li;
    }),
  );
}

function renderBigGoals(snapshot) {
  const accumulated = snapshot.monthEarned;
  const workedDays = snapshot.monthWorkdays;
  bigGoalsSummaryEl.textContent = isMasked
    ? `本月已累算 ${workedDays.toFixed(1)} 个工作日 · ****`
    : `本月已累算 ${workedDays.toFixed(1)} 个工作日 · ${money.format(accumulated)}`;

  bigGoalsEl.replaceChildren(
    ...BIG_GOALS.map((goal) => {
      const totalDays = goal.amount / snapshot.perDay;
      const ratio = Math.max(0, Math.min(1, accumulated / goal.amount));
      const pct = Math.round(ratio * 1000) / 10;
      const leftAmount = Math.max(0, goal.amount - accumulated);
      const leftDays = leftAmount / snapshot.perDay;
      const todayDays = snapshot.earned / snapshot.perDay;
      const costText = isMasked ? "****" : formatMoney(goal.amount, 0);
      const footText =
        leftAmount <= 0.01
          ? `本月已攒够${goal.unit}（共约 ${totalDays.toFixed(1)} 个工作日）`
          : isMasked
            ? `还差 ${leftDays.toFixed(1)} 个工作日 · 今日已推进 +${(todayDays * 100 / totalDays).toFixed(1)}%`
            : `还差 ${leftDays.toFixed(1)} 天（${formatMoney(leftAmount, 0)}）· 今日 +${formatMoney(snapshot.earned, 0)}`;

      const li = document.createElement("li");
      li.className = "big-goal";
      li.innerHTML = `
        <div class="big-goal-top">
          <span class="big-goal-name">${goal.label}</span>
          <span class="big-goal-cost">${costText}</span>
        </div>
        <p class="big-goal-meta">
          <span>共需 ${totalDays.toFixed(1)} 个工作日</span>
          <span class="big-goal-pct">${pct.toFixed(1)}%</span>
        </p>
        <div class="big-goal-bar"><span style="width:${Math.min(100, pct)}%"></span></div>
        <p class="big-goal-foot">${footText}</p>
      `;
      return li;
    }),
  );
}

function setAmountText(snapshot) {
  if (!snapshot.ok) {
    wholeEl.textContent = snapshot.code === "empty" ? "先填月薪" : "先改班表";
    centsEl.textContent = "";
    amountEl.classList.add("is-empty");
    amountEl.style.fontSize = "";
    return;
  }
  if (isMasked) {
    wholeEl.textContent = "¥****";
    centsEl.textContent = "";
    amountEl.classList.remove("is-empty");
    amountEl.style.fontSize = "";
    return;
  }
  const formatted = money.format(snapshot.earned);
  const dot = formatted.indexOf(".");
  wholeEl.textContent = dot === -1 ? formatted : formatted.slice(0, dot);
  centsEl.textContent = dot === -1 ? "" : formatted.slice(dot);
  amountEl.classList.remove("is-empty");
  amountEl.style.fontSize = formatted.length > 10 ? "clamp(2.6rem, 8vw, 4.2rem)" : "";
}

function render() {
  const settings = readForm();
  const now = new Date();
  const snapshot = computeSnapshot(settings, now);

  const activeBarMode = BAR_MODES.find((item) => item.key === barMode) || BAR_MODES[0];
  barModeLabelEl.textContent = activeBarMode.label;

  clockEl.textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

  setAmountText(snapshot);
  syncThemeUI();
  syncMaskUI();
  syncFoldUI(settings, snapshot);
  messageEl.textContent = snapshot.ok || snapshot.code === "empty" ? "" : snapshot.error;

  if (!snapshot.ok) {
    headlineEl.textContent = snapshot.error;
    nextStopEl.hidden = true;
    pillEl.hidden = true;
    timelineCardEl.hidden = true;
    rewardsWrapEl.hidden = true;
    bigGoalsWrapEl.hidden = true;
    statsEl.hidden = true;
    formulaEl.textContent = "";
    postMenuBarStatus(snapshot);
    return;
  }

  const percent = Math.round(snapshot.progress * 100);
  const left = snapshot.dayMinutes - snapshot.workedMinutes;
  const pauses = [];
  const pauseMarks = [];
  if (settings.breakEnabled) {
    pauses.push(`午休扣掉 ${formatDuration(snapshot.breakSpan)}`);
    pauseMarks.push(`午休 ${settings.breakStart}–${settings.breakEnd}`);
  }
  if (settings.dinnerEnabled) {
    pauses.push(`晚饭扣掉 ${formatDuration(snapshot.dinnerSpan)}`);
    pauseMarks.push(`晚饭 ${settings.dinnerStart}–${settings.dinnerEnd}`);
  }
  const breakText = pauses.length ? `，${pauses.join("，")}` : "";

  pillEl.hidden = false;
  pillEl.dataset.phase = snapshot.phase;
  pillEl.textContent = PHASE_LABEL[snapshot.phase];

  headlineEl.textContent = headlineFor(snapshot);
  nextStopEl.hidden = false;
  nextStopEl.textContent = nextStopText(settings, snapshot);

  timelineCardEl.hidden = false;
  scaleStartEl.textContent = `${settings.start} 上班`;
  scaleBreaksEl.textContent = pauseMarks.join(" · ");
  scaleEndEl.textContent = `${settings.end} 下班`;
  statusEl.textContent =
    snapshot.phase === "off"
      ? "今天休息，不计工时"
      : `已计薪 ${formatDuration(snapshot.workedMinutes, "floor")} · 还剩 ${formatDuration(left, "ceil")}`;
  timelinePctEl.textContent = `${percent}%`;

  renderTimeline(snapshot, now);
  rewardsWrapEl.hidden = false;
  renderRewards(snapshot);
  bigGoalsWrapEl.hidden = false;
  renderBigGoals(snapshot);

  statsEl.hidden = false;
  document.querySelector("#per-minute").textContent = isMasked ? "****" : formatRate(snapshot.perMinute);
  document.querySelector("#per-hour").textContent = isMasked ? "****" : formatRate(snapshot.perHour);
  document.querySelector("#per-day").textContent = isMasked ? "****" : money.format(snapshot.perDay);
  formulaEl.textContent = isMasked
    ? `月薪 **** ÷ ${settings.workdays} 天 ÷ ${formatDuration(snapshot.dayMinutes)}${breakText} = 每分钟 ****`
    : `月薪 ÷ ${settings.workdays} 天 ÷ ${formatDuration(snapshot.dayMinutes)}${breakText} = 每分钟 ${formatRate(snapshot.perMinute)}`;
  postMenuBarStatus(snapshot);
}

function buildMenuBarStatus(snapshot) {
  const theme = effectiveTheme();
  if (!snapshot.ok) {
    return { title: "鼓励器", phase: "empty", masked: isMasked, theme };
  }
  if (barMode === "remaining") {
    const remaining = Math.max(0, snapshot.perDay - snapshot.earned);
    return {
      title: `剩余 ${isMasked ? "¥***" : money.format(remaining)}`,
      phase: snapshot.phase,
      masked: isMasked,
      theme,
    };
  }
  const formatted = isMasked ? "¥***" : money.format(snapshot.earned);
  if (barMode === "plain") {
    return {
      title: formatted,
      phase: snapshot.phase,
      masked: isMasked,
      theme,
    };
  }
  const prefixMap = {
    before: "待开工",
    working: "已挣",
    break: "午休",
    dinner: "晚饭",
    after: "今日",
    off: "休息",
  };
  const prefix = prefixMap[snapshot.phase] || "已挣";
  return {
    title: `${prefix} ${formatted}`,
    phase: snapshot.phase,
    masked: isMasked,
    theme,
  };
}

function postMenuBarStatus(snapshot) {
  const payload = buildMenuBarStatus(snapshot);
  window.__latestMenuBarStatus = payload;
  if (window.webkit?.messageHandlers?.statusBar) {
    window.webkit.messageHandlers.statusBar.postMessage(payload);
  }
}

window.__getMenuBarStatus = () => {
  const snapshot = computeSnapshot(readForm(), new Date());
  return buildMenuBarStatus(snapshot);
};

function persist() {
  syncBreakFields();
  const settings = readForm();
  save(settings);
  render();
}

patBtn.addEventListener("click", () => {
  patIndex = (patIndex + 1) % PAT_NOTES.length;
  patLineEl.hidden = false;
  patLineEl.textContent = PAT_NOTES[patIndex];
  const snapshot = computeSnapshot(readForm(), new Date());
  if (snapshot.ok && patToastEl) {
    patToastEl.hidden = false;
    patToastEl.textContent = isMasked ? "+**** / 分钟" : `+${formatRate(snapshot.perMinute)} / 分钟`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      patToastEl.hidden = true;
    }, 1800);
  }
});

function toggleMask() {
  isMasked = !isMasked;
  if (patToastEl && !patToastEl.hidden) {
    const snapshot = computeSnapshot(readForm(), new Date());
    if (snapshot.ok) {
      patToastEl.textContent = isMasked ? "+**** / 分钟" : `+${formatRate(snapshot.perMinute)} / 分钟`;
    }
  }
  persist();
}

maskBtn.addEventListener("click", toggleMask);
window.__togglePrivacyMask = toggleMask;

function toggleTheme() {
  themeMode = effectiveTheme() === "dark" ? "light" : "dark";
  persist();
}

themeBtn.addEventListener("click", toggleTheme);
darkMedia.addEventListener("change", () => {
  if (themeMode === "auto") render();
});
window.__toggleTheme = toggleTheme;

function toggleFold() {
  isCollapsed = !isCollapsed;
  persist();
}

foldBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleFold();
});

sheetHeadEl.addEventListener("click", () => {
  toggleFold();
});

barModeBtn.addEventListener("click", () => {
  const idx = BAR_MODES.findIndex((item) => item.key === barMode);
  barMode = BAR_MODES[(idx + 1) % BAR_MODES.length].key;
  persist();
});

if (quitBtn) {
  quitBtn.addEventListener("click", () => {
    window.webkit?.messageHandlers?.statusBar?.postMessage({ action: "quit" });
  });
}

form.addEventListener("input", persist);
form.addEventListener("change", persist);

for (const button of dayButtons) {
  button.addEventListener("click", () => {
    const pressed = button.getAttribute("aria-pressed") === "true";
    const selected = dayButtons.filter((item) => item.getAttribute("aria-pressed") === "true");
    if (pressed && selected.length === 1) {
      messageEl.textContent = "至少留一个上班日。";
      return;
    }
    button.setAttribute("aria-pressed", pressed ? "false" : "true");
    persist();
  });
}

for (const input of form.querySelectorAll('input[type="number"]')) {
  input.addEventListener("wheel", () => input.blur(), { passive: true });
}

fillForm(loadSettings());
render();
setInterval(render, 250);
