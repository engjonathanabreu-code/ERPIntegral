/* ERP Integral - carrega a versão estável preservada antes do módulo de segurança. */
(async()=>{
  try{
    const url='https://raw.githubusercontent.com/engjonathanabreu-code/ERPIntegral/f43e69e787a9315be2338fc8ca2f51298d3750ff/ERP-INTEGRAL-4.0-SUPABASE-MIGRADO/public/app.js';
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const source=await r.text();
    (0,eval)(source);
  }catch(e){
    console.error('ERP Integral: falha ao carregar aplicação estável',e);
    const app=document.querySelector('#app');
    if(app)app.innerHTML='<main class="login-wrap"><section class="login-card"><h1>ERP Integral</h1><div class="login-error">Não foi possível carregar o ERP. Recarregue a página.</div></section></main>';
  }
})();
