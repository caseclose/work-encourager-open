import { defaultGoals, validateGoal, saveGoals, MAX_GOALS } from "./goals.js";

export function setupGoalEditor({ getGoals, onSave, isMasked }) {
  const dialog = document.querySelector("#goal-settings");
  const form = document.querySelector("#goal-settings-form");
  const rows = document.querySelector("#goal-editor-rows");
  const message = document.querySelector("#goal-settings-message");
  const add = document.querySelector("#goal-add");
  const tabs = [...document.querySelectorAll("[data-goal-tab]")];
  let draft;
  let category = "rewards";

  function renderRows(focusIndex) {
    message.textContent = "";
    rows.replaceChildren();
    tabs.forEach(tab => tab.setAttribute("aria-pressed", String(tab.dataset.goalTab === category)));
    document.querySelector("#goal-category-help").textContent = category === "rewards"
      ? "按今天的收入计算；展示时按金额从小到大排列。"
      : "按本月累算收入计算，显示还需多少个工作日。";
    draft[category].forEach((goal, index) => {
      const row = document.createElement("div");
      row.className = "goal-editor-row";
      for (const [field, title, placeholder] of [["label", "名称", "例如：周末咖啡"], ["amount", "金额（元）", "0.01"], ["unit", "单位", "例如：一杯"]]) {
        const label = document.createElement("label");
        label.textContent = title;
        const input = document.createElement("input");
        input.type = field === "amount" && isMasked() ? "password" : "text";
        input.value = String(goal[field]);
        input.placeholder = placeholder;
        input.setAttribute("aria-label", `第 ${index + 1} 个目标${title}`);
        input.autocomplete = "off";
        input.maxLength = field === "label" ? 30 : field === "unit" ? 10 : 12;
        if (field === "amount") input.inputMode = "decimal";
        input.addEventListener("input", () => { draft[category][index][field] = input.value; message.textContent = ""; });
        label.append(input);
        row.append(label);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "goal-remove";
      remove.textContent = "删除";
      remove.setAttribute("aria-label", `删除第 ${index + 1} 个目标`);
      remove.addEventListener("click", () => {
        draft[category].splice(index, 1);
        renderRows();
        (rows.children[Math.min(index, rows.children.length - 1)]?.querySelector("button") || add).focus();
      });
      row.append(remove);
      rows.append(row);
    });
    if (!draft[category].length) {
      const empty = document.createElement("p");
      empty.className = "goal-empty";
      empty.textContent = "还没有目标，点「新增目标」添加一个。";
      rows.append(empty);
    }
    add.disabled = draft[category].length >= MAX_GOALS;
    if (focusIndex !== undefined) rows.children[focusIndex]?.querySelector("input")?.focus();
  }

  function open() {
    draft = structuredClone(getGoals());
    category = "rewards";
    renderRows();
    dialog.hidden = false;
  }
  tabs.forEach(tab => tab.addEventListener("click", () => {
    category = tab.dataset.goalTab;
    renderRows();
  }));
  add.addEventListener("click", () => {
    if (draft[category].length >= MAX_GOALS) return;
    draft[category].push({ label: "", amount: "", unit: "一个" });
    renderRows(draft[category].length - 1);
  });
  document.querySelector("#goal-reset").addEventListener("click", () => {
    draft[category] = defaultGoals()[category];
    renderRows();
    message.textContent = "已恢复这一类的默认目标，点击保存后生效。";
  });
  function close() {
    dialog.hidden = true;
    document.dispatchEvent(new Event("encourager-goals-close"));
  }
  document.querySelector("#goal-cancel").addEventListener("click", () => close());
  form.addEventListener("submit", event => {
    event.preventDefault();
    for (const key of ["rewards", "bigGoals"]) {
      for (let index = 0; index < draft[key].length; index++) {
        try { validateGoal(draft[key][index]); }
        catch (error) {
          category = key;
          renderRows(index);
          message.textContent = `第 ${index + 1} 个目标：${error.message}`;
          return;
        }
      }
    }
    try {
      const saved = saveGoals(localStorage, draft);
      onSave(saved);
      close();
      document.querySelector("#goal-save-status").textContent = "目标已保存";
    } catch {
      message.textContent = "保存失败，本机存储可能不可用。请重试，修改内容仍保留在这里。";
    }
  });
  return { open, close };
}
