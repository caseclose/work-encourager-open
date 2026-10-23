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
export function setupLayoutEditor(container, getOrder, saveOrder) {
  let dragged=null;
  function refresh() {
    const order=getOrder();container.replaceChildren();
    order.forEach((id,index)=>{
      const row=document.createElement('div');row.className='layout-row';row.draggable=true;row.dataset.moduleId=id;
      const name=document.createElement('span');name.textContent=`⠿ ${MODULES[id]}`;row.append(name);
      const buttons=document.createElement('div');
      for(const [offset,label] of [[-1,'上移'],[1,'下移']]) {
        const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-label',`${label}${MODULES[id]}`);button.disabled=offset<0?index===0:index===order.length-1;
        button.onclick=()=>{commit(moveModule(getOrder(),id,offset));container.querySelector(`[data-module-id="${id}"] button:not(:disabled)`)?.focus();};buttons.append(button);
      }
      row.append(buttons);row.ondragstart=e=>{dragged=id;e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';};
      row.ondragover=e=>{if(dragged)e.preventDefault();};
      row.ondrop=e=>{e.preventDefault();if(dragged)commit(moveModule(getOrder(),dragged,getOrder().indexOf(id)-getOrder().indexOf(dragged)));dragged=null;};
      row.ondragend=()=>{dragged=null;};container.append(row);
    });
  }
  function commit(order){try{saveOrder(order);document.querySelector('#layout-state').textContent='模块顺序已保存。';}catch(e){document.querySelector('#layout-state').textContent=e.message;}refresh();}
  refresh();return {refresh};
}
