import test from 'node:test';
import assert from 'node:assert/strict';
import { createPomodoro, pomodoroDefaults, validatePomodoro, formatTimer, POMODORO_KEY } from './pomodoro.js';
import { validateFeatures, createBackup, parseBackup } from './features.js';
import { defaultGoals } from './goals.js';
function fixture() {
  let clock=100000; const map=new Map(), events=[]; let config=pomodoroDefaults();
  const storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
  const build=()=>createPomodoro({storage,getConfig:()=>config,now:()=>clock,onComplete:p=>events.push(p)});
  return {timer:build(),build,events,map,advance:ms=>clock+=ms,config:c=>config={...config,...c}};
}
test('deadline survives background delays and restart; completion only counted once',()=>{
  const f=fixture();f.timer.start();f.advance(300000);assert.equal(f.timer.tick().remaining,1200000);
  const restarted=f.build();assert.equal(restarted.tick().remaining,1200000);
  f.advance(86400000);assert.equal(restarted.tick().status,'done');assert.equal(restarted.tick().completed,1);
  assert.deepEqual(f.events,['focus']);assert.equal(f.build().tick().completed,1);
});
test('pause freezes remaining, resume uses remainder, settings take effect next stage',()=>{
  const f=fixture();f.timer.start();f.advance(10000);f.timer.pause();f.advance(600000);
  assert.equal(f.timer.tick().remaining,1490000);f.config({focus:30,short:2});f.timer.configure();f.timer.start();
  assert.equal(f.timer.view().remaining,1490000);f.advance(1490000);f.timer.tick();f.timer.start();
  assert.equal(f.timer.view().phase,'short');assert.equal(f.timer.view().remaining,120000);
});
test('four completed focuses select long rest and skipping never awards completion',()=>{
  const f=fixture();f.config({focus:1,short:1,long:2});
  for(let i=1;i<=4;i++){f.timer.start();f.advance(60000);assert.equal(f.timer.tick().completed,i);f.timer.start();assert.equal(f.timer.view().phase,i===4?'long':'short');f.timer.skip();}
  assert.equal(f.timer.view().completed,4);f.timer.start();f.timer.skip();assert.equal(f.timer.view().completed,4);
  assert.equal(f.timer.reset().completed,0);assert.equal(f.timer.view().remaining,60000);
});
test('expiry at pause boundary counts completion and does not turn it into paused',()=>{
 const f=fixture();f.timer.start();f.advance(1500000);assert.equal(f.timer.pause().status,'done');assert.equal(f.timer.view().completed,1);
});
test('invalid persisted state resets; failed storage retains working timer and reports error',()=>{
 const f=fixture();f.map.set(POMODORO_KEY,JSON.stringify({phase:'__proto__',status:'running'}));assert.equal(f.build().view().status,'idle');
 const timer=createPomodoro({storage:{getItem:()=>null,setItem:()=>{throw Error('quota');}},getConfig:pomodoroDefaults});assert.equal(timer.start().status,'running');assert.match(timer.view().error,/保存失败/);
});
test('old feature preferences migrate; duration and type bounds reject malformed imports',()=>{
 assert.deepEqual(validateFeatures({}).pomodoro,pomodoroDefaults());
 for(const c of [{focus:0},{short:61},{long:121},{rounds:1.5},{notifications:1},null])assert.throws(()=>validatePomodoro(c));
 assert.equal(formatTimer(1499999),'25:00');assert.equal(formatTimer(-1),'00:00');
 const settings={salary:'',workdays:'22',start:'09:00',end:'18:00',breakStart:'12:00',breakEnd:'13:00',dinnerStart:'17:00',dinnerEnd:'18:00',weekdays:[1,2,3,4,5]};
 const features=validateFeatures({pomodoro:{focus:40}});
 assert.equal(parseBackup(createBackup({settings,features,goals:defaultGoals()})).features.pomodoro.focus,40);
});


test('visual and collapsed preferences migrate and reject invalid styles',()=>{
 assert.equal(validatePomodoro({}).collapsed,false);
 assert.equal(validatePomodoro({}).style,'classic');
 assert.equal(validatePomodoro({style:'tree',collapsed:true}).style,'tree');
 for(const value of [{style:'unknown'},{collapsed:'true'}])assert.throws(()=>validatePomodoro(value));
});
test('lifetime rewards survive restart and resetting a round; skipping cannot earn rewards',()=>{
 const f=fixture();f.timer.start();f.advance(1500000);f.timer.tick();
 assert.equal(f.timer.view().totalCompleted,1);assert.equal(f.build().view().totalCompleted,1);
 f.timer.reset();assert.equal(f.timer.view().completed,0);assert.equal(f.timer.view().totalCompleted,1);
 f.timer.start();f.timer.skip();assert.equal(f.timer.view().totalCompleted,1);
});
import { defaultLayout, validateLayout, moveModule } from './layout.js';
test('module ordering preserves all modules and respects boundaries',()=>{
 const initial=defaultLayout(), moved=moveModule(initial,'pomodoro',3);
 assert.equal(moved[3],'pomodoro');assert.deepEqual(initial,defaultLayout());
 assert.deepEqual(moveModule(initial,'pomodoro',-1),initial);
 assert.deepEqual(moveModule(initial,'formula',1),initial);
 assert.deepEqual(validateFeatures({}).moduleOrder,initial);
 assert.throws(()=>validateLayout(['pomodoro']));
 assert.throws(()=>validateLayout(initial.map(()=> 'pomodoro')));
 assert.throws(()=>validateLayout([...initial.slice(0,-1),'__proto__']));
});

import { dropIndex } from './layout.js';
test('drag target is stable within slots and clamps at both ends',()=>{
 assert.equal(dropIndex(124,100,48,9),0);
 assert.equal(dropIndex(147.9,100,48,9),0);
 assert.equal(dropIndex(148,100,48,9),1);
 assert.equal(dropIndex(-100,100,48,9),0);
 assert.equal(dropIndex(2000,100,48,9),8);
 assert.equal(dropIndex(100,100,0,9),0);
 assert.equal(dropIndex(NaN,100,48,9),0);
 const order=defaultLayout();assert.equal(moveModule(order,'pomodoro',dropIndex(300,100,48,9))[4],'pomodoro');
});
