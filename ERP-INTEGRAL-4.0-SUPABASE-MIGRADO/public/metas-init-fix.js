(() => {
'use strict';

let refreshing=false;
let lastRefresh=0;

async function refreshMetasWhenReady(force=false){
  const bridge=window.ERPIntegralBridge;
  const metas=window.ERPMetasV2;
  if(!bridge?.currentUser || !metas?.refresh || refreshing)return;
  const now=Date.now();
  if(!force && now-lastRefresh<1200)return;
  lastRefresh=now;
  refreshing=true;
  try{
    await metas.refresh();
  }catch(e){
    console.warn('Metas: falha ao sincronizar após inicialização do ERP',e);
  }finally{
    refreshing=false;
  }
}

// O bridge termina de carregar o usuário de forma assíncrona. Metas não deve
// permanecer com o primeiro render feito antes de currentUser estar disponível.
window.addEventListener('erp-bridge-ready',()=>refreshMetasWhenReady(true));

// Fallback para reload/cache/deploy: se o evento ocorreu antes deste arquivo
// ser avaliado, atualiza assim que bridge + usuário + módulo de metas existirem.
let tries=0;
const timer=setInterval(()=>{
  tries++;
  if(window.ERPIntegralBridge?.currentUser && window.ERPMetasV2?.refresh){
    clearInterval(timer);
    refreshMetasWhenReady(true);
  }else if(tries>=40){
    clearInterval(timer);
  }
},250);

// Ao abrir a aba Metas, garante uma leitura nova do Supabase depois da sessão.
document.addEventListener('click',e=>{
  const btn=e.target.closest?.('.nav [data-view="metas"], .nav [data-standalone-metas="metas"]');
  if(!btn)return;
  setTimeout(()=>refreshMetasWhenReady(true),30);
},true);
})();
