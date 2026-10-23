export const POMODORO_KEY = 'work-encourager-pomodoro-v1';
export const phaseNames = { focus: '专注', short: '短休息', long: '长休息' };
export const pomodoroDefaults = () => ({ visible: true, focus: 25, short: 5, long: 15, rounds: 4, notifications: false, collapsed: false, style: 'classic' });
export function validatePomodoro(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('番茄钟设置格式无效。');
  const result = { ...pomodoroDefaults(), ...value };
  for (const key of ['visible','notifications','collapsed']) if (typeof result[key] !== 'boolean') throw new Error('番茄钟开关无效。');
  if (!['classic','tree','stars'].includes(result.style)) throw new Error('番茄钟样式无效。');
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
  const fresh = () => ({ phase:'focus', status:'idle', duration:getConfig().focus*60000, remaining:getConfig().focus*60000, deadline:null, completed:0, totalCompleted:0 });
  let state = fresh(), error = '';
  try {
    const saved = JSON.parse(storage.getItem(POMODORO_KEY) || 'null');
    if (saved && Object.hasOwn(phaseNames,saved.phase) && ['idle','running','paused','done'].includes(saved.status)
      && Number.isInteger(saved.completed) && saved.completed >= 0 && saved.completed <= 1e6
      && Number.isFinite(saved.duration) && saved.duration >= 60000 && saved.duration <= 10800000
      && Number.isFinite(saved.remaining) && saved.remaining >= 0 && saved.remaining <= saved.duration
      && (saved.status !== 'running' || (Number.isFinite(saved.deadline) && saved.deadline > 0))) state = {...saved,totalCompleted:Number.isSafeInteger(saved.totalCompleted) && saved.totalCompleted>=saved.completed ? saved.totalCompleted : saved.completed};
  } catch { /* Invalid saved timers start fresh. */ }
  function save() { try { storage.setItem(POMODORO_KEY,JSON.stringify(state)); error=''; } catch { error='计时正在运行，但保存失败；重启后可能无法恢复。'; } }
  function tick() {
    if (state.status === 'running' && now() >= state.deadline) {
      state.remaining=0;state.deadline=null;state.status='done';
      if (state.phase==='focus') { state.completed++;state.totalCompleted++; }
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
    reset() { const totalCompleted=state.totalCompleted;state={...fresh(),totalCompleted};save();return view(); },
    configure() { if(state.status==='idle'){prepare(state.phase);save();}return view(); },
  };
}
export function setupPomodoroUI(timer, getConfig, setCollapsed) {
  const card=document.querySelector('#pomodoro-card'), el=id=>document.getElementById(id);
  let lastStyle='';
  const tree='<svg viewBox="0 0 220 130"><ellipse cx="110" cy="119" rx="62" ry="7" fill="var(--line)"/><g class="growing-tree"><path d="M110 117V43m0 35-25-20m25 7 25-23" stroke="#987047" stroke-width="7" fill="none" stroke-linecap="round"/><ellipse cx="85" cy="53" rx="24" ry="17" fill="#87b779"/><ellipse cx="137" cy="40" rx="29" ry="21" fill="#6d9f67"/><ellipse cx="107" cy="24" rx="30" ry="23" fill="#9acb83"/></g><path d="M105 115q-10-13-22-5 2 14 22 5m9 0q9-16 22-9-1 13-22 9" fill="#87b779"/></svg>';
  const stars='<svg viewBox="0 0 220 130">'+[[30,94],[50,43],[84,65],[108,22],[138,54],[178,32],[193,94],[118,104]].map(([x,y],i)=>`<g class="growth-star" style="--index:${i}"><path d="m${x} ${y-9} 3 6 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="var(--gold)"/></g>`).join('')+'</svg>';
  const update=()=>{
    const config=getConfig();
    const s=timer.tick(); card.hidden=!getConfig().visible;
    card.dataset.collapsed=String(config.collapsed);card.dataset.status=s.status;
    el('pomodoro-body').hidden=config.collapsed;
    el('pomodoro-compact-time').hidden=!config.collapsed;el('pomodoro-compact-time').textContent=formatTimer(s.remaining);
    el('pomodoro-collapse').textContent=config.collapsed?'展开':'收起';el('pomodoro-collapse').setAttribute('aria-expanded',String(!config.collapsed));
    const visual=el('pomodoro-visual');visual.hidden=config.style==='classic';
    if(lastStyle!==config.style){visual.innerHTML=config.style==='tree'?tree:config.style==='stars'?stars:'';lastStyle=config.style;}
    const progress=s.phase==='focus'?s.progress:1;
    visual.style.setProperty('--growth',String(.15+.85*progress));
    visual.querySelectorAll('.growth-star').forEach((star,i)=>{star.style.opacity=progress>=(i+1)/8?'1':'.28';});
    el('pomodoro-achievement').hidden=config.style==='classic';
    el('pomodoro-achievement').textContent=config.style==='tree'?`累计种下 ${s.totalCompleted} 棵树 · ${s.phase!=='focus'?'让小树陪你休息':s.status==='done'?'又一棵小树长成了！':s.status==='idle'?'开始专注，让树苗长大':s.progress<.35?'正在生根发芽':s.progress<.75?'树苗在慢慢长高':'枝叶越来越茂盛'}`:`累计点亮 ${s.totalCompleted} 颗星 · ${s.phase!=='focus'?'星光陪你休息':s.status==='done'?'又点亮了一颗专注之星！':'把这段专注，积成一片星光'}`;
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
  el('pomodoro-collapse').onclick=()=>{try{setCollapsed(!getConfig().collapsed);update();}catch(e){el('pomodoro-message').textContent=e.message;}};
  el('pomodoro-toggle').onclick=()=>{timer.view().status==='running'?timer.pause():timer.start();update();};
  el('pomodoro-skip').onclick=()=>{timer.skip();update();};
  el('pomodoro-reset').onclick=()=>{if(confirm('结束当前计时并清零本轮完成数？')){timer.reset();update();}};
  return {update};
}
