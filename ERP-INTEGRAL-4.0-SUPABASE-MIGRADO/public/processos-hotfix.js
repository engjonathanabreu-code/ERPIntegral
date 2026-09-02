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

async function recoverLoading(forceRetry=false){
  const bridge=window.ERPIntegralBridge;
  if(!bridge?.sb) return;
  const content=document.querySelector('#content');
  if(!content?.querySelector('.process-loading')) return;

  try{
    const {count,error}=await bridge.sb.from('processos_kanban').select('id',{count:'exact',head:true});
    if(error) throw error;
    if((count||0)>0){
      // A importação já existe no ERP. Impede que o módulo dispare outra
      // primeira sincronização antes de conseguir desenhar o quadro.
      localStorage.setItem('erp_processos_last_sync',String(Date.now()));
      await window.ERPProcessosKanban?.render?.();
      return;
    }

    if(forceRetry){
      await window.ERPProcessosKanban?.sync?.(false);
      const check=await bridge.sb.from('processos_kanban').select('id',{count:'exact',head:true});
      if(!check.error&&(check.count||0)>0){
        localStorage.setItem('erp_processos_last_sync',String(Date.now()));
        await window.ERPProcessosKanban?.render?.();
        return;
      }
    }
  }catch(e){
    console.error('Processos recovery',e);
  }

  if(content.querySelector('.process-loading')){
    content.innerHTML='<div class="notice danger"><b>Não foi possível concluir a primeira sincronização.</b><br>A tela não ficará mais presa em carregamento. Tente novamente para importar os processos do CRM.<div style="margin-top:12px"><button id="processRetrySync" class="btn">Tentar sincronizar novamente</button></div></div>';
    document.querySelector('#processRetrySync')?.addEventListener('click',async()=>{
      content.innerHTML='<div class="process-loading">Sincronizando processos…</div>';
      await recoverLoading(true);
    });
  }
}

function watchProcessClick(){
  document.addEventListener('click',e=>{
    if(!e.target.closest?.('[data-processos-kanban]')) return;
    setTimeout(()=>recoverLoading(false),3500);
  },true);
}

function start(){
  placeNav();
  new MutationObserver(placeNav).observe(document.documentElement,{childList:true,subtree:true});
  watchProcessClick();
  if(document.querySelector('.process-loading')) setTimeout(()=>recoverLoading(false),1200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();