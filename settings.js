export function setupSettings({ goalEditor, getSettings, updateSettings, rememberPage = () => false }) {
  const view = document.querySelector('#settings-view');
  const content = document.querySelector('#settings-content');
  const title = document.querySelector('#settings-title');
  const back = document.querySelector('#settings-back');
  const goalsPage = document.querySelector('#goal-settings');
  const controls = [...view.querySelectorAll('[data-pref]')];
  const remember = page => { if (rememberPage()) { try { localStorage.setItem('work-encourager-last-page',page); } catch {} } };
  function sync() {
    if (!view.open) return;
    const settings = getSettings();
    controls.forEach(control => {
      const value = settings[control.dataset.pref];
      if (control.type === 'checkbox') control.checked = value;
      else if (control.tagName === 'SELECT') control.value = value;
      else control.setAttribute('aria-pressed', String(value === control.dataset.value));
    });
  }
  function showRoot() {
    goalsPage.hidden = true; content.hidden = false; title.textContent = '设置';
    back.setAttribute('aria-label', '返回主面板'); remember('settings');
    document.querySelector('#goal-settings-open').focus();
  }
  function goBack() {
    if (!goalsPage.hidden) { goalEditor.close(); return; }
    remember('main');view.close();
  }
  function openSettings() {
    content.hidden = false; goalsPage.hidden = true; title.textContent = '设置';
    back.setAttribute('aria-label', '返回主面板');
    if (!view.open) view.showModal();
    content.scrollTop = 0; remember('settings');sync();
  }
  function openGoals() {
    content.hidden = true;goalEditor.open();title.textContent = '目标设置';
    back.setAttribute('aria-label', '返回设置');remember('goals');back.focus();
  }
  document.querySelector('#settings-open').addEventListener('click', openSettings);
  document.querySelector('#goal-settings-open').addEventListener('click', openGoals);
  back.addEventListener('click', goBack);
  view.addEventListener('cancel', event => { event.preventDefault(); goBack(); });
  document.addEventListener('encourager-goals-close', showRoot);
  window.addEventListener('encourager-preferences', sync);
  controls.forEach(control => {
    const changes = control.type === 'checkbox' || control.tagName === 'SELECT';
    control.addEventListener(changes ? 'change' : 'click', () => {
      updateSettings(control.dataset.pref, control.type === 'checkbox' ? control.checked : control.tagName === 'SELECT' ? control.value : control.dataset.value);sync();
    });
  });
  return { restore() {
    if(!rememberPage())return;
    const page=localStorage.getItem('work-encourager-last-page');
    if(page==='settings'||page==='goals'){openSettings();if(page==='goals')openGoals();}
  }};
}
