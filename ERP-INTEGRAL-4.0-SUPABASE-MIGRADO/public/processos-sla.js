(() => {
'use strict';
if(window.ERPProcessosSLA)return; window.ERPProcessosSLA=true;
const bridge=()=>window.ERPIntegralBridge;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let configs=new Map(), rows=new Map(), loading=false, lastLoad=0;
function businessDays(start,end=new Date()){
  let a=new Date(start); if(Number.isNaN(a.getTime()))return 0; a.setHours(0,0,0,0);
  const b=new Date(end); b.setHours(0,0,0,0); let n=0;
  while(a<b){a.setDate(a.getDate()+1);const d=a.getDay();if(d!==0&&d!==6)n++;}
  return n;
}
function effectiveDays(p){
  const start=p.sla_ultima_acao_em||p.etapa_iniciada_em||p.updated_at||p.created_at;
  const end=p.sla_pausado&&p.sla_pausado_em?new Date(p.sla_pausado_em):new Date();
  let d=businessDays(start,end);
  d=Math.max(0,d-Math.floor(Number(p.sla_pausa_acumulada_minutos||0)/(60*24)));
  return d;
}
function info(p){
  if(!p||p.etapa_atual==='Concluído')return null;
  const cfg=configs.get(p.etapa_atual); if(!cfg)return null;
  const used=effectiveDays(p), limit=Number(cfg.sla_dias_uteis), ratio=limit?used/limit:0;
  const status=p.sla_pausado?'paused':ratio>=1?'late':ratio>=.7?'warn':'ok';
  return {used,limit,status,left:Math.max(0,limit-used),type:cfg.tipo};
}
async function load(force=false){
  const sb=bridge()?.sb;if(!sb||loading||(!force&&Date.now()-lastLoad<10000))return;
  loading=true;try{
    const [c,p]=await Promise.all([sb.from('processos_sla_config').select('*').eq('ativo',true),sb.from('processos_kanban').select('id,etapa_atual,etapa_iniciada_em,created_at,updated_at,sla_pausado,sla_pausado_em,sla_pausa_acumulada_minutos,sla_motivo_pausa,sla_ultima_acao_em').eq('ativo',true)]);
    if(c.error)throw c.error;if(p.error)throw p.error;
    configs=new Map((c.data||[]).map(x=>[x.etapa,x]));rows=new Map((p.data||[]).map(x=>[x.id,x]));lastLoad=Date.now();decorate();
  }catch(e){console.warn('SLA processos',e)}finally{loading=false;}
}
function badge(i){
  const text=i.status==='paused'?'SLA pausado':i.status==='late'?`SLA vencido · +${Math.max(0,i.used-i.limit)}d`:i.status==='warn'?`SLA atenção · ${i.left}d`:`SLA · ${i.left}d`;
  return `<span class="sla-badge sla-${i.status}" title="${i.used} de ${i.limit} dias úteis consumidos">${text}</span>`;
}
function decorateCards(){
  document.querySelectorAll('.process-card[data-process-id]').forEach(card=>{
    const p=rows.get(card.dataset.processId),i=info(p);let el=card.querySelector('.sla-badge');
    if(!i){el?.remove();return;} if(el)el.outerHTML=badge(i);else card.insertAdjacentHTML('beforeend',badge(i));
  });
}
function decorateSummary(){
  const host=document.querySelector('.process-kpis');if(!host)return;
  const visible=[...document.querySelectorAll('.process-card[data-process-id]')].map(x=>rows.get(x.dataset.processId)).filter(Boolean);
  const stats=visible.map(info).filter(Boolean);const late=stats.filter(x=>x.status==='late').length,warn=stats.filter(x=>x.status==='warn').length,ok=stats.filter(x=>x.status==='ok').length;
  let box=document.querySelector('#slaProcessSummary');if(!box){box=document.createElement('article');box.id='slaProcessSummary';host.appendChild(box);}
  box.className=late?'warn':'';box.innerHTML=`<span>Saúde do SLA</span><strong>${late} vencido${late===1?'':'s'}</strong><small>${ok} no prazo · ${warn} atenção</small>`;
}
function decorateModal(){
  const modal=document.querySelector('#processModal');if(!modal)return;
  const id=modal.querySelector('.process-card[data-process-id]')?.dataset.processId||document.querySelector('.process-card[draggable="true"].dragging')?.dataset.processId;
  let pid=modal.dataset.slaProcessId;
  if(!pid){const title=modal.querySelector('.modal-head h3')?.textContent?.trim();const match=[...rows.values()].find(p=>document.querySelector(`.process-card[data-process-id="${p.id}"] strong`)?.textContent?.trim()===title);pid=match?.id;if(pid)modal.dataset.slaProcessId=pid;}
  const p=rows.get(pid);const i=info(p);if(!p||!i)return;
  let panel=modal.querySelector('#processSlaPanel');if(!panel){panel=document.createElement('section');panel.id='processSlaPanel';panel.className='process-sla-panel';const grid=modal.querySelector('.process-detail-grid');grid?.insertAdjacentElement('afterend',panel);}
  const label=i.type==='acompanhamento'?'SLA de acompanhamento':'SLA da etapa';
  panel.innerHTML=`<div><small>${label}</small><strong>${i.limit} dias úteis</strong></div><div><small>Consumido</small><strong>${i.used} dias</strong></div><div><small>Status</small>${badge(i)}</div><button id="slaPauseBtn" class="btn secondary">${p.sla_pausado?'Retomar SLA':'Pausar SLA'}</button>${p.sla_pausado&&p.sla_motivo_pausa?`<p>Motivo: ${esc(p.sla_motivo_pausa)}</p>`:''}`;
  panel.querySelector('#slaPauseBtn').onclick=()=>togglePause(p);
}
async function togglePause(p){
  const sb=bridge()?.sb;if(!sb)return;
  const now=new Date();let patch={};
  if(!p.sla_pausado){const motivo=prompt('Motivo da pausa do SLA (cliente, prefeitura, cartório ou terceiro):');if(!motivo)return;patch={sla_pausado:true,sla_pausado_em:now.toISOString(),sla_motivo_pausa:motivo};}
  else {const started=new Date(p.sla_pausado_em);const mins=Math.max(0,Math.round((now-started)/60000));patch={sla_pausado:false,sla_pausado_em:null,sla_motivo_pausa:null,sla_pausa_acumulada_minutos:Number(p.sla_pausa_acumulada_minutos||0)+mins};}
  const {error}=await sb.from('processos_kanban').update(patch).eq('id',p.id);if(error){alert('Não foi possível atualizar o SLA: '+error.message);return;}await load(true);
}
function decorate(){decorateCards();decorateSummary();decorateModal();}
let q=false;new MutationObserver(()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;decorate();load();});}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('erp-bridge-ready',()=>load(true));setTimeout(()=>load(true),800);
})();