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

export const MAX_GOAL_IMAGE_LENGTH = 180000;
export const MAX_GOALS_DATA_LENGTH = 2000000;
const DEFAULT_EMOJI = ["🍱", "🚕", "🍗", "🍕", "🎧", "🥩", "🖱️", "🍽️", "🔋", "⌚", "🎮", "🎧"];

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createGoalId() {
  return globalThis.crypto?.randomUUID?.() || `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function defaultGoals() {
  return {
    rewards: DEFAULT_REWARDS.map((item, index) => ({ ...item, id: `default-rewards-${index + 1}`, emoji: DEFAULT_EMOJI[index], color: "#ef9b63", image: "", pinned: false })),
    bigGoals: DEFAULT_BIG_GOALS.map((item, index) => ({ ...item, id: `default-bigGoals-${index + 1}`, emoji: ["📱", "💻"][index], color: "#ef9b63", image: "", pinned: false })),
  };
}

function validImageData(image) {
  if (!image) return true;
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(image);
  if (!match || match[2].length % 4 !== 0) return false;
  try {
    const header = atob(match[2].slice(0, 64));
    if (match[1] === "png") return header.startsWith("\x89PNG\r\n\x1a\n");
    if (match[1] === "jpeg") return header.startsWith("\xff\xd8\xff");
    if (match[1] === "gif") return header.startsWith("GIF87a") || header.startsWith("GIF89a");
    return header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
  } catch { return false; }
}

export function validateGoal(item, { fallbackId } = {}) {
  const label = typeof item?.label === "string" ? item.label.trim() : "";
  const unit = typeof item?.unit === "string" ? item.unit.trim() : "";
  const raw = String(item?.amount ?? "").trim();
  if (!label || label.length > 30) throw new Error("目标名称请填写 1–30 个字。");
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) <= 0 || Number(raw) > 100000000) {
    throw new Error("金额请填写 0.01–100000000 之间的数字，最多两位小数。");
  }
  if (!unit || unit.length > 10) throw new Error("单位请填写 1–10 个字，例如一杯、一台。");
  const id = item.id ?? fallbackId ?? `legacy-${stableHash(`${label}\0${raw}\0${unit}`)}`;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("目标标识无效，请重新添加这个目标。");
  const emoji = item.emoji ?? "🎯";
  if (typeof emoji !== "string" || [...emoji].length > 16 || /[\r\n]/.test(emoji)) throw new Error("图标请填写不超过 16 个字符的 Emoji。");
  const color = item.color ?? "#ef9b63";
  if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("请选择有效的目标颜色。");
  const image = item.image ?? "";
  if (typeof image !== "string" || image.length > MAX_GOAL_IMAGE_LENGTH || !validImageData(image)) {
    throw new Error("封面仅支持本地 PNG、JPEG、WebP 或 GIF 图片，压缩后需小于 180 KB。");
  }
  if (item.pinned !== undefined && typeof item.pinned !== "boolean") throw new Error("目标置顶设置无效。");
  return { id, label, amount: Number(raw), unit, emoji: emoji.trim(), color: color.toLowerCase(), image, pinned: item.pinned ?? false };
}

export function validateGoals(value) {
  const result = {};
  const usedIds = new Set();
  for (const key of ["rewards", "bigGoals"]) {
    if (!Array.isArray(value?.[key]) || value[key].length > MAX_GOALS) throw new Error(`每类最多设置 ${MAX_GOALS} 个目标。`);
    const occurrences = new Map();
    result[key] = value[key].map(item => {
      const fingerprint = stableHash(JSON.stringify([item?.label, item?.amount, item?.unit]));
      const occurrence = (occurrences.get(fingerprint) || 0) + 1;
      occurrences.set(fingerprint, occurrence);
      const goal = validateGoal(item, { fallbackId: `legacy-${key}-${fingerprint}-${occurrence}` });
      if (usedIds.has(goal.id)) throw new Error("目标标识重复，请重新添加重复的目标。");
      usedIds.add(goal.id);
      return goal;
    });
  }
  if (JSON.stringify(result).length > MAX_GOALS_DATA_LENGTH) throw new Error("目标封面总容量超过 2 MB，请移除一些图片后重试。");
  return result;
}

// Array order is user-controlled; pinning promotes items without changing that order.
export function orderedGoals(items) {
  return [...items.filter(item => item.pinned), ...items.filter(item => !item.pinned)];
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
