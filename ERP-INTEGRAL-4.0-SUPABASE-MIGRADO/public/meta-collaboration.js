/* ERP Integral - colaboração robusta nas Metas + filtro de profissionais aptos */
(() => {
'use strict';

const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const B=()=>window.ERPIntegralBridge;
const sb=()=>B()?.sb;
const me=()=>B()?.currentUser;
const esc=v=>B()?.esc?.(v)??String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>B()?.uid?.()??crypto.randomUUID();
let lastMetaId=null;
let scheduled=false;
let enhancing=false;

function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-_]/g,' ').replace(/\s+/g,' ').trim()}
function allowedProfessional(u){
  const t=norm(u?.type||u?.role||'');
  return t.includes('projet')||t.includes('topografia')||t.includes('pos protocolo');
}
function userName(id){return B()?.db?.users?.find(u=>u.id===id)?.name||'Usuário';}

// Guarda com segurança qual meta foi clicada.
document.addEventListener('click',e=>{
  const card=e.target.closest?.('[data-meta-card]');
  if(card?.dataset?.metaCard) lastMetaId=card.dataset.metaCard;
},true);

function filterProfessionalsInPage(){
  // Cards de colaboradores da tela Metas.
  qa('[data-meta-user]').forEach(card=>{
    const id=card.dataset.metaUser;
    const u=B()?.db?.users?.find(x=>x.id===id);
    card.hidden=!!u&&!allowedProfessional(u);
  });

  // Formulário Nova/Editar Meta: deixa só os três setores profissionais solicitados.
  const form=q('#metaV2Form');
  if(form){
    qa('input[name="responsavel"]',form).forEach(inp=>{
      const u=B()?.db?.users?.find(x=>x.id===inp.value);
      const row=inp.closest('.check-item')||inp.parentElement;
      if(row) row.hidden=!!u&&!allowedProfessional(u);
      if(u&&!allowedProfessional(u)) inp.checked=false;
    });
    const assoc=q('#metaAssocType',form);
    if(assoc){
      qa('option',assoc).forEach(o=>{if(norm(o.textContent).includes('projeto do erp')||o.value==='projeto')o.remove()});
      if(assoc.value==='projeto'){assoc.value='avulsa';assoc.dispatchEvent(new Event('change',{bubbles:true}))}
    }
  }
}

async function resolveMetaId(modal){
  if(lastMetaId)return lastMetaId;
  const title=q('.modal-head h3',modal)?.textContent?.trim();
  if(!title||!sb())return null;
  const r=await sb().from('metas').select('id').eq('titulo',title).limit(1);
  if(r.error)return null;
  return r.data?.[0]?.id||null;
}

async function loadAccess(metaId){
  const client=sb();
  const [m,r]=await Promise.all([
    client.from('metas').select('id,titulo,created_by,associacao_tipo,associacao_id').eq('id',metaId).maybeSingle(),
    client.from('meta_responsaveis').select('usuario_id').eq('meta_id',metaId)
  ]);
  if(m.error)throw m.error;if(r.error)throw r.error;
  const ids=(r.data||[]).map(x=>x.usuario_id);
  const admin=norm(me()?.type||me()?.role).includes('administrador')||norm(me()?.type||me()?.role).includes('diretor');
  return {meta:m.data,responsibleIds:ids,can:admin||m.data?.created_by===me()?.id||ids.includes(me()?.id)};
}

function missingTable(err){return /does not exist|Could not find the table|schema cache|42P01|PGRST205/i.test(err?.message||'')}

async function loadData(metaId){
  const client=sb();
  const [c,m]=await Promise.all([
    client.from('meta_checklist').select('*').eq('meta_id',metaId).order('created_at'),
    client.from('meta_comentarios').select('*').eq('meta_id',metaId).order('created_at')
  ]);
  if(c.error)throw c.error;if(m.error)throw m.error;
  return {checklist:c.data||[],comments:m.data||[]};
}

async function addHistory(access,acao,descricao){
  if(!access?.meta||!sb())return;
  const meta=access.meta;
  let entities=[];
  if(meta.associacao_tipo==='avulsa')entities=access.responsibleIds.map(id=>({entidade_tipo:'colaborador',entidade_id:id}));
  else entities=[{entidade_tipo:meta.associacao_tipo||'avulsa',entidade_id:meta.associacao_id||null}];
  if(!entities.length)entities=[{entidade_tipo:'avulsa',entidade_id:null}];
  await sb().from('meta_historico').insert(entities.map(x=>({id:uid(),meta_id:meta.id,meta_titulo:meta.titulo,acao,descricao,autor_id:me()?.id||null,...x})));
}

