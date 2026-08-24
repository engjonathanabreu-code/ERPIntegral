/* ERP Integral - fluxo de conclusão de metas com aprovação */
(() => {
'use strict';

const B=()=>window.ERPIntegralBridge;
const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const sb=()=>B()?.sb;
const me=()=>B()?.currentUser;
const db=()=>B()?.db||{users:[]};
const uid=()=>B()?.uid?.()??crypto.randomUUID();
const esc=v=>B()?.esc?.(v)??String(v??'');

let metas=[];
let responsibles=[];
let loading=false;
let loadedAt=0;
let reconcileScheduled=false;

function norm(v=''){
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
}
function isApproverUser(user=me()){
  const r=norm(user?.type||user?.role||'');
  return r==='administrador'||r==='diretor de projetos';
}
function metaById(id){return metas.find(m=>String(m.id)===String(id));}
function responsibleIds(metaId){return responsibles.filter(r=>String(r.meta_id)===String(metaId)).map(r=>String(r.usuario_id));}
function isResponsible(m){return !!m&&responsibleIds(m.id).includes(String(me()?.id));}
function isPending(m){return norm(m?.status)==='aguardando aprovacao';}
function isClosed(m){return ['concluido','cancelado'].includes(norm(m?.status));}
function canRequest(m){return !!m&&!isClosed(m)&&!isPending(m)&&isResponsible(m)&&!isApproverUser();}
function canApprove(m){return !!m&&isPending(m)&&isApproverUser()&&String(m.created_by||'')===String(me()?.id||'');}
function creatorName(m){return db().users?.find(u=>String(u.id)===String(m?.created_by))?.name||'quem atribuiu a meta';}

async function loadData(force=false){
  const client=sb();if(!client||loading)return;
  if(!force&&Date.now()-loadedAt<1500)return;
  loading=true;
  try{
    const [m,r]=await Promise.all([
      client.from('metas').select('id,titulo,status,created_by,associacao_tipo,associacao_id'),
      client.from('meta_responsaveis').select('meta_id,usuario_id')
    ]);
    if(m.error)throw m.error;if(r.error)throw r.error;
    metas=m.data||[];responsibles=r.data||[];loadedAt=Date.now();
  }catch(e){console.warn('Fluxo de aprovação de metas:',e)}finally{loading=false;}
}

async function addHistory(m,acao,descricao){
  if(!m||!sb())return;
  let entities=[];
  if(m.associacao_tipo==='avulsa')entities=responsibleIds(m.id).map(id=>({entidade_tipo:'colaborador',entidade_id:id}));
  else entities=[{entidade_tipo:m.associacao_tipo||'avulsa',entidade_id:m.associacao_id||null}];
  if(!entities.length)entities=[{entidade_tipo:'avulsa',entidade_id:null}];
  const rows=entities.map(x=>({id:uid(),meta_id:m.id,meta_titulo:m.titulo,acao,descricao,autor_id:me()?.id||null,...x}));
  const r=await sb().from('meta_historico').insert(rows);
  if(r.error)console.warn('Histórico da conclusão da meta:',r.error);
}

async function refresh(){
  loadedAt=0;
  await loadData(true);
  if(window.ERPMetasV2?.refresh)await window.ERPMetasV2.refresh();
  scheduleReconcile();
}

async function requestConclusion(m){
  if(!canRequest(m))return;
  const ok=confirm(`Solicitar a conclusão da meta “${m.titulo}”?\n\nEla só será considerada concluída após a aprovação de ${creatorName(m)}.`);
  if(!ok)return;
  const r=await sb().from('metas').update({status:'Aguardando aprovação',updated_at:new Date().toISOString()}).eq('id',m.id).select().single();
  if(r.error){alert(`Não foi possível solicitar a conclusão: ${r.error.message}`);return;}
  await addHistory(m,'Conclusão solicitada',`${me()?.name||'Colaborador'} marcou a meta como pronta. Aguardando aprovação de ${creatorName(m)}.`);
  await refresh();
}

async function approveConclusion(m){
  if(!canApprove(m))return;
  const ok=confirm(`Aprovar a conclusão da meta “${m.titulo}”?`);
  if(!ok)return;
  const r=await sb().from('metas').update({status:'Concluído',updated_at:new Date().toISOString()}).eq('id',m.id).select().single();
  if(r.error){alert(`Não foi possível aprovar a conclusão: ${r.error.message}`);return;}
  await addHistory(m,'Conclusão aprovada',`${me()?.name||'Responsável'} aprovou a conclusão. A meta foi considerada concluída pelo sistema.`);
  await refresh();
}

function actionHtml(m){
  if(canRequest(m))return '<span class="meta-conclusion-action request" role="button" tabindex="0" data-request-meta>Concluir</span>';
  if(canApprove(m))return '<span class="meta-conclusion-action approve" role="button" tabindex="0" data-approve-meta>Aprovar conclusão</span>';
  if(isPending(m)&&isResponsible(m))return '<span class="meta-conclusion-pending">Aguardando aprovação</span>';
  return '';
}

function decorateCards(){
  qsa('[data-meta-card]').forEach(card=>{
    const m=metaById(card.dataset.metaCard);if(!m)return;
    card.querySelector('.meta-conclusion-row')?.remove();
    const html=actionHtml(m);if(!html)return;
    const row=document.createElement('div');row.className='meta-conclusion-row';row.innerHTML=html;card.appendChild(row);
    const req=row.querySelector('[data-request-meta]');
    const app=row.querySelector('[data-approve-meta]');
    const stop=e=>{e.preventDefault();e.stopPropagation();};
    if(req){req.onclick=e=>{stop(e);requestConclusion(m)};req.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){stop(e);requestConclusion(m)}};}
    if(app){app.onclick=e=>{stop(e);approveConclusion(m)};app.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){stop(e);approveConclusion(m)}};}
  });
}

