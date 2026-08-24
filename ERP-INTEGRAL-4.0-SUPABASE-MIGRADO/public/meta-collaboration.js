/* ERP Integral - colaboração dentro do card de Meta */
(() => {
'use strict';

const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const B=()=>window.ERPIntegralBridge;
const sb=()=>B()?.sb;
const currentUser=()=>B()?.currentUser;
const esc=v=>B()?.esc?.(v)??String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>B()?.uid?.()??crypto.randomUUID();
let lastMetaId=null;
let enhancing=false;

// Guarda a meta clicada antes do módulo principal abrir o modal.
document.addEventListener('click',e=>{
  const card=e.target.closest?.('[data-meta-card]');
  if(card?.dataset.metaCard) lastMetaId=card.dataset.metaCard;
},true);

function userName(id){return B()?.db?.users?.find(u=>u.id===id)?.name||'Usuário';}

async function loadMetaAccess(metaId){
  const client=sb(); if(!client)throw new Error('Supabase indisponível.');
  const [m,r]=await Promise.all([
    client.from('metas').select('id,titulo,created_by').eq('id',metaId).maybeSingle(),
    client.from('meta_responsaveis').select('usuario_id').eq('meta_id',metaId)
  ]);
  if(m.error)throw m.error;if(r.error)throw r.error;
  const meta=m.data;if(!meta)throw new Error('Meta não encontrada.');
  const me=currentUser()?.id;
  const responsibleIds=(r.data||[]).map(x=>x.usuario_id);
  return {meta,responsibleIds,canCollaborate:meta.created_by===me||responsibleIds.includes(me)};
}

async function addHistory(metaId,acao,descricao){
  const client=sb();if(!client)return;
  const meta=(await client.from('metas').select('titulo,associacao_tipo,associacao_id').eq('id',metaId).maybeSingle()).data;
  if(!meta)return;
  let entities=[];
  if(meta.associacao_tipo==='avulsa'){
    const rr=await client.from('meta_responsaveis').select('usuario_id').eq('meta_id',metaId);
    entities=(rr.data||[]).map(x=>({entidade_tipo:'colaborador',entidade_id:x.usuario_id}));
  }else entities=[{entidade_tipo:meta.associacao_tipo||'avulsa',entidade_id:meta.associacao_id||null}];
  if(!entities.length)entities=[{entidade_tipo:'avulsa',entidade_id:null}];
  const rows=entities.map(ent=>({id:uid(),meta_id:metaId,meta_titulo:meta.titulo,acao,descricao,autor_id:currentUser()?.id||null,...ent}));
  const x=await client.from('meta_historico').insert(rows);if(x.error)console.warn('Histórico da meta:',x.error);
}

function missingTable(err){return /does not exist|Could not find the table|42P01/i.test(err?.message||'');}

async function loadCollab(metaId){
  const client=sb();
  const [ck,cm]=await Promise.all([
    client.from('meta_checklist').select('*').eq('meta_id',metaId).order('created_at'),
    client.from('meta_comentarios').select('*').eq('meta_id',metaId).order('created_at')
  ]);
  const err=ck.error||cm.error;if(err)throw err;
  return {checklist:ck.data||[],comments:cm.data||[]};
}

function ensureStyles(){
  if(q('#metaCollabStyles'))return;
  const s=document.createElement('style');s.id='metaCollabStyles';s.textContent=`
  .meta-checklist-list,.meta-comments-list{display:grid;gap:8px}.meta-check-item{display:flex;align-items:center;gap:10px;border:1px solid var(--line,#d9e4e2);padding:10px 12px;border-radius:10px;background:#fff}.meta-check-item.done .meta-check-text{text-decoration:line-through;opacity:.62}.meta-check-item input{width:18px;height:18px;flex:0 0 auto}.meta-check-text{flex:1;min-width:0}.meta-check-meta{font-size:11px;color:var(--muted,#70807e)}.meta-collab-add{display:flex;gap:8px;margin-top:12px}.meta-collab-add input,.meta-collab-add textarea{flex:1;min-width:0}.meta-comment-item{border-left:3px solid #7bbdb6;background:#f8fbfb;border-radius:0 10px 10px 0;padding:10px 12px}.meta-comment-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:5px}.meta-comment-item p{margin:0;white-space:pre-wrap}.meta-collab-notice{padding:12px;border-radius:10px;background:#fff4d9;color:#79521a}.meta-check-delete{border:0;background:transparent;cursor:pointer;font-size:18px;opacity:.55}.meta-check-delete:hover{opacity:1}@media(max-width:680px){.meta-collab-add{flex-direction:column}.meta-comment-head{flex-direction:column;gap:2px}}
  `;document.head.appendChild(s);
}

function tabButton(name,label,count){return `<button class="metas-tab" data-v2tab="${name}">${label} (${count})</button>`;}

async function enhanceMetaModal(modal,metaId){
  if(enhancing||!modal||modal.dataset.collabEnhanced==='1')return;
  enhancing=true;
  try{
    const access=await loadMetaAccess(metaId);
    let data;
    try{data=await loadCollab(metaId)}catch(e){
      if(missingTable(e)){
        const tabs=q('.metas-tabs',modal);if(tabs){
          tabs.insertAdjacentHTML('beforeend',tabButton('collabsetup','Checklist/Comentários',0));
          const actions=q('.meta-admin-actions',modal);
          const panel=document.createElement('div');panel.className='metas-tab-panel hidden';panel.dataset.v2panel='collabsetup';panel.innerHTML='<div class="meta-collab-notice">Checklist e comentários estão prontos no ERP, mas faltam as tabelas no Supabase. Execute <b>supabase/metas_checklist_comentarios.sql</b> uma vez.</div>';
          (actions||tabs).before?.(panel);wireTabs(modal);
        }
        modal.dataset.collabEnhanced='1';return;
      }
      throw e;
    }
    const tabs=q('.metas-tabs',modal);if(!tabs)return;
    tabs.insertAdjacentHTML('beforeend',tabButton('checklist','Checklist',data.checklist.length)+tabButton('comments','Comentários',data.comments.length));
    const actions=q('.meta-admin-actions',modal);
    const checklistPanel=document.createElement('div');checklistPanel.className='metas-tab-panel hidden';checklistPanel.dataset.v2panel='checklist';
    const commentsPanel=document.createElement('div');commentsPanel.className='metas-tab-panel hidden';commentsPanel.dataset.v2panel='comments';
    const anchor=actions||tabs.nextElementSibling;
    if(actions){actions.before(checklistPanel,commentsPanel)}else{modal.querySelector('.modal-body')?.append(checklistPanel,commentsPanel)}
    renderChecklist(checklistPanel,metaId,data.checklist,access);
    renderComments(commentsPanel,metaId,data.comments,access);
    wireTabs(modal);
    modal.dataset.collabEnhanced='1';
  }catch(e){console.error('Colaboração da meta:',e)}finally{enhancing=false;}
}

function wireTabs(modal){
  qa('[data-v2tab]',modal).forEach(t=>t.onclick=()=>{
    qa('[data-v2tab]',modal).forEach(x=>x.classList.remove('active'));t.classList.add('active');
    qa('[data-v2panel]',modal).forEach(p=>p.classList.toggle('hidden',p.dataset.v2panel!==t.dataset.v2tab));
  });
}

function renderChecklist(panel,metaId,items,access){
  const can=access.canCollaborate;
  panel.innerHTML=`<div class="meta-checklist-list">${items.length?items.map(x=>`<div class="meta-check-item ${x.concluido?'done':''}" data-check-id="${x.id}"><input type="checkbox" ${x.concluido?'checked':''} ${can?'':'disabled'}><div class="meta-check-text"><strong>${esc(x.titulo)}</strong>${x.concluido?`<div class="meta-check-meta">Concluído por ${esc(userName(x.concluido_por))}</div>`:''}</div>${can?'<button type="button" class="meta-check-delete" title="Excluir item">×</button>':''}</div>`).join(''):'<div class="empty compact">Nenhum item no checklist.</div>'}</div>${can?'<div class="meta-collab-add"><input id="newMetaChecklistItem" placeholder="Novo item do checklist"><button type="button" class="btn secondary" id="addMetaChecklistItem">Adicionar</button></div>':'<div class="meta-collab-notice">Checklist disponível apenas para o responsável da meta e para quem a atribuiu.</div>'}`;
  if(!can)return;
  qa('.meta-check-item',panel).forEach(row=>{
    q('input',row).onchange=async e=>{
      const done=e.target.checked,payload={concluido:done,concluido_por:done?currentUser().id:null,concluido_em:done?new Date().toISOString():null,updated_at:new Date().toISOString()};
      const r=await sb().from('meta_checklist').update(payload).eq('id',row.dataset.checkId).select().single();if(r.error){alert(r.error.message);e.target.checked=!done;return}await addHistory(metaId,done?'Checklist concluído':'Checklist reaberto',r.data.titulo);refreshCurrentModal(metaId);
    };
    q('.meta-check-delete',row)?.addEventListener('click',async()=>{if(!confirm('Excluir este item do checklist?'))return;const r=await sb().from('meta_checklist').delete().eq('id',row.dataset.checkId);if(r.error){alert(r.error.message);return}await addHistory(metaId,'Checklist removido','Item removido do checklist.');refreshCurrentModal(metaId);});
  });
  q('#addMetaChecklistItem',panel).onclick=async()=>{const inp=q('#newMetaChecklistItem',panel),titulo=inp.value.trim();if(!titulo)return;const r=await sb().from('meta_checklist').insert({id:uid(),meta_id:metaId,titulo,created_by:currentUser().id}).select().single();if(r.error){alert(r.error.message);return}await addHistory(metaId,'Checklist adicionado',titulo);refreshCurrentModal(metaId);};
}

function renderComments(panel,metaId,comments,access){
  const can=access.canCollaborate;
  panel.innerHTML=`<div class="meta-comments-list">${comments.length?comments.map(c=>`<div class="meta-comment-item"><div class="meta-comment-head"><strong>${esc(userName(c.autor_id))}</strong><span class="muted">${new Date(c.created_at).toLocaleString('pt-BR')}</span></div><p>${esc(c.texto)}</p></div>`).join(''):'<div class="empty compact">Nenhum comentário.</div>'}</div>${can?'<div class="meta-collab-add"><textarea id="newMetaComment" rows="3" placeholder="Escreva um comentário..."></textarea><button type="button" class="btn secondary" id="addMetaComment">Enviar comentário</button></div>':'<div class="meta-collab-notice">Comentários disponíveis apenas para o responsável da meta e para quem a atribuiu.</div>'}`;
  if(!can)return;
  q('#addMetaComment',panel).onclick=async()=>{const txt=q('#newMetaComment',panel).value.trim();if(!txt)return;const r=await sb().from('meta_comentarios').insert({id:uid(),meta_id:metaId,autor_id:currentUser().id,texto:txt}).select().single();if(r.error){alert(r.error.message);return}await addHistory(metaId,'Comentário adicionado',txt.length>120?txt.slice(0,120)+'…':txt);refreshCurrentModal(metaId);};
}

function refreshCurrentModal(metaId){
  const modal=qa('.modal-backdrop .modal').find(m=>q('.metas-tabs',m));if(!modal)return;
  modal.dataset.collabEnhanced='0';
  qa('[data-v2tab="checklist"],[data-v2tab="comments"],[data-v2tab="collabsetup"]',modal).forEach(x=>x.remove());
  qa('[data-v2panel="checklist"],[data-v2panel="comments"],[data-v2panel="collabsetup"]',modal).forEach(x=>x.remove());
  enhanceMetaModal(modal,metaId);
}

function scan(){
  ensureStyles();
  if(!lastMetaId)return;
  const modal=qa('.modal-backdrop .modal').find(m=>q('.metas-tabs',m));
  if(modal)enhanceMetaModal(modal,lastMetaId);
}
const observer=new MutationObserver(scan);observer.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(scan,0);
})();