function injectStyles(){
  if(q('#metaCollabStyles'))return;
  const s=document.createElement('style');s.id='metaCollabStyles';s.textContent=`
  .meta-checklist-list,.meta-comments-list{display:grid;gap:8px}.meta-check-item{display:flex;align-items:center;gap:10px;border:1px solid var(--line,#d9e4e2);padding:10px 12px;border-radius:10px;background:#fff}.meta-check-item.done .meta-check-text{text-decoration:line-through;opacity:.62}.meta-check-item input{width:18px;height:18px}.meta-check-text{flex:1;min-width:0}.meta-check-meta{font-size:11px;color:var(--muted,#70807e)}.meta-collab-add{display:flex;gap:8px;margin-top:12px}.meta-collab-add input,.meta-collab-add textarea{flex:1;min-width:0}.meta-comment-item{border-left:3px solid #7bbdb6;background:#f8fbfb;border-radius:0 10px 10px 0;padding:10px 12px}.meta-comment-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:5px}.meta-comment-item p{margin:0;white-space:pre-wrap}.meta-collab-notice{padding:12px;border-radius:10px;background:#fff4d9;color:#79521a}.meta-check-delete{border:0;background:transparent;cursor:pointer;font-size:18px;opacity:.6}.meta-check-delete:hover{opacity:1}@media(max-width:680px){.meta-collab-add{flex-direction:column}.meta-comment-head{flex-direction:column;gap:2px}}
  `;document.head.appendChild(s);
}

function wireTabs(modal){
  qa('[data-v2tab]',modal).forEach(t=>{
    t.onclick=()=>{
      qa('[data-v2tab]',modal).forEach(x=>x.classList.remove('active'));t.classList.add('active');
      qa('[data-v2panel]',modal).forEach(p=>p.classList.toggle('hidden',p.dataset.v2panel!==t.dataset.v2tab));
    };
  });
}

function panelAnchor(modal){return q('.meta-admin-actions',modal)||q('.modal-foot',modal)||q('.metas-tabs',modal)?.nextElementSibling}

