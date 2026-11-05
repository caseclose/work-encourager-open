#!/usr/bin/env node
// End-to-end verification for the Windows shell.
//
// It connects to the running app's WebView2 through the Chrome DevTools Protocol, drives the
// same native actions the UI uses, and checks the observable result. The debug hook is only
// opened when WORK_ENCOURAGER_CDP_PORT is set, so this never runs against a normal launch.
//
//   npm install playwright-core          # in any folder reachable by NODE_PATH
//   $env:WORK_ENCOURAGER_CDP_PORT = '9333'
//   Start-Process windows\WorkEncourager\bin\Debug\net10.0-windows\WorkEncourager.exe
//   node windows/tools/ui-probe.mjs
import { chromium } from 'playwright-core';

const port = process.env.WORK_ENCOURAGER_CDP_PORT || process.argv[2] || '9333';
const endpoint = `http://127.0.0.1:${port}`;

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) {
    failures += 1;
  }
  const label = ok ? 'PASS' : 'FAIL';
  const extra = detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  console.log(`[${label}] ${name}${extra}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.connectOverCDP(endpoint);
const pages = browser.contexts().flatMap((context) => context.pages());
const page = pages.find((candidate) => candidate.url().includes('index.html'));
if (!page) {
  console.error('找不到工作面板页面，确认应用已用 WORK_ENCOURAGER_CDP_PORT 启动。');
  process.exit(1);
}

const post = (action, extra = {}) =>
  page.evaluate((message) => window.webkit.messageHandlers.statusBar.postMessage(message), { action, ...extra });

// --- 1. native bridge -------------------------------------------------------
check('原生桥 window.webkit.messageHandlers.statusBar 就位', await page.evaluate(() => Boolean(window.webkit?.messageHandlers?.statusBar)));

check(
  '设置页原生控件已启用（迷你窗 / 开机启动 / 快捷键）',
  await page.evaluate(
    () =>
      !document.querySelector('#mini-enabled').disabled &&
      !document.querySelector('#launch-at-login').disabled &&
      !document.querySelector('#global-hotkey').disabled,
  ),
);

// --- 2. earnings engine + tray status --------------------------------------
const originalSettings = await page.evaluate(() => localStorage.getItem('work-encourager-settings-v1'));
await page.evaluate(() => {
  const settings = {
    salary: '20000',
    workdays: '22',
    start: '09:30',
    end: '18:30',
    breakEnabled: true,
    breakStart: '12:00',
    breakEnd: '13:30',
    dinnerEnabled: false,
    dinnerStart: '18:00',
    dinnerEnd: '19:00',
    weekdays: [1, 2, 3, 4, 5],
    barMode: 'earned',
    masked: false,
    theme: 'auto',
    showStats: true,
    showTimeline: true,
    showRewards: true,
    showBigGoals: true,
  };
  localStorage.setItem('work-encourager-settings-v1', JSON.stringify(settings));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(1800);

const earnings = await page.evaluate(() => ({
  amount: document.querySelector('#amount')?.textContent?.replace(/\s+/g, ' ').trim(),
  status: window.__getMenuBarStatus(),
}));
check('计薪引擎在原生外壳内正常工作', /^¥\d/.test(earnings.amount ?? ''), earnings.amount);
check('托盘状态标题包含金额', /¥/.test(earnings.status?.title ?? ''), earnings.status?.title);

// Only the payable phase ticks; during 午休/晚饭/下班/休息日 the amount is intentionally frozen.
const phase = await page.evaluate(() => window.__getMenuBarStatus().phase);
const firstTitle = await page.evaluate(() => window.__getMenuBarStatus().title);
await sleep(2600);
const secondTitle = await page.evaluate(() => window.__getMenuBarStatus().title);
if (phase === 'working') {
  check('状态每秒刷新（金额会跳动）', Boolean(firstTitle) && firstTitle !== secondTitle, `${firstTitle} → ${secondTitle}`);
} else {
  check(`非计薪时段（${phase}）金额保持不变`, Boolean(firstTitle) && firstTitle === secondTitle, `${firstTitle} → ${secondTitle}`);
}

// --- 3. privacy mask --------------------------------------------------------
await page.evaluate(() => window.__togglePrivacyMask());
await sleep(450);
const masked = await page.evaluate(() => ({ bar: window.__getMenuBarStatus(), amount: document.querySelector('#amount')?.textContent?.trim() }));
check('隐私打码同时作用于托盘状态与面板', masked.bar?.masked === true && masked.amount?.includes('****'), masked);
await page.evaluate(() => window.__togglePrivacyMask());
await sleep(350);

// --- 4. native actions ------------------------------------------------------
await post('setHotkey', { value: 'ctrlAltE' });
await sleep(700);
const hotkey = await page.evaluate(() => ({
  value: document.querySelector('#global-hotkey').value,
  readout: document.querySelector('#native-state').textContent,
}));
check('全局快捷键设置往返成功', hotkey.value === 'ctrlAltE' && hotkey.readout.includes('全局快捷键已设置'), hotkey);

await post('setMiniWindow', { enabled: true, pinned: true, opacity: 0.95 });
await sleep(700);
check('迷你悬浮窗开关往返成功', await page.evaluate(() => document.querySelector('#mini-enabled').checked));

// Notification checks depend on the machine's notification setting; skip instead of failing.
const notificationStatus = await page.evaluate(() => document.querySelector('#notification-state').textContent);
if (notificationStatus.includes('已允许')) {
  await post('notify', { title: '自动化测试', body: '来自 ui-probe 的系统提醒。' });
  await sleep(1200);
  const notifyOk = await page.evaluate(() => document.querySelector('#native-state').textContent);
  check('系统提醒发送成功', notifyOk.includes('提醒已发送'), notifyOk);

  await post('notify', { title: '已挣 ¥123.45', body: '今天到账 100 元' });
  await sleep(700);
  const notifyBlocked = await page.evaluate(() => document.querySelector('#native-state').textContent);
  check('含金额的提醒被原生端拦截', notifyBlocked.includes('已阻止发送'), notifyBlocked);
} else {
  console.log(`[SKIP] 系统通知未授权（${notificationStatus.trim()}），跳过通知检查`);
}

await post('exportBackup', { text: 'not-json', filename: 'bad.json' });
await sleep(600);
const backupInvalid = await page.evaluate(() => document.querySelector('#backup-state').textContent);
check('非法备份被拒绝且不弹文件框', backupInvalid.includes('有效 JSON'), backupInvalid);

await post('openRelease', { url: 'https://example.com/evil' });
await sleep(600);
const releaseInvalid = await page.evaluate(() => document.querySelector('#native-state').textContent);
check('非法发布页地址被拒绝', releaseInvalid.includes('无效的版本页面地址'), releaseInvalid);

// --- 5. update check --------------------------------------------------------
await page.evaluate(() => document.querySelector('#check-updates').click());
await sleep(7000);
const update = await page.evaluate(() => ({
  readout: document.querySelector('#update-state').textContent,
  releaseButton: !document.querySelector('#release-link-wrap').hidden,
  buttonEnabled: !document.querySelector('#check-updates').disabled,
}));
check('GitHub 版本检查返回结论', Boolean(update.readout) && update.buttonEnabled, update);

// --- 6. settings sections ---------------------------------------------------
// The settings sheet is a <dialog>: open it first, the sections only render while it is shown.
await page.evaluate(() => document.querySelector('#settings-open')?.click());
await sleep(700);
check(
  '设置页包含原生分组',
  await page.evaluate(
    () =>
      document.body.innerText.includes('迷你悬浮窗') &&
      document.body.innerText.includes('启动与操作') &&
      document.body.innerText.includes('备份与恢复'),
  ),
);
await page.evaluate(() => document.querySelector('#settings-back')?.click());
await sleep(400);

// restore the seeded settings so the real user data is untouched
await page.evaluate((value) => {
  if (value === null) {
    localStorage.removeItem('work-encourager-settings-v1');
  } else {
    localStorage.setItem('work-encourager-settings-v1', value);
  }
}, originalSettings);

console.log('');
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
