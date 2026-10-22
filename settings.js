export function setupSettings({ goalEditor, getSettings, updateSettings }) {
  const view = document.querySelector('#settings-view');
  const content = document.querySelector('#settings-content');
  const title = document.querySelector('#settings-title');
  const back = document.querySelector('#settings-back');
  const goalsPage = document.querySelector('#goal-settings');
  const controls = [...view.querySelectorAll('[data-pref]')];
  function sync() {
    if (!view.open) return;
    const settings = getSettings();
    controls.forEach(control => {
      const value = settings[control.dataset.pref];
      if (control.type === 'checkbox') control.checked = value;
      else control.setAttribute('aria-pressed', String(value === control.dataset.value));
    });
  }
  function showRoot() {
    goalsPage.hidden = true;
    content.hidden = false;
    title.textContent = '设置';
    back.setAttribute('aria-label', '返回主面板');
    document.querySelector('#goal-settings-open').focus();
  }
  function goBack() {
    if (!goalsPage.hidden) { goalEditor.close(); return; }
    view.close();
  }
  document.querySelector('#settings-open').addEventListener('click', () => {
    content.hidden = false;
    goalsPage.hidden = true;
    title.textContent = '设置';
    back.setAttribute('aria-label', '返回主面板');
    view.showModal();
    content.scrollTop = 0;
    sync();
  });
  document.querySelector('#goal-settings-open').addEventListener('click', () => {
    content.hidden = true;
    goalEditor.open();
    title.textContent = '目标设置';
    back.setAttribute('aria-label', '返回设置');
    back.focus();
  });
  back.addEventListener('click', goBack);
  view.addEventListener('cancel', event => { event.preventDefault(); goBack(); });
  document.addEventListener('encourager-goals-close', showRoot);
  window.addEventListener('encourager-preferences', sync);
  controls.forEach(control => {
    control.addEventListener(control.type === 'checkbox' ? 'change' : 'click', () => {
      updateSettings(control.dataset.pref, control.type === 'checkbox' ? control.checked : control.dataset.value);
      sync();
    });
  });
}