function renderChecklist(panel,metaId,items,access){
  panel.innerHTML=`<div class="meta-checklist-list">${items.length?items.map(x=>`<div class="meta-check-item ${x.concluido?'done':''}" data-check-id="${x.id}"><input type="checkbox" ${x.concluido?'checked':''} ${access.can?'':'disabled'}><div class="meta-check-text"><strong>${esc(x.titulo)}</strong>${x.concluido?`<div class="meta-check-meta">Concluído por ${esc(userName(x.concluido_por))}</div>`:''}</div>${access.can?'<button type="button" class="meta-check-delete" title="Excluir">×</button>':''}</div>`).join(''):'<div class="empty compact">Nenhum item no checklist.</div>'}</div>${access.can?'<div class="meta-collab-add"><input id="newMetaChecklistItem" placeholder="Novo item do checklist"><button type="button" class="btn secondary" id="addMetaChecklistItem">Adicionar item</button></div>':'<div class="meta-collab-notice">Checklist disponível para responsáveis e para quem atribuiu a meta.</div>'}`;
  if(!access.can)return;
  qa('.meta-check-item',panel).forEach(row=>{
    q('input',row).onchange=async e=>{const done=e.target.checked;const r=await sb().from('meta_checklist').update({concluido:done,concluido_por:done?me()?.id:null,concluido_em:done?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',row.dataset.checkId).select().single();if(r.error){alert(r.error.message);e.target.checked=!done;return}await addHistory(access,done?'Checklist concluído':'Checklist reaberto',r.data.titulo);await refresh(modalFrom(panel),metaId)};
    q('.meta-check-delete',row)?.addEventListener('click',async()=>{if(!confirm('Excluir este item do checklist?'))return;const r=await sb().from('meta_checklist').delete().eq('id',row.dataset.checkId);if(r.error){alert(r.error.message);return}await addHistory(access,'Checklist removido','Item removido do checklist.');await refresh(modalFrom(panel),metaId)});
  });
  q('#addMetaChecklistItem',panel).onclick=async()=>{const inp=q('#newMetaChecklistItem',panel),titulo=inp.value.trim();if(!titulo)return;const r=await sb().from('meta_checklist').insert({id:uid(),meta_id:metaId,titulo,created_by:me()?.id}).select().single();if(r.error){alert(r.error.message);return}await addHistory(access,'Checklist adicionado',titulo);await refresh(modalFrom(panel),metaId)};
}

function renderComments(panel,metaId,items,access){
  panel.innerHTML=`<div class="meta-comments-list">${items.length?items.map(c=>`<div class="meta-comment-item"><div class="meta-comment-head"><strong>${esc(userName(c.autor_id))}</strong><span class="muted">${new Date(c.created_at).toLocaleString('pt-BR')}</span></div><p>${esc(c.texto)}</p></div>`).join(''):'<div class="empty compact">Nenhum comentário.</div>'}</div>${access.can?'<div class="meta-collab-add"><textarea id="newMetaComment" rows="3" placeholder="Escreva um comentário..."></textarea><button type="button" class="btn secondary" id="addMetaComment">Enviar comentário</button></div>':'<div class="meta-collab-notice">Comentários disponíveis para responsáveis e para quem atribuiu a meta.</div>'}`;
  if(!access.can)return;
  q('#addMetaComment',panel).onclick=async()=>{const t=q('#newMetaComment',panel).value.trim();if(!t)return;const r=await sb().from('meta_comentarios').insert({id:uid(),meta_id:metaId,autor_id:me()?.id,texto:t}).select().single();if(r.error){alert(r.error.message);return}await addHistory(access,'Comentário adicionado',t.length>120?t.slice(0,120)+'…':t);await refresh(modalFrom(panel),metaId)};
}
function modalFrom(el){return el.closest('.modal')}

async function refresh(modal,metaId){
  if(!modal)return;
  qa('[data-v2tab="checklist"],[data-v2tab="comments"],[data-v2tab="collabsetup"]',modal).forEach(x=>x.remove());
  qa('[data-v2panel="checklist"],[data-v2panel="comments"],[data-v2panel="collabsetup"]',modal).forEach(x=>x.remove());
  modal.dataset.collabEnhanced='';
  await enhance(modal,metaId);
}

async function enhance(modal,forcedMetaId=null){
  if(enhancing||!modal||modal.dataset.collabEnhanced==='1'||!q('.metas-tabs',modal))return;
  enhancing=true;
  try{
    const metaId=forcedMetaId||await resolveMetaId(modal);if(!metaId)return;
    const access=await loadAccess(metaId);
    let data;
    try{data=await loadData(metaId)}catch(e){
      if(missingTable(e)){
        const tabs=q('.metas-tabs',modal);
        tabs.insertAdjacentHTML('beforeend','<button class="metas-tab" data-v2tab="collabsetup">Checklist e Comentários</button>');
        const p=document.createElement('div');p.className='metas-tab-panel hidden';p.dataset.v2panel='collabsetup';p.innerHTML='<div class="meta-collab-notice">Checklist e comentários já estão preparados, mas faltam as tabelas no Supabase. Execute o SQL <b>metas_checklist_comentarios.sql</b>.</div>';
        const a=panelAnchor(modal);if(a?.parentNode)a.parentNode.insertBefore(p,a);else q('.modal-body',modal)?.appendChild(p);
        wireTabs(modal);modal.dataset.collabEnhanced='1';return;
      }
      throw e;
    }
    const tabs=q('.metas-tabs',modal);
    tabs.insertAdjacentHTML('beforeend',`<button class="metas-tab" data-v2tab="checklist">Checklist (${data.checklist.length})</button><button class="metas-tab" data-v2tab="comments">Comentários (${data.comments.length})</button>`);
    const p1=document.createElement('div');p1.className='metas-tab-panel hidden';p1.dataset.v2panel='checklist';
    const p2=document.createElement('div');p2.className='metas-tab-panel hidden';p2.dataset.v2panel='comments';
    const a=panelAnchor(modal);if(a?.parentNode){a.parentNode.insertBefore(p1,a);a.parentNode.insertBefore(p2,a)}else q('.modal-body',modal)?.append(p1,p2);
    renderChecklist(p1,metaId,data.checklist,access);renderComments(p2,metaId,data.comments,access);wireTabs(modal);modal.dataset.collabEnhanced='1';
  }catch(e){console.error('Meta colaboração:',e)}finally{enhancing=false}
}

function reconcile(){
  scheduled=false;injectStyles();filterProfessionalsInPage();
  const modal=q('#modal .modal');if(modal&&q('.metas-tabs',modal))enhance(modal);
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(reconcile)}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('erp-bridge-ready',schedule);window.addEventListener('load',schedule);schedule();
})();
