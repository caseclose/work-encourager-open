import { applyLayout } from './layout.js';
import { createPomodoro, setupPomodoroUI, formatTimer, phaseNames } from './pomodoro.js';
import { computeSnapshot } from "./earn.js";
import { loadGoals, escapeHTML, orderedGoals } from "./goals.js";
import { setupGoalEditor } from "./goal-editor.js";
import { setupSettings } from "./settings.js";
import { createGoalCelebrations } from "./celebrations.js";
import { BAR_MODES, FEATURES_KEY, loadFeatures, validateFeatures, createReminders, barText, trackedGoal, remindersAllowed } from "./features.js";
import { setupFeatureUI, setupCompanion, notifySafely } from "./feature-ui.js";
let features = loadFeatures(localStorage);
let featureUI;
const pomodoro = createPomodoro({ storage:localStorage, getConfig:()=>features.pomodoro, onComplete:phase=>{
  if(features.pomodoro.notifications && remindersAllowed({...features.reminders,enabled:true},new Date())) notifySafely({title:phase==='focus'?'番茄钟：专注完成':'番茄钟：休息结束',body:phase==='focus'?'辛苦了，给自己一点休息时间。':'准备好后，手动开始下一段专注。'});
}});
const pomodoroUI = setupPomodoroUI(pomodoro,()=>features.pomodoro,collapsed=>{const next=validateFeatures({...features,pomodoro:{...features.pomodoro,collapsed}});localStorage.setItem(FEATURES_KEY,JSON.stringify(next));features=next;featureUI?.refresh();});
let lastGoalsRender = 0, lastRenderedGoals = null, lastGoalMask = null;
let celebrationTimer;
const companion = setupCompanion();
const reminders = createReminders({ storage: localStorage, onNotify: notifySafely });
let celebrations = createGoalCelebrations({ storage: localStorage, onCelebrate: celebrate });
function celebrate({ goal, mode }) {
  if (mode === 'notification') {
    if (remindersAllowed({ ...features.reminders, enabled: true }, new Date())) notifySafely({title:'一个目标点亮了',body:'今天的努力又有了一个小小的回报。'});
    return;
  }
  const toast = document.querySelector('#celebration-toast');
  toast.textContent = isMasked ? '又点亮了一个目标，给自己一点掌声！' : `${goal.emoji || '🎯'}「${goal.label}」已点亮，给自己一点掌声！`;
  toast.hidden = false;
  clearTimeout(celebrationTimer);
  celebrationTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

let goals = loadGoals(localStorage);

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
  barMode: "earned",
  masked: false,
  theme: "auto",
  showStats: true,
  showTimeline: true,
  showRewards: true,
  showBigGoals: true,
};



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
const themeBtn = document.querySelector("#theme-btn");
const themeSunEl = document.querySelector("#theme-sun");
const themeMoonEl = document.querySelector("#theme-moon");
const maskBtn = document.querySelector("#mask-btn");
const eyeOpenEl = document.querySelector("#eye-open");
const eyeOffEl = document.querySelector("#eye-off");
const quitBtn = document.querySelector("#quit-btn");
const dayButtons = [...document.querySelectorAll(".day")];

const urlParams = new URLSearchParams(window.location.search);
const isMenuBarApp = urlParams.get("menubar") === "1";
let systemTheme = urlParams.get("systemTheme");
if (isMenuBarApp) {
  document.documentElement.classList.add("is-menubar");
  if (quitBtn) quitBtn.hidden = false;
}

let patIndex = -1;
let barMode = "earned";
let isMasked = false;
let themeMode = "auto";
let toastTimer = null;
let panelPreferences = { showStats: true, showTimeline: true, showRewards: true, showBigGoals: true };
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
  barMode = BAR_MODES.includes(settings.barMode) ? settings.barMode : "earned";
  isMasked = Boolean(settings.masked);
  themeMode = ["light", "dark", "auto"].includes(settings.theme) ? settings.theme : "auto";
  for (const key of Object.keys(panelPreferences)) panelPreferences[key] = settings[key] !== false;
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
    barMode,
    masked: isMasked,
    theme: themeMode,
    ...panelPreferences,
    dateOverrides: features.dateOverrides,
  };
}

