import { setupCalendar } from './calendar.js';
import { createBackup, parseBackup, applyBackup } from './features.js';

export const hasNative = () => Boolean(window.webkit?.messageHandlers?.statusBar);
export function nativeAction(action, extra = {}) { window.webkit?.messageHandlers?.statusBar?.postMessage({ action, ...extra }); }

export function setupFeatureUI({ getFeatures, setFeatures, getSettings, getGoals, onImport }) {
  const root = document.querySelector('#extended-settings');
  const row = (title, help, control) => `<div class="settings-row settings-row-wrap"><div><strong>${title}</strong><p>${help}</p></div>${control}</div>`;
  const toggle = (id, label) => `<input id="${id}" aria-label="${label}" type="checkbox" role="switch" class="settings-switch" />`;
  const select = (id, label, values) => `<select id="${id}" aria-label="${label}">${values.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
  const section = (title, body) => `<section class="settings-section"><h3>${title}</h3><div class="settings-group">${body}</div></section>`;
  root.innerHTML = section('日历与临时班表', '<details class="feature-details"><summary>调休、补班与提前下班 <span>⌄</span></summary><div id="calendar-settings"></div></details>')
    + section('目标达成', row('庆祝方式','只在新目标达成时提醒一次',select('celebration-mode','庆祝方式',[['animation','轻量动画'],['notification','系统通知'],['silent','静默']])) + '<p class="feature-note">通知只显示目标已达成，不包含薪资和金额。</p>')
    + section('番茄钟', row('显示番茄钟','在主面板开始专注、暂停、休息',toggle('pomodoro-visible','显示番茄钟'))
      + row('专注时长','1–180 分钟', '<input id="pomodoro-focus" type="number" min="1" max="180" aria-label="专注时长（分钟）" />')
      + row('短休息','1–60 分钟', '<input id="pomodoro-short" type="number" min="1" max="60" aria-label="短休息（分钟）" />')
      + row('长休息','1–120 分钟', '<input id="pomodoro-long" type="number" min="1" max="120" aria-label="长休息（分钟）" />')
      + row('长休息间隔','完成多少个番茄后进入长休息（1–12）', '<input id="pomodoro-round-count" type="number" min="1" max="12" aria-label="长休息间隔" />')
      + row('阶段结束通知','遵循提醒中心的允许时间和免打扰时间',toggle('pomodoro-notifications','番茄钟阶段结束通知'))
      + '<p class="feature-note">更改时长从下一段计时生效；已开始的阶段保持原时长。完成后手动开始下一段，跳过不计入完成数。计时会保存到本机，完整备份包含偏好，不包含正在进行的计时。通知需应用运行，睡眠期间不唤醒电脑。</p>')
    + section('提醒中心', row('启用系统提醒','首次开启时请求通知权限',toggle('reminder-enabled','启用系统提醒'))
      + row('午休与晚饭','进入休息时段时提醒',toggle('reminder-break','午休与晚饭提醒'))
      + row('下班提醒','到点收工，给生活留点时间',toggle('reminder-end','下班提醒'))
      + row('活动休息','按已计薪时长提醒喝水、活动',toggle('reminder-rest','活动休息提醒'))
      + row('活动间隔','仅在计薪过程中提醒',select('reminder-interval','活动间隔',[[30,'30 分钟'],[45,'45 分钟'],[60,'60 分钟'],[90,'90 分钟'],[120,'120 分钟']]))
      + row('允许提醒时间','仅在这个时段发送通知', '<div class="time-pair"><input id="active-start" type="time" aria-label="允许提醒开始" /><span>至</span><input id="active-end" type="time" aria-label="允许提醒结束" /></div>')
      + row('免打扰时间','跨午夜有效；起止相同表示关闭', '<div class="time-pair"><input id="quiet-start" type="time" aria-label="免打扰开始" /><span>至</span><input id="quiet-end" type="time" aria-label="免打扰结束" /></div>')
      + '<p id="notification-state" class="feature-note" role="status"></p>')
    + section('迷你悬浮窗', row('显示悬浮窗','可拖动；点击“打开面板”返回主界面',toggle('mini-enabled','显示悬浮窗'))
      + row('始终置顶','让小窗显示在其他窗口上方',toggle('mini-pinned','悬浮窗始终置顶'))
      + row('显示内容','目标优先显示置顶的一项',select('mini-content','悬浮窗显示内容',[['income','今日收入'],['countdown','下班倒计时'],['goal','目标进度'],['pomodoro','番茄钟']]))
      + row('不透明度','调整悬浮窗的可见程度','<div class="opacity-control"><input id="mini-opacity" type="range" min="0.35" max="1" step="0.05" aria-label="悬浮窗不透明度" /><output id="mini-opacity-value">100%</output></div>'))
    + section('陪伴伙伴', row('显示伙伴','随工作、休息与下班切换状态',toggle('companion-enabled','显示伙伴'))
      + row('伙伴形象','点击伙伴，也能给自己一句鼓励',select('companion-character','伙伴形象',[['cat','橘猫'],['sprout','小芽']])) )
    + section('启动与操作', row('开机自动启动','登录 macOS 后启动上班鼓励器',toggle('launch-at-login','开机自动启动'))
      + row('全局快捷键','随时打开或关闭主面板',select('global-hotkey','全局快捷键',[['none','未设置'],['cmdShiftE','⌘ ⇧ E'],['ctrlAltE','⌃ ⌥ E']]))
      + row('记住上次页面','重新启动后回到主面板或设置页',toggle('remember-page','记住上次页面'))
      + '<p id="native-state" class="feature-note" role="status"></p>')
    + section('备份与恢复', '<div class="settings-row"><div><strong>导出到本机</strong><p>完整备份含薪资；目标备份仅含目标与封面。</p><div class="feature-buttons"><button id="export-full" type="button">完整备份</button><button id="export-goals" type="button">仅导出目标</button></div></div></div>'
      + '<div class="settings-row"><div><strong>导入备份</strong><p>先检查文件，再确认替换。不会更改系统权限或开机启动设置。</p><div class="feature-buttons"><button id="import-backup" type="button">选择备份文件</button><input id="backup-file" type="file" accept=".json,application/json" hidden /></div><div id="import-preview" hidden><p id="import-description"></p><div class="feature-buttons"><button id="import-confirm" type="button">确认替换</button><button id="import-cancel" type="button">取消</button></div></div><p id="backup-state" role="status"></p></div></div>')
    + section('更新与版本', row('上班鼓励器 1.4.0','查看 GitHub 最新正式版本','<button id="check-updates" type="button">检查更新</button>') + '<p id="update-state" class="feature-note" role="status"></p><div class="feature-buttons" id="release-link-wrap" hidden><button id="open-release" type="button">打开版本发布页</button></div>');
  const el = id => document.getElementById(id);
  let nativeState = { miniEnabled:false,miniPinned:true,miniOpacity:1,hotkey:'none',launchAtLogin:false,notifications:'notDetermined' };
  let pendingImport = null, pendingPermission = null, releaseURL = null;
  const update = (change, propagate = false) => { const next = structuredClone(getFeatures()); change(next); try { setFeatures(next); sync(); return true; } catch (e) { sync(); el('native-state').textContent = e.message; if(propagate)throw e; return false; } };
  const bind = (id, fn) => el(id).addEventListener('change', e => fn(e.target));
  const calendar = setupCalendar({ container: el('calendar-settings'), getSettings: () => ({...getSettings(),dateOverrides:getFeatures().dateOverrides}), onChange: dateOverrides => update(f => { f.dateOverrides = dateOverrides; }, true) });
  function permissionDone(granted) {
    const purpose = pendingPermission; pendingPermission = null;
    if(!purpose)return;
    if (granted) {
      update(f => { if (purpose === 'celebration') f.celebrationMode = 'notification'; else if (purpose === 'pomodoro') f.pomodoro.notifications = true; else if (purpose === 'reminders') f.reminders.enabled = true; });
      el('notification-state').textContent = '已允许通知。应用运行期间按设置提醒。';
    } else { sync(); el('notification-state').textContent = '尚未允许通知，请在系统设置的“通知”中开启上班鼓励器。'; }
  }
  async function requestPermission(purpose) {
    if(pendingPermission)return;
    pendingPermission = purpose;sync();
    if (hasNative()) { nativeAction('requestNotifications'); return; }
    try { permissionDone('Notification' in window && await Notification.requestPermission() === 'granted'); }
    catch { permissionDone(false); }
  }
  bind('pomodoro-visible', e=>update(f=>{f.pomodoro.visible=e.checked;}));
  bind('pomodoro-notifications', e=>e.checked?requestPermission('pomodoro'):update(f=>{f.pomodoro.notifications=false;}));
  for(const [id,key] of [['focus','focus'],['short','short'],['long','long'],['round-count','rounds']]) bind(`pomodoro-${id}`,e=>update(f=>{f.pomodoro[key]=Number(e.value);}));
  bind('celebration-mode', e => e.value === 'notification' ? requestPermission('celebration') : update(f => { f.celebrationMode = e.value; }));
  bind('reminder-enabled', e => e.checked ? requestPermission('reminders') : update(f => { f.reminders.enabled = false; }));
  for (const key of ['break','end','rest']) bind(`reminder-${key}`, e => update(f => { f.reminders[key] = e.checked; }));
  bind('reminder-interval', e => update(f => { f.reminders.restInterval = Number(e.value); }));
  for (const [id,key] of [['active-start','activeStart'],['active-end','activeEnd'],['quiet-start','quietStart'],['quiet-end','quietEnd']]) bind(id,e => update(f => { f.reminders[key] = e.value; }));
  bind('companion-enabled', e => update(f => { f.companion.enabled = e.checked; }));
  bind('companion-character', e => update(f => { f.companion.character = e.value; }));
  bind('remember-page', e => update(f => { f.rememberPage = e.checked; }));
  bind('mini-content', e => update(f => { f.miniContent = e.value; }));
  for (const id of ['mini-enabled','mini-pinned','mini-opacity']) bind(id, () => {
    el('mini-opacity-value').textContent = `${Math.round(Number(el('mini-opacity').value)*100)}%`;
    nativeAction('setMiniWindow',{enabled:el('mini-enabled').checked,pinned:el('mini-pinned').checked,opacity:Number(el('mini-opacity').value)});
  });
  bind('launch-at-login',e => nativeAction('setLaunchAtLogin',{enabled:e.checked}));
  bind('global-hotkey',e => nativeAction('setHotkey',{value:e.value}));
  function exportFile(scope) {
    try {
      const text = createBackup({goals:getGoals(),settings:getSettings(),features:getFeatures()},scope);
      const filename = `work-encourager-${scope}-${new Date().toISOString().slice(0,10)}.json`;
      if (hasNative()) nativeAction('exportBackup',{text,filename});
      else { const url = URL.createObjectURL(new Blob([text],{type:'application/json'})); const a = document.createElement('a'); a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);el('backup-state').textContent='备份已交给浏览器下载。'; }
    } catch(e) { el('backup-state').textContent=e.message; }
  }
  el('export-full').onclick=()=>exportFile('full');el('export-goals').onclick=()=>exportFile('goals');
  el('import-backup').onclick=()=>{pendingImport=null;el('import-preview').hidden=true;el('backup-state').textContent='';if(hasNative())nativeAction('importBackup');else el('backup-file').click();};
  function previewImport(text) {
    try {
      pendingImport=parseBackup(text);
      el('import-description').textContent=`将替换 ${pendingImport.goals.rewards.length} 个小目标和 ${pendingImport.goals.bigGoals.length} 个心愿${pendingImport.scope==='full'?'，以及薪资、班表和应用偏好':''}。当前数据将被覆盖，建议先导出备份。`;
      el('import-preview').hidden=false;el('backup-state').textContent='文件检查通过，等待确认。';el('import-confirm').focus();
    } catch(e) { pendingImport=null;el('import-preview').hidden=true;el('backup-state').textContent=e.message; }
  }
  el('backup-file').onchange=async e=>{pendingImport=null;el('import-preview').hidden=true;const file=e.target.files[0];if(file){if(file.size>4000000)el('backup-state').textContent='备份文件过大，最多支持 4 MB。';else previewImport(await file.text());}e.target.value='';};
  el('import-cancel').onclick=()=>{pendingImport=null;el('import-preview').hidden=true;el('backup-state').textContent='已取消导入。';};
  el('import-confirm').onclick=()=>{
    if(!pendingImport)return;
    try { applyBackup(localStorage,pendingImport);onImport(pendingImport);pendingImport=null;el('import-preview').hidden=true;el('backup-state').textContent='已恢复备份。';calendar.refresh();sync(); }
    catch(e){el('backup-state').textContent=e.message;}
  };
  el('check-updates').onclick=()=>{
    if(hasNative()){el('check-updates').disabled=true;el('update-state').textContent='正在检查 GitHub 正式版本…';nativeAction('checkUpdates');}
    else window.open('https://github.com/caseclose/work-encourager-open/releases','_blank','noopener');
  };
  el('open-release').onclick=()=>{if(releaseURL)nativeAction('openRelease',{url:releaseURL});};
  window.__nativeEvent=payload=>{
    if(payload.type==='state'){ nativeState={...nativeState,...payload};sync(); }
    if(payload.type==='importBackup')previewImport(payload.text);
    if(payload.type==='result'){
      if(payload.action==='requestNotifications')permissionDone(Boolean(payload.ok));
      const target = ['exportBackup','importBackup'].includes(payload.action)?'backup-state':payload.action==='checkUpdates'?'update-state':'native-state';
      el(target).textContent=payload.message || (payload.ok?'已更新。':'操作未完成。');
      if(payload.action==='checkUpdates'){
        el('check-updates').disabled=false;
        releaseURL=payload.url || payload.releaseURL || null;
        el('release-link-wrap').hidden=!releaseURL;
      }
      if(!payload.ok)nativeAction('nativeState');
    }
  };
  function sync() {
    const f=getFeatures();
    el('pomodoro-visible').checked=f.pomodoro.visible;
    el('pomodoro-notifications').checked=f.pomodoro.notifications;
    el('pomodoro-notifications').disabled=Boolean(pendingPermission);
    for(const [id,key] of [['focus','focus'],['short','short'],['long','long'],['round-count','rounds']])el(`pomodoro-${id}`).value=f.pomodoro[key];
    el('celebration-mode').value=f.celebrationMode;
    el('celebration-mode').disabled=Boolean(pendingPermission);el('reminder-enabled').disabled=Boolean(pendingPermission);
    el('reminder-enabled').checked=f.reminders.enabled;
    for(const k of ['break','end','rest'])el(`reminder-${k}`).checked=f.reminders[k];
    el('reminder-interval').value=f.reminders.restInterval;
    for(const [id,key] of [['active-start','activeStart'],['active-end','activeEnd'],['quiet-start','quietStart'],['quiet-end','quietEnd']])el(id).value=f.reminders[key];
    el('companion-enabled').checked=f.companion.enabled;el('companion-character').value=f.companion.character;
    el('remember-page').checked=f.rememberPage;el('mini-content').value=f.miniContent;
    el('mini-enabled').checked=nativeState.miniEnabled;el('mini-pinned').checked=nativeState.miniPinned;
    el('mini-opacity').value=nativeState.miniOpacity;el('mini-opacity-value').textContent=`${Math.round(nativeState.miniOpacity*100)}%`;
    el('launch-at-login').checked=nativeState.launchAtLogin;el('global-hotkey').value=nativeState.hotkey;
    if(!hasNative()) {
      for(const id of ['mini-enabled','mini-pinned','mini-opacity','launch-at-login','global-hotkey'])el(id).disabled=true;
      el('native-state').textContent='悬浮窗、开机启动与全局快捷键在 macOS 应用中可用。';
    } else {
      const names={authorized:'已允许',provisional:'已允许',denied:'已关闭',notDetermined:'尚未授权'};
      el('notification-state').textContent=`系统通知：${names[nativeState.notifications] || nativeState.notifications}。应用运行期间生效，免打扰时不补发。`;
    }
  }
  sync();nativeAction('nativeState');
  return {refresh(){sync();calendar.refresh();}};
}

export function notifySafely({ title, body }) {
  if(hasNative())nativeAction('notify',{title,body});
  else if('Notification' in window && Notification.permission==='granted')new Notification(title,{body});
}

export function setupCompanion() {
  const button=document.querySelector('#companion');
  const cat='<path d="M20 37 17 15 35 26Q48 20 61 26L79 15 76 38Q89 65 65 77H31Q8 65 20 37" fill="#efa65d"/><path d="M22 23 31 29 23 35M73 23 65 29 74 35" fill="#e77768"/><g class="pet-eyes" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M33 46v4M62 46v4"/></g><path d="m43 56 5 4 5-4M48 60v5m0 0-6 3m6-3 6 3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M26 77q-8 16 6 17h34q14-1 6-17" fill="#efa65d"/>';
  const sprout='<path d="M48 77V34" stroke="#68a971" stroke-width="6" fill="none"/><path d="M47 52Q10 54 16 24q32-2 31 28M49 43Q77 46 82 15 48 13 49 43" fill="#85bb79"/><path d="m27 65 5 29h33l6-29" fill="#d89060"/><g class="pet-eyes" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M41 77v2M57 77v2"/></g><path d="M44 85q5 4 10 0" fill="none" stroke="currentColor" stroke-width="2"/>';
  let character='';
  button.addEventListener('click',()=>document.querySelector('#pat').click());
  return {update(preferences,snapshot){
    button.hidden=!preferences.enabled;
    if(character!==preferences.character){character=preferences.character;button.querySelector('svg').innerHTML=character==='cat'?cat:sprout;}
    button.dataset.phase=snapshot.ok?snapshot.phase:'before';
    const text=({before:'慢慢来，准备好再出发',working:'陪你把这一点点做好',break:'吃饱休息，才有力气',dinner:'好好吃饭，别急',after:'今天辛苦了，收工啦',off:'休息也是生活的一部分'})[snapshot.phase] || '今天也要照顾好自己';
    button.querySelector('span').textContent=text;button.setAttribute('aria-label',`${text}，点击鼓励自己`);
  }};
}
