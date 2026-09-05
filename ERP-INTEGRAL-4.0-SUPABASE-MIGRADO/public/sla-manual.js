(() => {
'use strict';
if (window.ERPManualSLA) return;
window.ERPManualSLA = true;
const B=()=>window.ERPIntegralBridge;
const sb=()=>B()?.sb;
const br=v=>v?new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR'):'—';
const esc=v=>B()?.esc?.(v)??String(v??'');
let processMap=new Map();
async function loadProcesses(){const c=sb();if(!c)return;const {data,error}=await c.from('processos_kanban').select('id,nucleo,municipio,sla_prazo');if(!error)processMap=new Map((data||[]).map(x=>[x.id,x]));}
function decorateCards(){document.querySelectorAll('.process-card[data-process-id]').forEach(card=>{card.querySelector('.manual-sla-badge')?.remove();const p=processMap.get(card.dataset.processId);if(!p?.sla_prazo)return;const el=document.createElement('div');el.className='manual-sla-badge';el.textContent=`SLA ${br(p.sla_prazo)}`;card.appendChild(el);});}
async function patchProcessModal(){const modal=document.querySelector('#processModal');if(!modal||modal.dataset.manualSla)return;modal.dataset.manualSla='1';const title=modal.querySelector('.modal-head h3')?.textContent?.trim();const city=(modal.querySelector('.modal-head small')?.textContent||'').split('/')[0].trim();if(!title)return;const c=sb();if(!c)return;let q=c.from('processos_kanban').select('id,sla_prazo').eq('nucleo',title);if(city)q=q.eq('municipio',city);const {data}=await q.limit(1).maybeSingle();if(!data)return;const grid=modal.querySelector('.process-detail-grid');if(!grid)return;const wrap=document.createElement('label');wrap.className='manual-sla-field';wrap.innerHTML=`SLA (opcional)<input id="pdManualSla" type="date" value="${data.sla_prazo||''}"><small>Sem data, este processo fica sem SLA.</small>`;grid.appendChild(wrap);modal.querySelector('#pdSave')?.addEventListener('click',async()=>{const value=modal.querySelector('#pdManualSla')?.value||null;const {error}=await c.from('processos_kanban').update({sla_prazo:value,updated_at:new Date().toISOString()}).eq('id',data.id);if(!error){data.sla_prazo=value;processMap.set(data.id,{...processMap.get(data.id),sla_prazo:value});setTimeout(decorateCards,120);}});}
let queued=false;function reconcile(){if(queued)return;queued=true;requestAnimationFrame(async()=>{queued=false;await patchProcessModal();decorateCards();});}
new MutationObserver(reconcile).observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',async()=>{await loadProcesses();reconcile();});setInterval(async()=>{if(document.querySelector('.process-card')){await loadProcesses();decorateCards();}},60000);
})();