function decorateDetail(){
  const modal=qs('#modal .modal');if(!modal)return;
  const title=qs('.modal-head h3',modal)?.textContent?.trim();
  if(!title)return;
  const m=metas.find(x=>x.titulo===title);if(!m)return;
  modal.querySelector('.meta-conclusion-detail')?.remove();
  let html='';
  if(canRequest(m))html='<button type="button" class="btn meta-conclusion-detail" id="metaRequestConclusion">Concluir</button>';
  else if(canApprove(m))html='<button type="button" class="btn meta-conclusion-detail" id="metaApproveConclusion">Aprovar conclusão</button>';
  else if(isPending(m)&&isResponsible(m))html='<div class="notice meta-conclusion-detail">Conclusão enviada. Aguardando aprovação de quem atribuiu a meta.</div>';
  if(!html)return;
  const host=modal.querySelector('.meta-admin-actions')||modal.querySelector('.modal-body');
  if(!host)return;
  if(host.classList.contains('meta-admin-actions'))host.insertAdjacentHTML('afterbegin',html);else host.insertAdjacentHTML('beforeend',html);
  qs('#metaRequestConclusion',modal)?.addEventListener('click',()=>requestConclusion(m));
  qs('#metaApproveConclusion',modal)?.addEventListener('click',()=>approveConclusion(m));
}

function injectStyles(){
  if(qs('#metaConclusionApprovalStyles'))return;
  const s=document.createElement('style');s.id='metaConclusionApprovalStyles';s.textContent=`
  .meta-conclusion-row{display:flex;align-items:center;justify-content:flex-end;margin-top:7px;padding-top:9px;border-top:1px solid var(--line,#dfe7e6)}
  .meta-conclusion-action{display:inline-flex;align-items:center;justify-content:center;border-radius:9px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;user-select:none;line-height:1.2}
  .meta-conclusion-action.request{background:#0f6b65;color:#fff}.meta-conclusion-action.request:hover{filter:brightness(.94)}
  .meta-conclusion-action.approve{background:#e6f4f1;color:#075b55;border:1px solid #98cbc5}.meta-conclusion-action.approve:hover{background:#d8eeea}
  .meta-conclusion-pending{font-size:12px;font-weight:700;color:#8a6516;background:#fff6d9;border:1px solid #ead79c;border-radius:9px;padding:6px 10px}
  `;document.head.appendChild(s);
}

async function reconcile(){
  reconcileScheduled=false;injectStyles();await loadData();decorateCards();decorateDetail();
}
function scheduleReconcile(){if(reconcileScheduled)return;reconcileScheduled=true;requestAnimationFrame(reconcile)}
new MutationObserver(scheduleReconcile).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('erp-bridge-ready',()=>{loadedAt=0;scheduleReconcile()});
window.addEventListener('load',scheduleReconcile);
scheduleReconcile();
})();
