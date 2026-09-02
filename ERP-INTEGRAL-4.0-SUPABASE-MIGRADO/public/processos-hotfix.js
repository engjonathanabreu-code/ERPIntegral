(() => {
'use strict';
if (window.ERPProcessosHotfix) return;
window.ERPProcessosHotfix=true;

function placeNav(){
  const nav=document.querySelector('.nav');
  const proc=nav?.querySelector('[data-processos-kanban]');
  const users=nav?.querySelector('[data-view="users"]');
  if(proc&&users&&proc.nextElementSibling!==users) nav.insertBefore(proc,users);
}

async function recoverLoading(){
  const bridge=window.ERPIntegralBridge;
  if(!bridge?.sb) return;
  const content=document.querySelector('#content');
  if(!content?.querySelector('.process-loading')) return;
  try{
    const {count,error}=await bridge.sb.from('processos_kanban').select('id',{count:'exact',head:true});
    if(error) throw error;
    if((count||0)>0){
      await window.ERPProcessosKanban?.render?.();
      return;
    }
  }catch(e){console.error('Processos recovery',e);}
  if(content.querySelector('.process-loading')){
    content.innerHTML='<div class="notice danger"><b>A sincronização do CRM demorou mais que o esperado.</b><br>Você pode tentar novamente sem sair do ERP.<div style="margin-top:12px"><button id="processRetrySync" class="btn">Tentar sincronizar novamente</button></div></div>';
    document.querySelector('#processRetrySync')?.addEventListener('click',async()=>{
      content.innerHTML='<div class="process-loading">Sincronizando processos…</div>';
      try{await window.ERPProcessosKanban?.sync?.(false);}finally{setTimeout(recoverLoading,1500);}
    });
  }
}

function watchProcessClick(){
  document.addEventListener('click',e=>{
    if(!e.target.closest?.('[data-processos-kanban]')) return;
    setTimeout(recoverLoading,12000);
  },true);
}

function start(){
  placeNav();
  new MutationObserver(placeNav).observe(document.documentElement,{childList:true,subtree:true});
  watchProcessClick();
  if(document.querySelector('.process-loading')) setTimeout(recoverLoading,1500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();