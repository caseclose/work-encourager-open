export const POMODORO_KEY = 'work-encourager-pomodoro-v1';
export const phaseNames = { focus: '专注', short: '短休息', long: '长休息' };
export const pomodoroDefaults = () => ({ visible: true, focus: 25, short: 5, long: 15, rounds: 4, notifications: false });
export function validatePomodoro(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('番茄钟设置格式无效。');
  const result = { ...pomodoroDefaults(), ...value };
  for (const key of ['visible','notifications']) if (typeof result[key] !== 'boolean') throw new Error('番茄钟开关无效。');
  for (const [key,max] of [['focus',180],['short',60],['long',120],['rounds',12]]) {
    if (!Number.isInteger(result[key]) || result[key] < 1 || result[key] > max) throw new Error(`番茄钟时长或轮数超出范围（${key}：1–${max}）。`);
  }
  return Object.fromEntries(Object.keys(pomodoroDefaults()).map(key => [key,result[key]]));
}
export function formatTimer(ms) {
  const seconds = Math.max(0,Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
// Store a deadline rather than counting callbacks: closing a panel and background throttling do not slow the timer.
export function createPomodoro({ storage, getConfig, onComplete = () => {}, now = Date.now }) {
  const fresh = () => ({ phase:'focus', status:'idle', duration:getConfig().focus*60000, remaining:getConfig().focus*60000, deadline:null, completed:0 });
  let state = fresh(), error = '';
  try {
    const saved = JSON.parse(storage.getItem(POMODORO_KEY) || 'null');
    if (saved && Object.hasOwn(phaseNames,saved.phase) && ['idle','running','paused','done'].includes(saved.status)
      && Number.isInteger(saved.completed) && saved.completed >= 0 && saved.completed <= 1e6
      && Number.isFinite(saved.duration) && saved.duration >= 60000 && saved.duration <= 10800000
      && Number.isFinite(saved.remaining) && saved.remaining >= 0 && saved.remaining <= saved.duration
      && (saved.status !== 'running' || (Number.isFinite(saved.deadline) && saved.deadline > 0))) state = saved;
  } catch { /* Invalid saved timers start fresh. */ }
  function save() { try { storage.setItem(POMODORO_KEY,JSON.stringify(state)); error=''; } catch { error='计时正在运行，但保存失败；重启后可能无法恢复。'; } }
  function tick() {
    if (state.status === 'running' && now() >= state.deadline) {
      state.remaining=0;state.deadline=null;state.status='done';
      if (state.phase==='focus') state.completed++;
      save();onComplete(state.phase);
    }
    return view();
  }
  function view() { const remaining = state.status==='running' ? Math.min(state.duration,Math.max(0,state.deadline-now())) : state.remaining; return {...state,remaining,error,progress:1-remaining/state.duration}; }
  function prepare(phase) { const duration=getConfig()[phase]*60000;state={...state,phase,status:'idle',duration,remaining:duration,deadline:null}; }
  function nextPhase() { return state.phase==='focus' ? (state.completed>0 && state.completed%getConfig().rounds===0 ? 'long':'short') : 'focus'; }
  return { tick, view, start() { tick();if(state.status==='running')return view();if(state.status==='done')prepare(nextPhase());if(state.status==='idle')prepare(state.phase);state.status='running';state.deadline=now()+state.remaining;save();return view(); },
    pause() { tick();if(state.status==='running'){state.remaining=view().remaining;state.status='paused';state.deadline=null;save();}return view(); },
    skip() { tick();prepare(nextPhase());save();return view(); },
    reset() { state=fresh();save();return view(); },
    configure() { if(state.status==='idle'){prepare(state.phase);save();}return view(); },
  };
}
export function setupPomodoroUI(timer, getConfig) {
  const card=document.querySelector('#pomodoro-card'), el=id=>document.getElementById(id);
  const update=()=>{
    const s=timer.tick(); card.hidden=!getConfig().visible;
    el('pomodoro-phase').textContent=`🍅 ${phaseNames[s.phase]}`;
    el('pomodoro-time').textContent=formatTimer(s.remaining);
    el('pomodoro-time').setAttribute('aria-label',`${phaseNames[s.phase]}剩余 ${formatTimer(s.remaining)}`);
    el('pomodoro-progress').value=s.progress;
    el('pomodoro-rounds').textContent=`本轮已完成 ${s.completed} 个番茄`;
    el('pomodoro-message').textContent=s.error || (s.status==='done' ? (s.phase==='focus'?'专注完成，休息一下吧。':'休息结束，准备好再出发。') : s.status==='paused'?'已暂停，按自己的节奏来。':'每次只做好眼前这一件事。');
    el('pomodoro-toggle').textContent=s.status==='running'?'暂停':s.status==='paused'?'继续':s.status==='done'?'开始下一阶段':'开始';
    el('pomodoro-skip').disabled=s.status==='idle';
    return s;
  };
  el('pomodoro-toggle').onclick=()=>{timer.view().status==='running'?timer.pause():timer.start();update();};
  el('pomodoro-skip').onclick=()=>{timer.skip();update();};
  el('pomodoro-reset').onclick=()=>{if(confirm('结束当前计时并清零本轮完成数？')){timer.reset();update();}};
  return {update};
}
