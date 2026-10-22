export const CELEBRATIONS_STORAGE_KEY = "work-encourager-celebrations-v1";
const MAX_ACHIEVEMENTS = 4000;
const STORED_KEY = /^(?:rewards:\d{4}-\d{2}-\d{2}|bigGoals:\d{4}-\d{2}):[a-zA-Z0-9_-]{1,100}$/;

function localPeriods(date) {
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return { rewards: `${month}-${String(date.getDate()).padStart(2, "0")}`, bigGoals: month };
}

/**
 * tick accepts computeSnapshot's {ok, earned, monthEarned} and a local Date.
 * First observations, new periods and edited/new goals establish a quiet baseline.
 * A callback receives {goal, category, key, mode}; its renderer owns animations/notifications.
 * Silent mode still records achievements so changing modes never replays old successes.
 */
export function createGoalCelebrations({ storage, onCelebrate = () => {} } = {}) {
  let achieved = new Set();
  try {
    const raw = storage?.getItem(CELEBRATIONS_STORAGE_KEY);
    // A corrupt or oversized record must not block the earnings panel.
    if (raw && raw.length < 1000000) {
      const data = JSON.parse(raw);
      if (data.version === 1 && Array.isArray(data.achieved)) {
        achieved = new Set(data.achieved.filter(key => typeof key === "string" && STORED_KEY.test(key)).slice(-MAX_ACHIEVEMENTS));
      }
    }
  } catch { /* The in-memory ledger still deduplicates when local storage is unavailable. */ }
  let previous = { rewards: new Map(), bigGoals: new Map() };
  let periods = {};

  function persist() {
    if (achieved.size > MAX_ACHIEVEMENTS) achieved = new Set([...achieved].slice(-MAX_ACHIEVEMENTS));
    try { storage?.setItem(CELEBRATIONS_STORAGE_KEY, JSON.stringify({ version: 1, achieved: [...achieved] })); }
    catch { /* Continue with session-level deduplication if storage is full or disabled. */ }
  }

  function tick({ goals, snapshot, now = new Date(), mode = "animation" } = {}) {
    if (!snapshot?.ok || !(now instanceof Date) || !Number.isFinite(now.getTime())) return [];
    const nextPeriods = localPeriods(now);
    const events = [];
    let changed = false;
    for (const category of ["rewards", "bigGoals"]) {
      const value = category === "rewards" ? snapshot.earned : snapshot.monthEarned;
      if (!Number.isFinite(value) || !Array.isArray(goals?.[category])) continue;
      const samePeriod = periods[category] === nextPeriods[category];
      const next = new Map();
      for (const goal of goals[category]) {
        if (!goal.id || !Number.isFinite(goal.amount) || goal.amount <= 0) continue;
        const key = `${category}:${nextPeriods[category]}:${goal.id}`;
        const complete = value + 0.005 >= goal.amount;
        const before = samePeriod ? previous[category].get(goal.id) : undefined;
        next.set(goal.id, { complete, amount: goal.amount });
        if (!complete || achieved.has(key)) continue;
        achieved.add(key);
        changed = true;
        // Do not celebrate opening the app late in a day, importing goals or editing a price.
        if (!before || before.complete || before.amount !== goal.amount) continue;
        if (mode === "animation" || mode === "notification") events.push({ goal: { ...goal }, category, key, mode });
      }
      previous[category] = next;
      periods[category] = nextPeriods[category];
    }
    // Commit before invoking effects, including callbacks that throw or reopen the app.
    if (changed) persist();
    for (const event of events) {
      try { onCelebrate(event); } catch { /* Presentation failures must not interrupt income updates. */ }
    }
    return events;
  }
  return { tick };
}
