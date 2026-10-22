import { defaultGoals, createGoalId, validateGoal, validateGoals, saveGoals, MAX_GOALS, MAX_GOAL_IMAGE_LENGTH } from "./goals.js";

// Keep covers small enough for local storage and offline backups. Images never leave the device.
async function readCover(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("请选择 PNG、JPEG、WebP 或 GIF 图片。");
  if (file.size > 10 * 1024 * 1024) throw new Error("原始图片请小于 10 MB。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("无法读取这张图片，请换一张重试。"));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error("图片尺寸过大或无效，请换一张较小的图片。");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前环境无法处理图片，请稍后重试。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 256, 256);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    const result = canvas.toDataURL("image/jpeg", 0.82);
    if (result.length > MAX_GOAL_IMAGE_LENGTH) throw new Error("压缩后的图片仍然过大，请换一张简单的图片。");
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function setupGoalEditor({ getGoals, onSave, isMasked }) {
  const dialog = document.querySelector("#goal-settings");
  const form = document.querySelector("#goal-settings-form");
  const rows = document.querySelector("#goal-editor-rows");
  const message = document.querySelector("#goal-settings-message");
  const add = document.querySelector("#goal-add");
  const save = form.querySelector('[type="submit"]');
  const tabs = [...document.querySelectorAll("[data-goal-tab]")];
  let draft;
  let category = "rewards";
  let generation = 0;
  let pendingImages = 0;
  let draggedId = null;

  function button(label, className, action, accessibleLabel = label) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.textContent = label;
    element.setAttribute("aria-label", accessibleLabel);
    element.addEventListener("click", action);
    return element;
  }

  function moveGoal(from, to) {
    if (to < 0 || to >= draft[category].length || from === to) return;
    const [goal] = draft[category].splice(from, 1);
    draft[category].splice(to, 0, goal);
    renderRows();
    rows.children[to]?.querySelector(".goal-drag-handle")?.focus();
    message.textContent = `已将「${goal.label || "新目标"}」移到第 ${to + 1} 位，保存后生效。`;
  }

  function renderRows(focusIndex) {
    message.textContent = "";
    rows.replaceChildren();
    tabs.forEach(tab => tab.setAttribute("aria-pressed", String(tab.dataset.goalTab === category)));
    document.querySelector("#goal-category-help").textContent = category === "rewards"
      ? "按今天的收入计算。拖动手柄或用上下按钮排序；置顶目标优先展示。"
      : "按本月累算收入计算。拖动手柄或用上下按钮排序；置顶目标优先展示。";
    draft[category].forEach((goal, index) => {
      const row = document.createElement("div");
      row.className = "goal-editor-row";
      row.dataset.goalId = goal.id;
      const controls = document.createElement("div");
      controls.className = "goal-row-controls";
      const handle = button("⠿", "goal-drag-handle", () => {}, `拖动第 ${index + 1} 个目标排序，也可使用上移和下移按钮`);
      handle.draggable = true;
      handle.title = "拖动排序";
      handle.addEventListener("dragstart", event => {
        draggedId = goal.id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", goal.id);
        row.classList.add("is-dragging");
      });
      handle.addEventListener("dragend", () => {
        draggedId = null;
        rows.querySelectorAll(".is-dragging, .is-drop-target").forEach(element => element.classList.remove("is-dragging", "is-drop-target"));
      });
      row.addEventListener("dragover", event => {
        if (!draggedId || draggedId === goal.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        row.classList.add("is-drop-target");
      });
      row.addEventListener("dragleave", event => {
        if (!row.contains(event.relatedTarget)) row.classList.remove("is-drop-target");
      });
      row.addEventListener("drop", event => {
        if (!draggedId) return;
        event.preventDefault();
        const from = draft[category].findIndex(item => item.id === draggedId);
        draggedId = null;
        if (from >= 0) moveGoal(from, index);
      });
      const number = document.createElement("span");
      number.className = "goal-row-number";
      number.textContent = `目标 ${index + 1}`;
      const up = button("↑", "goal-order-button", () => moveGoal(index, index - 1), `上移第 ${index + 1} 个目标`);
      const down = button("↓", "goal-order-button", () => moveGoal(index, index + 1), `下移第 ${index + 1} 个目标`);
      up.disabled = index === 0;
      down.disabled = index === draft[category].length - 1;
      const pinLabel = document.createElement("label");
      pinLabel.className = "goal-pin-control";
      const pin = document.createElement("input");
      pin.type = "checkbox";
      pin.checked = Boolean(goal.pinned);
      pin.setAttribute("aria-label", `置顶第 ${index + 1} 个目标`);
      pin.addEventListener("change", () => { goal.pinned = pin.checked; });
      pinLabel.append(pin, "置顶");
      const remove = button("删除", "goal-remove", () => {
        draft[category].splice(index, 1);
        renderRows();
        (rows.children[Math.min(index, rows.children.length - 1)]?.querySelector("button") || add).focus();
      }, `删除第 ${index + 1} 个目标`);
      controls.append(handle, number, up, down, pinLabel, remove);
      row.append(controls);
      const fields = document.createElement("div");
      fields.className = "goal-basic-fields";
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
        input.addEventListener("input", () => { goal[field] = input.value; message.textContent = ""; });
        label.append(input);
        fields.append(label);
      }
      row.append(fields);
      const appearance = document.createElement("details");
      appearance.className = "goal-appearance";
      const summary = document.createElement("summary");
      summary.textContent = `${goal.emoji || "🎯"} 图标、颜色与封面${goal.image ? " · 已设置封面" : ""}`;
      const appearanceFields = document.createElement("div");
      appearanceFields.className = "goal-appearance-fields";
      const emojiLabel = document.createElement("label");
      emojiLabel.textContent = "Emoji";
      const emoji = document.createElement("input");
      emoji.type = "text";
      emoji.value = goal.emoji || "";
      emoji.maxLength = 32;
      emoji.setAttribute("aria-label", `第 ${index + 1} 个目标 Emoji`);
      emoji.addEventListener("input", () => {
        goal.emoji = emoji.value;
        summary.textContent = `${goal.emoji || "🎯"} 图标、颜色与封面${goal.image ? " · 已设置封面" : ""}`;
      });
      emojiLabel.append(emoji);
      const colorLabel = document.createElement("label");
      colorLabel.textContent = "颜色";
      const color = document.createElement("input");
      color.type = "color";
      color.value = goal.color || "#ef9b63";
      color.setAttribute("aria-label", `第 ${index + 1} 个目标颜色`);
      color.addEventListener("input", () => { goal.color = color.value; });
      colorLabel.append(color);
      const cover = document.createElement("div");
      cover.className = "goal-cover-control";
      const preview = document.createElement("img");
      preview.className = "goal-cover-preview";
      preview.alt = "目标封面预览";
      if (goal.image) preview.src = goal.image;
      preview.hidden = !goal.image;
      const uploadLabel = document.createElement("label");
      uploadLabel.className = "goal-cover-upload";
      uploadLabel.textContent = "上传封面";
      const upload = document.createElement("input");
      upload.type = "file";
      upload.accept = "image/png,image/jpeg,image/webp,image/gif";
      upload.setAttribute("aria-label", `上传第 ${index + 1} 个目标封面`);
      const removeImage = button("移除封面", "goal-button goal-cover-remove", () => {
        goal.image = "";
        preview.removeAttribute("src");
        preview.hidden = true;
        removeImage.hidden = true;
        summary.textContent = `${goal.emoji || "🎯"} 图标、颜色与封面`;
        upload.value = "";
      });
      removeImage.hidden = !goal.image;
      upload.addEventListener("change", async () => {
        const file = upload.files?.[0];
        if (!file) return;
        const currentGeneration = generation;
        pendingImages++;
        if (save) save.disabled = true;
        upload.disabled = true;
        message.textContent = "正在压缩封面…";
        try {
          const image = await readCover(file);
          if (generation !== currentGeneration) return;
          goal.image = image;
          preview.src = image;
          preview.hidden = false;
          removeImage.hidden = false;
          summary.textContent = `${goal.emoji || "🎯"} 图标、颜色与封面 · 已设置封面`;
          message.textContent = "封面已加入草稿，点击保存后生效。";
        } catch (error) {
          if (generation === currentGeneration) message.textContent = error.message;
        } finally {
          if (generation === currentGeneration) {
            pendingImages--;
            if (save) save.disabled = pendingImages > 0;
            upload.disabled = false;
          }
          upload.value = "";
        }
      });
      uploadLabel.append(upload);
      cover.append(preview, uploadLabel, removeImage);
      appearanceFields.append(emojiLabel, colorLabel, cover);
      const hint = document.createElement("p");
      hint.className = "goal-cover-hint";
      hint.textContent = "图片仅保存在本机，会裁成正方形并压缩；支持 PNG、JPEG、WebP、GIF（保存静态封面）。";
      appearance.append(summary, appearanceFields, hint);
      row.append(appearance);
      rows.append(row);
    });
    if (!draft[category].length) {
      const empty = document.createElement("p");
      empty.className = "goal-empty";
      empty.textContent = "还没有目标，点「新增目标」添加一个。";
      rows.append(empty);
    }
    add.disabled = draft[category].length >= MAX_GOALS;
    if (focusIndex !== undefined) rows.children[focusIndex]?.querySelector('input[aria-label$="目标名称"]')?.focus();
  }

  function open() {
    generation++;
    pendingImages = 0;
    if (save) save.disabled = false;
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
    draft[category].push({ id: createGoalId(), label: "", amount: "", unit: "一个", emoji: "🎯", color: "#ef9b63", image: "", pinned: false });
    renderRows(draft[category].length - 1);
  });
  document.querySelector("#goal-reset").addEventListener("click", () => {
    draft[category] = defaultGoals()[category];
    renderRows();
    message.textContent = "已恢复这一类的默认目标，点击保存后生效。";
  });
  function close() {
    generation++;
    pendingImages = 0;
    if (save) save.disabled = false;
    dialog.hidden = true;
    document.dispatchEvent(new Event("encourager-goals-close"));
  }
  document.querySelector("#goal-cancel").addEventListener("click", () => close());
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (pendingImages) { message.textContent = "请等待封面处理完成后保存。"; return; }
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
    try { validateGoals(draft); }
    catch (error) { message.textContent = error.message; return; }
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
