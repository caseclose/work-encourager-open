// Goal preferences are stored separately so salary and schedule settings stay intact.
export const GOALS_STORAGE_KEY = "work-encourager-goals-v1";
export const MAX_GOALS = 30;
export const DEFAULT_REWARDS = [
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
export const DEFAULT_BIG_GOALS = [
  { amount: 5999, label: "iPhone", unit: "一台" },
  { amount: 7999, label: "MacBook Air", unit: "一台" },
];

export function defaultGoals() {
  return { rewards: DEFAULT_REWARDS.map(item => ({ ...item })), bigGoals: DEFAULT_BIG_GOALS.map(item => ({ ...item })) };
}

export function validateGoal(item) {
  const label = typeof item?.label === "string" ? item.label.trim() : "";
  const unit = typeof item?.unit === "string" ? item.unit.trim() : "";
  const raw = String(item?.amount ?? "").trim();
  if (!label || label.length > 30) throw new Error("目标名称请填写 1–30 个字。");
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) <= 0 || Number(raw) > 100000000) {
    throw new Error("金额请填写 0.01–100000000 之间的数字，最多两位小数。");
  }
  if (!unit || unit.length > 10) throw new Error("单位请填写 1–10 个字，例如一杯、一台。");
  return { label, amount: Number(raw), unit };
}

export function validateGoals(value) {
  const result = {};
  for (const key of ["rewards", "bigGoals"]) {
    if (!Array.isArray(value?.[key]) || value[key].length > MAX_GOALS) throw new Error(`每类最多设置 ${MAX_GOALS} 个目标。`);
    result[key] = value[key].map(validateGoal);
  }
  return result;
}

export function loadGoals(storage) {
  try {
    const raw = storage.getItem(GOALS_STORAGE_KEY);
    return raw === null ? defaultGoals() : validateGoals(JSON.parse(raw));
  } catch {
    return defaultGoals();
  }
}

export function saveGoals(storage, goals) {
  const validated = validateGoals(goals);
  storage.setItem(GOALS_STORAGE_KEY, JSON.stringify(validated));
  return validated;
}

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
