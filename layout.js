export const MODULES = { pomodoro:'番茄钟', income:'今日收入', stats:'计薪统计', timeline:'今日时间轴', cheer:'鼓励语', companion:'陪伴伙伴', rewards:'今日小目标', bigGoals:'跨天心愿单', formula:'计算说明' };
export const defaultLayout = () => Object.keys(MODULES);
export function validateLayout(value = defaultLayout()) {
  if (!Array.isArray(value) || value.length !== defaultLayout().length || new Set(value).size !== value.length || value.some(id=>!Object.hasOwn(MODULES,id))) throw new Error('模块顺序无效。');
  return [...value];
}
export function moveModule(order, id, offset) {
  const result=validateLayout(order), index=result.indexOf(id), target=index+offset;
  if(index<0 || !Number.isInteger(offset) || target<0 || target>=result.length)return result;
  result.splice(index,1);result.splice(target,0,id);return result;
}
export function applyLayout(order) {
  const root=document.querySelector('#stage');
  const nodes=order.map(id=>document.querySelector(`[data-module="${id}"]`));
  // Move existing nodes so controls, input values, and event handlers survive reordering.
  if(nodes.some((node,index)=>root.children[index]!==node))for(const node of nodes)root.append(node);
}
// Equal-height slots keep the target stable while neighbouring rows move out of the way.
export function dropIndex(y, top, rowHeight, count) {
  if (![y,top,rowHeight,count].every(Number.isFinite) || rowHeight<=0 || count<1) return 0;
  return Math.max(0,Math.min(count-1,Math.floor((y-top)/rowHeight)));
}
export function setupLayoutEditor(container, getOrder, saveOrder) {
  const status=document.querySelector('#layout-state');
  const scroller=document.querySelector('#settings-content');
  const dialog=container.closest('dialog');
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let gesture=null, frame=0;
  container.setAttribute('role','list');container.setAttribute('aria-label','模块顺序');
  const rows=()=>[...container.querySelectorAll('.layout-row')];
  const announce=text=>{status.textContent=text;};
  function reorder(order, animate=true) {
    const nodes=rows();
    const before=new Map(nodes.map(node=>[node.dataset.moduleId,node.getBoundingClientRect().top]));
    nodes.forEach(node=>node.getAnimations().forEach(animation=>animation.cancel()));
    for(const id of order)container.append(nodes.find(node=>node.dataset.moduleId===id));
    rows().forEach((node,index)=>{
      node.querySelector('.layout-position').textContent=String(index+1).padStart(2,'0');
      const handle=node.querySelector('button');handle.setAttribute('aria-label',`${MODULES[node.dataset.moduleId]}，第 ${index+1} 项，共 ${order.length} 项`);
      const dy=before.get(node.dataset.moduleId)-node.getBoundingClientRect().top;
      if(animate && !reduced() && dy && node!==gesture?.row)node.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
    });
  }
  function target(index) {
    const g=gesture;if(!g || index===g.order.indexOf(g.id))return;
    g.order=moveModule(g.order,g.id,index-g.order.indexOf(g.id));reorder(g.order);
    announce(`${MODULES[g.id]}，放到第 ${index+1} 项`);
  }
  function finish(commit) {
    const g=gesture;if(!g)return;
    gesture=null;cancelAnimationFrame(frame);frame=0;
    if(g.pointerId!==undefined && container.hasPointerCapture(g.pointerId))container.releasePointerCapture(g.pointerId);
    g.row.classList.remove('layout-placeholder','layout-keyboard-picked');
    g.row.querySelector('button').setAttribute('aria-pressed','false');
    g.ghost?.remove();container.classList.remove('is-sorting');
    if(!g.started)return;
    const changed=g.order.join()!==g.original.join();
    if(commit && changed) {
      try { saveOrder(g.order);announce(`${MODULES[g.id]}已移到第 ${g.order.indexOf(g.id)+1} 项，顺序已保存。`); }
      catch(e){reorder(getOrder());announce(e.message);}
    } else { reorder(g.original);announce(commit?'顺序未改变。':'已取消移动。'); }
    g.row.querySelector('button').focus({preventScroll:true});
  }
  function startPointer() {
    const g=gesture, rect=g.row.getBoundingClientRect();g.started=true;
    g.ghost=g.row.cloneNode(true);g.ghost.className='layout-row layout-drag-ghost';g.ghost.removeAttribute('data-module-id');g.ghost.setAttribute('aria-hidden','true');g.ghost.querySelector('button').tabIndex=-1;
    Object.assign(g.ghost.style,{left:`${rect.left}px`,top:'0px',width:`${rect.width}px`,height:`${rect.height}px`});
    (dialog || document.body).append(g.ghost);
    g.row.classList.add('layout-placeholder');container.classList.add('is-sorting');
    announce(`正在移动${MODULES[g.id]}，松手放到高亮位置，Esc 取消。`);
    frame=requestAnimationFrame(draw);
  }
  function draw(time) {
    const g=gesture;if(!g?.ghost)return;
    const area=scroller.getBoundingClientRect();
    const edge=48, speed=g.y<area.top+edge?-Math.min(10,(area.top+edge-g.y)/5):g.y>area.bottom-edge?Math.min(10,(g.y-area.bottom+edge)/5):0;
    const dt=g.lastFrame?Math.min(32,time-g.lastFrame)/16:1;g.lastFrame=time;
    if(speed)scroller.scrollTop+=speed*dt;
    const top=Math.max(area.top,Math.min(area.bottom-g.height,g.y-g.offset));
    g.ghost.style.transform=`translate3d(0,${top}px,0)`;
    target(dropIndex(g.y-g.offset+g.height/2,container.getBoundingClientRect().top+4,g.height,g.order.length));
    frame=requestAnimationFrame(draw);
  }
  container.addEventListener('pointerdown',e=>{
    if(e.button!==0 || gesture || !e.isPrimary)return;
    const row=e.target.closest('.layout-row');if(!row)return;
    if(e.pointerType==='touch' && !e.target.closest('.layout-handle'))return;
    const rect=row.getBoundingClientRect();
    gesture={id:row.dataset.moduleId,row,original:[...getOrder()],order:[...getOrder()],pointerId:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,offset:e.clientY-rect.top,height:rect.height,started:false};
    e.preventDefault();row.querySelector('button').focus({preventScroll:true});container.setPointerCapture(e.pointerId);
  });
  container.addEventListener('pointermove',e=>{
    const g=gesture;if(!g || g.pointerId!==e.pointerId)return;
    g.x=e.clientX;g.y=e.clientY;
    if(!g.started && Math.hypot(g.x-g.startX,g.y-g.startY)>5)startPointer();
  });
  container.addEventListener('pointerup',e=>{
    if(gesture?.pointerId!==e.pointerId)return;
    const rect=container.getBoundingClientRect(),area=scroller.getBoundingClientRect();
    finish(e.clientX>=rect.left-24 && e.clientX<=rect.right+24 && e.clientY>=area.top && e.clientY<=area.bottom);
  });
  container.addEventListener('pointercancel',()=>finish(false));
  container.addEventListener('lostpointercapture',()=>{if(gesture?.pointerId!==undefined)finish(false);});
  container.addEventListener('keydown',e=>{
    const handle=e.target.closest('.layout-handle');if(!handle)return;
    if([' ','Enter'].includes(e.key)) {
      e.preventDefault();if(gesture){if(gesture.pointerId===undefined)finish(true);return;}
      const row=handle.closest('.layout-row');gesture={id:row.dataset.moduleId,row,order:[...getOrder()],original:[...getOrder()],started:true};row.classList.add('layout-keyboard-picked');handle.setAttribute('aria-pressed','true');announce(`已选中${MODULES[gesture.id]}。方向键移动，空格确认，Esc 取消。`);
    } else if(gesture?.pointerId===undefined && gesture && ['ArrowUp','ArrowDown','Home','End'].includes(e.key)) {
      e.preventDefault();const index=gesture.order.indexOf(gesture.id);
      target(e.key==='Home'?0:e.key==='End'?gesture.order.length-1:Math.max(0,Math.min(gesture.order.length-1,index+(e.key==='ArrowUp'?-1:1))));handle.focus({preventScroll:true});handle.scrollIntoView({block:'nearest'});
    }
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && gesture){e.preventDefault();e.stopImmediatePropagation();finish(false);}},true);
  window.addEventListener('blur',()=>finish(false));dialog?.addEventListener('close',()=>finish(false));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(false);});
  function refresh() {
    finish(false);container.replaceChildren();
    getOrder().forEach((id,index)=>{
      const row=document.createElement('div');row.className='layout-row';row.dataset.moduleId=id;row.setAttribute('role','listitem');
      const handle=document.createElement('button');handle.type='button';handle.className='layout-handle';handle.setAttribute('aria-pressed','false');handle.setAttribute('aria-describedby','layout-help');handle.title='拖动排序；空格选中后用方向键移动';handle.setAttribute('aria-label',`${MODULES[id]}，第 ${index+1} 项，共 ${getOrder().length} 项`);
      handle.innerHTML='<svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="4" r="1.4"/><circle cx="11" cy="4" r="1.4"/><circle cx="5" cy="10" r="1.4"/><circle cx="11" cy="10" r="1.4"/><circle cx="5" cy="16" r="1.4"/><circle cx="11" cy="16" r="1.4"/></svg>';
      const name=document.createElement('span');name.className='layout-name';name.textContent=MODULES[id];
      const position=document.createElement('span');position.className='layout-position';position.setAttribute('aria-hidden','true');position.textContent=String(index+1).padStart(2,'0');
      row.append(handle,name,position);container.append(row);
    });
  }
  refresh();return {refresh};
}