function effectiveTheme() {
  if (themeMode === "light" || themeMode === "dark") return themeMode;
  if (systemTheme === "dark" || systemTheme === "light") return systemTheme;
  return darkMedia.matches ? "dark" : "light";
}

function syncThemeUI() {
  const current = effectiveTheme();
  document.documentElement.dataset.theme = current;
  const isDark = current === "dark";
  // SVGElement.hidden is not a reflected property in WebKit; toggle the attribute.
  themeSunEl.toggleAttribute("hidden", !isDark);
  themeMoonEl.toggleAttribute("hidden", isDark);
  themeBtn.setAttribute("aria-pressed", isDark ? "true" : "false");
  themeBtn.title = isDark ? "当前深色模式，点击切换到浅色模式" : "当前浅色模式，点击切换到深色模式";
}

function syncMaskUI() {
  maskBtn.setAttribute("aria-pressed", isMasked ? "true" : "false");
  maskBtn.title = isMasked ? "显示金额" : "隐藏金额（隐私模式）";
  eyeOpenEl.toggleAttribute("hidden", isMasked);
  eyeOffEl.toggleAttribute("hidden", !isMasked);
  form.salary.type = isMasked ? "password" : "text";
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

function goalVisual(goal) {
  const pin = goal.pinned ? '<span class="goal-pin-mark" aria-label="置顶">置顶</span>' : '';
  return (goal.image ? `<img class="goal-card-visual" src="${escapeHTML(goal.image)}" alt="${escapeHTML(goal.label)}封面" />` : `<span class="goal-card-emoji" aria-hidden="true">${escapeHTML(goal.emoji || '🎯')}</span>`) + pin;
}
function renderRewards(snapshot) {
  const items = orderedGoals(goals.rewards);
  const nextItem = [...items].sort((a,b) => a.amount-b.amount).find((item) => snapshot.earned + 0.005 < item.amount);

  if (!items.length) {
    rewardsNextEl.textContent = "还没有小目标，到「设置 → 管理目标」添加。";
  } else if (nextItem) {
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
      const isNext = nextItem && nextItem === item;
      const ratio = Math.max(0, Math.min(1, snapshot.earned / item.amount));
      const li = document.createElement("li");
      li.className = `reward${done ? " is-done" : ""}${isNext ? " is-next" : ""}`;
      const costText = isMasked ? "****" : formatMoney(item.amount, item.amount % 1 ? 2 : 0);
      const subText = done
        ? `已挣够${item.unit}`
        : isNext
          ? `差 ${isMasked ? "****" : formatMoney(item.amount - snapshot.earned)}`
          : item.unit;
      li.style.setProperty("--goal-color", item.color);
      li.innerHTML = `
        ${goalVisual(item)}
        <div class="reward-top">
          <span class="reward-name">${escapeHTML(item.label)}</span>
          <span class="reward-cost">${costText}</span>
        </div>
        <p class="reward-sub">${escapeHTML(subText)}</p>
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

  if (!goals.bigGoals.length) bigGoalsSummaryEl.textContent = "还没有心愿，到「设置 → 管理目标」添加。";

  bigGoalsEl.replaceChildren(
    ...orderedGoals(goals.bigGoals).map((goal) => {
      const totalDays = goal.amount / snapshot.perDay;
      const ratio = Math.max(0, Math.min(1, accumulated / goal.amount));
      const pct = Math.round(ratio * 1000) / 10;
      const leftAmount = Math.max(0, goal.amount - accumulated);
      const leftDays = leftAmount / snapshot.perDay;
      const todayDays = snapshot.earned / snapshot.perDay;
      const costText = isMasked ? "****" : formatMoney(goal.amount, goal.amount % 1 ? 2 : 0);
      const footText =
        leftAmount <= 0.01
          ? `本月已攒够${goal.unit}（共约 ${totalDays.toFixed(1)} 个工作日）`
          : isMasked
            ? `还差 ${leftDays.toFixed(1)} 个工作日 · 今日已推进 +${(todayDays * 100 / totalDays).toFixed(1)}%`
            : `还差 ${leftDays.toFixed(1)} 天（${formatMoney(leftAmount, 0)}）· 今日 +${formatMoney(snapshot.earned, 0)}`;

      const li = document.createElement("li");
      li.className = "big-goal";
      li.style.setProperty("--goal-color", goal.color);
      li.innerHTML = `
        ${goalVisual(goal)}
        <div class="big-goal-top">
          <span class="big-goal-name">${escapeHTML(goal.label)}</span>
          <span class="big-goal-cost">${costText}</span>
        </div>
        <p class="big-goal-meta">
          <span>共需 ${totalDays.toFixed(1)} 个工作日</span>
          <span class="big-goal-pct">${pct.toFixed(1)}%</span>
        </p>
        <div class="big-goal-bar"><span style="width:${Math.min(100, pct)}%"></span></div>
        <p class="big-goal-foot">${escapeHTML(footText)}</p>
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
  applyLayout(features.moduleOrder);
  pomodoroUI.update();
  const settings = readForm();
  const now = new Date();
  const snapshot = computeSnapshot(settings, now);
  const schedule = snapshot.effectiveSettings || settings;
  companion.update(features.companion, snapshot);
  reminders.tick({snapshot,now,settings:features.reminders});
  celebrations.tick({goals,snapshot,now,mode:features.celebrationMode});

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
  messageEl.textContent = snapshot.ok || snapshot.code === "empty" ? "" : snapshot.error;

  if (!snapshot.ok) {
    headlineEl.textContent = snapshot.code === "empty" ? "点击右上角「设置」，在班表中填写月薪即可开始。" : snapshot.error;
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
  if (schedule.breakEnabled) {
    pauses.push(`午休扣掉 ${formatDuration(snapshot.breakSpan)}`);
    pauseMarks.push(`午休 ${schedule.breakStart}–${schedule.breakEnd}`);
  }
  if (schedule.dinnerEnabled) {
    pauses.push(`晚饭扣掉 ${formatDuration(snapshot.dinnerSpan)}`);
    pauseMarks.push(`晚饭 ${schedule.dinnerStart}–${schedule.dinnerEnd}`);
  }
  const breakText = pauses.length ? `，${pauses.join("，")}` : "";

  pillEl.hidden = false;
  pillEl.dataset.phase = snapshot.phase;
  pillEl.textContent = PHASE_LABEL[snapshot.phase] + (snapshot.isOverride ? " · 临时班表" : "");

  headlineEl.textContent = headlineFor(snapshot);
  nextStopEl.hidden = false;
  nextStopEl.textContent = nextStopText(schedule, snapshot);

  timelineCardEl.hidden = !settings.showTimeline;
  scaleStartEl.textContent = `${schedule.start} 上班`;
  scaleBreaksEl.textContent = pauseMarks.join(" · ");
  scaleEndEl.textContent = `${schedule.end} 下班`;
  statusEl.textContent =
    snapshot.phase === "off"
      ? "今天休息，不计工时"
      : `已计薪 ${formatDuration(snapshot.workedMinutes, "floor")} · 还剩 ${formatDuration(left, "ceil")}`;
  timelinePctEl.textContent = `${percent}%`;

  renderTimeline(snapshot, now);
  rewardsWrapEl.hidden = !settings.showRewards;
  bigGoalsWrapEl.hidden = !settings.showBigGoals;
  if (+now - lastGoalsRender >= 1000 || goals !== lastRenderedGoals || isMasked !== lastGoalMask) {
    renderRewards(snapshot);renderBigGoals(snapshot);
    lastGoalsRender=+now;lastRenderedGoals=goals;lastGoalMask=isMasked;
  }

  statsEl.hidden = !settings.showStats;
  document.querySelector("#per-minute").textContent = isMasked ? "****" : formatRate(snapshot.perMinute);
  document.querySelector("#per-hour").textContent = isMasked ? "****" : formatRate(snapshot.perHour);
  document.querySelector("#per-day").textContent = isMasked ? "****" : money.format(snapshot.perDay);
  formulaEl.textContent = isMasked
    ? `月薪 **** ÷ ${settings.workdays} 天 ÷ ${formatDuration(snapshot.dayMinutes)}${breakText} = 每分钟 ****`
    : `月薪 ÷ ${settings.workdays} 天 ÷ ${formatDuration(snapshot.dayMinutes)}${breakText} = 每分钟 ${formatRate(snapshot.perMinute)}`;
  window.dispatchEvent(new Event("encourager-preferences"));
  postMenuBarStatus(snapshot);
}

function buildMenuBarStatus(snapshot) {
  const theme = effectiveTheme();
  let mini = {title:'先设置薪资与班表',detail:'打开面板开始使用',progress:0,emoji:features.companion.enabled ? (features.companion.character === 'cat' ? '🐱' : '🌱') : '¥'};
  if (snapshot.ok) {
    mini.progress = snapshot.progress;
    mini.title = isMasked ? '¥****' : money.format(snapshot.earned);
    mini.detail = nextStopText(snapshot.effectiveSettings || readForm(),snapshot);
    if (features.miniContent === 'countdown') { mini.title = barText('countdown',snapshot,goals,isMasked);mini.detail=PHASE_LABEL[snapshot.phase]; }
    if (features.miniContent === 'goal') {
      const tracked = trackedGoal(goals,snapshot);
      mini.title = tracked ? tracked.goal.label : '暂无目标';
      mini.detail = tracked ? `${Math.min(100,Math.round(tracked.value/tracked.goal.amount*100))}% · ${tracked.value>=tracked.goal.amount?'已点亮':'继续一点点前进'}` : '到设置里添加一个目标';
      mini.progress = tracked ? Math.min(1,tracked.value/tracked.goal.amount) : 0;
      if(tracked && !features.companion.enabled)mini.emoji=tracked.goal.emoji;
    }
  }
  const timer = pomodoro.tick();
  const timerTitle = `🍅 ${phaseNames[timer.phase]} ${formatTimer(timer.remaining)}${timer.status==='paused'?' ⏸':timer.status==='done'?' ✓':''}`;
  if(features.miniContent==='pomodoro') mini={title:formatTimer(timer.remaining),detail:`${phaseNames[timer.phase]} · ${{idle:'待开始',running:'进行中',paused:'已暂停',done:'已完成'}[timer.status]}`,progress:timer.progress,emoji:'🍅'};
  return { title:barMode==='pomodoro'?timerTitle:barText(barMode,snapshot,goals,isMasked),phase:snapshot.phase || 'empty',masked:isMasked,theme,mini };
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
  featureUI?.refresh();
  reminders.reset();
  celebrations=createGoalCelebrations({storage:localStorage,onCelebrate:celebrate});
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
window.__setSystemTheme = value => {
  if (!["dark", "light"].includes(value) || systemTheme === value) return;
  systemTheme = value;
  if (themeMode === "auto") render();
};

if (quitBtn) {
  quitBtn.addEventListener("click", () => {
    window.webkit?.messageHandlers?.statusBar?.postMessage({ action: "quit" });
  });
}

form.addEventListener("submit", event => event.preventDefault());
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

const goalEditor = setupGoalEditor({
  getGoals: () => goals,
  isMasked: () => isMasked,
  onSave: saved => { goals = saved; render(); },
});

const settingsView = setupSettings({
  rememberPage: () => features.rememberPage,
  goalEditor,
  getSettings: readForm,
  updateSettings: (key, value) => {
    if (key === "theme") themeMode = value;
    else if (key === "masked") { if (isMasked !== value) toggleMask(); return; }
    else if (key === "barMode") barMode = value;
    else if (Object.hasOwn(panelPreferences, key)) panelPreferences[key] = value;
    persist();
  },
});

fillForm(loadSettings());
featureUI = setupFeatureUI({
  getFeatures:()=>features,getSettings:readForm,getGoals:()=>goals,
  setFeatures: next => {
    const checked = validateFeatures(next);
    localStorage.setItem(FEATURES_KEY,JSON.stringify(checked));
    if(JSON.stringify(features.dateOverrides)!==JSON.stringify(checked.dateOverrides))celebrations=createGoalCelebrations({storage:localStorage,onCelebrate:celebrate});
    features=checked;
    pomodoro.configure();
    if(!features.rememberPage)localStorage.removeItem('work-encourager-last-page');
    reminders.reset();render();
  },
  onImport: backup => {
    goals=backup.goals;
    if(backup.scope==='full'){features=backup.features;fillForm(backup.settings);pomodoro.configure();}
    celebrations=createGoalCelebrations({storage:localStorage,onCelebrate:celebrate});
    reminders.reset();render();
  },
});
settingsView.restore();
render();
setInterval(render, 250);
