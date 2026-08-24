(() => {
'use strict';
const STORAGE='erp_integral_project_groups_collapsed';
function read(){try{return JSON.parse(localStorage.getItem(STORAGE)||'{}')}catch{return {}}}
function write(v){try{localStorage.setItem(STORAGE,JSON.stringify(v))}catch{}}
function enhanceProjectGroups(){
  const groups=[...document.querySelectorAll('.project-group')];
  if(!groups.length)return;
  const state=read();
  groups.forEach((section,index)=>{
    if(section.dataset.collapsibleReady)return;
    section.dataset.collapsibleReady='1';
    const title=section.querySelector('.group-title');if(!title)return;
    const raw=(title.childNodes[0]?.textContent||title.textContent||`Grupo ${index}`).trim();
    const key=raw.toLowerCase().replace(/\s+/g,'-');
    const count=title.querySelector('span')?.textContent||'';
    title.innerHTML=`<button type="button" class="project-group-toggle" aria-expanded="true"><span class="chev">⌄</span><span>${raw}</span>${count?`<span>${count}</span>`:''}</button>`;
    const btn=title.querySelector('.project-group-toggle');
    const set=open=>{section.classList.toggle('collapsed',!open);btn.setAttribute('aria-expanded',String(open));state[key]=!open;write(state)};
    if(state[key])set(false);
    btn.onclick=()=>set(section.classList.contains('collapsed'));
  });
}
const observer=new MutationObserver(enhanceProjectGroups);observer.observe(document.documentElement,{subtree:true,childList:true});enhanceProjectGroups();
})();
