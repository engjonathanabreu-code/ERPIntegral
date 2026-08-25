from pathlib import Path
import subprocess

ROOT='ERP-INTEGRAL-4.0-SUPABASE-MIGRADO'
FILE=f'{ROOT}/public/metas-v2.js'
CSS=f'{ROOT}/public/metas-v2.css'
INDEX=f'{ROOT}/public/index.html'
BASE='1f9f783ef6ca72d8271c6a54e982f87cf6bd17f3'

# Restaura uma base limpa que ja continha OS, setores, metas ativas, observacoes e fluxo de aprovacao.
s=subprocess.check_output(['git','show',f'{BASE}:{FILE}'],text=True)

# Estado nativo de checklist/comentarios.
s=s.replace("files:[]};","files:[],checklist:[],comments:[]};",1)

# Profissionais aptos diretamente no fonte.
marker="const normRole=v=>String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();"
s=s.replace(marker,marker+"\nfunction allowedProfessional(u){const t=normRole(u?.type||u?.role||'');return t.includes('projet')||t.includes('topografia')||t.includes('pos protocolo');}",1)
s=s.replace("db().users.filter(u=>u.active):[currentUser()]","db().users.filter(u=>u.active&&allowedProfessional(u)):[currentUser()]")
s=s.replace("db().users.filter(u=>u.active).map(u=>`<label class=\"check-item\">","db().users.filter(u=>u.active&&allowedProfessional(u)).map(u=>`<label class=\"check-item\">")

# fetchAll passa a carregar checklist e comentarios junto com o restante do modulo.
s=s.replace("const [s,o,oc,m,r,h,f]=await Promise.all([","const [s,o,oc,m,r,h,f,k,c]=await Promise.all([",1)
s=s.replace("client.from('meta_arquivos').select('*').order('created_at',{ascending:false})\n      ]);","client.from('meta_arquivos').select('*').order('created_at',{ascending:false}),\n        client.from('meta_checklist').select('*').order('created_at'),\n        client.from('meta_comentarios').select('*').order('created_at')\n      ]);",1)
s=s.replace("const first=[s,o,oc,m,r,h,f].find(x=>x.error);","const first=[s,o,oc,m,r,h,f,k,c].find(x=>x.error);",1)
s=s.replace("state.files=f.data||[];state.loaded=true;","state.files=f.data||[];state.checklist=k.data||[];state.comments=c.data||[];state.loaded=true;",1)

# Tela inicial passa a exibir ate 15 metas ativas, alem da semana.
needle='<h3 class="section-title">Colaboradores</h3><div class="metas-emp-grid">'
active_section='<section class="card metas2-active-home"><div class="section-head"><div><h3>Metas ativas</h3><p class="muted">Até 15 metas em aberto para acompanhamento rápido.</p></div><button type="button" class="btn small secondary" id="metaActiveAll">Ver todas</button></div>${active.length?`<div class="metas2-card-grid">${active.slice(0,15).map(metaCardHtml).join(\'\')}</div>`:\'<div class="empty compact">Nenhuma meta ativa.</div>\'}</section><h3 class="section-title">Colaboradores</h3><div class="metas-emp-grid">'
s=s.replace(needle,active_section,1)
s=s.replace("wireToolbar();wireMetaCards();qsa('[data-meta-user]')","wireToolbar();qs('#metaActiveAll')?.addEventListener('click',()=>{state.screen='active';renderActive()});wireMetaCards();qsa('[data-meta-user]')",1)

# Setor fica acessivel tambem pelo topo da pagina inicial.
s=s.replace('<button class="btn secondary" id="metaOrders">Ordens de Serviço</button><button class="btn secondary" id="metaActive">Metas Ativas</button>${canManageMeta()?\'<button class="btn" id="metaNew">+ Nova Meta</button>\':\'\'}','<button class="btn secondary" id="metaOrders">Ordens de Serviço</button><button class="btn secondary" id="metaActive">Metas Ativas</button>${canManageSectors()?\'<button class="btn secondary" id="metaSectorQuick">+ Setor</button>\':\'\'}${canManageMeta()?\'<button class="btn" id="metaNew">+ Nova Meta</button>\':\'\'}',1)
s=s.replace("qs('#metaActive')?.addEventListener('click',()=>{state.screen='active';renderActive()});qs('#metaNew')","qs('#metaActive')?.addEventListener('click',()=>{state.screen='active';renderActive()});qs('#metaSectorQuick')?.addEventListener('click',()=>sectorModal());qs('#metaNew')",1)

# Helpers nativos de checklist/comentarios.
helpers=r'''
function checklistItems(metaId){return state.checklist.filter(x=>x.meta_id===metaId)}
function commentItems(metaId){return state.comments.filter(x=>x.meta_id===metaId)}
function canCollaborateMeta(m){return canManageMeta()||m.created_by===currentUser()?.id||metaResponsibles(m.id).includes(currentUser()?.id)}
function checklistPanelHtml(m){const items=checklistItems(m.id),can=canCollaborateMeta(m);return `<div class="meta-checklist-list">${items.length?items.map(x=>`<div class="meta-check-item ${x.concluido?'done':''}" data-check-id="${x.id}"><input type="checkbox" ${x.concluido?'checked':''} ${can?'':'disabled'}><div class="meta-check-text"><strong>${esc(x.titulo)}</strong>${x.concluido?`<div class="meta-check-meta">Concluído por ${esc(userName(x.concluido_por))}</div>`:''}</div>${can?'<button type="button" class="meta-check-delete">×</button>':''}</div>`).join(''):'<div class="empty compact">Nenhum item no checklist.</div>'}</div>${can?'<div class="meta-collab-add"><input id="newMetaChecklistItem" placeholder="Novo item do checklist"><button type="button" class="btn secondary" id="addMetaChecklistItem">Adicionar item</button></div>':''}`}
function commentsPanelHtml(m){const items=commentItems(m.id),can=canCollaborateMeta(m);return `<div class="meta-comments-list">${items.length?items.map(c=>`<div class="meta-comment-item"><div class="meta-comment-head"><strong>${esc(userName(c.autor_id))}</strong><span class="muted">${new Date(c.created_at).toLocaleString('pt-BR')}</span></div><p>${esc(c.texto)}</p></div>`).join(''):'<div class="empty compact">Nenhum comentário.</div>'}</div>${can?'<div class="meta-collab-add"><textarea id="newMetaComment" rows="3" placeholder="Escreva um comentário..."></textarea><button type="button" class="btn secondary" id="addMetaComment">Enviar comentário</button></div>':''}`}
async function reopenMetaDetail(m){await fetchAll();B().closeModal();metaDetail(m.id)}
function wireMetaCollaboration(m){
  if(!canCollaborateMeta(m))return;
  qsa('.meta-check-item').forEach(row=>{const input=qs('input',row);if(!input)return;input.onchange=async()=>{const done=input.checked;const r=await sb().from('meta_checklist').update({concluido:done,concluido_por:done?currentUser().id:null,concluido_em:done?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',row.dataset.checkId).select().single();if(r.error){alert(r.error.message);input.checked=!done;return}await historyAdd(m,{acao:done?'Checklist concluído':'Checklist reaberto',descricao:r.data.titulo});await reopenMetaDetail(m)};qs('.meta-check-delete',row)?.addEventListener('click',async()=>{if(!confirm('Excluir este item do checklist?'))return;const r=await sb().from('meta_checklist').delete().eq('id',row.dataset.checkId);if(r.error){alert(r.error.message);return}await historyAdd(m,{acao:'Checklist removido',descricao:'Item removido do checklist.'});await reopenMetaDetail(m)})});
  qs('#addMetaChecklistItem')?.addEventListener('click',async()=>{const inp=qs('#newMetaChecklistItem'),titulo=inp?.value.trim();if(!titulo)return;const r=await sb().from('meta_checklist').insert({id:uid(),meta_id:m.id,titulo,created_by:currentUser().id}).select().single();if(r.error){alert(r.error.message);return}await historyAdd(m,{acao:'Checklist adicionado',descricao:titulo});await reopenMetaDetail(m)});
  qs('#addMetaComment')?.addEventListener('click',async()=>{const inp=qs('#newMetaComment'),texto=inp?.value.trim();if(!texto)return;const r=await sb().from('meta_comentarios').insert({id:uid(),meta_id:m.id,autor_id:currentUser().id,texto}).select().single();if(r.error){alert(r.error.message);return}await historyAdd(m,{acao:'Comentário adicionado',descricao:texto.length>120?texto.slice(0,120)+'…':texto});await reopenMetaDetail(m)});
}

'''
s=s.replace('function renderLoading()',helpers+'function renderLoading()',1)

# Nova/Editar Meta: checklist inicial aparece junto com Observacoes.
s=s.replace("const m=prefill?.id?prefill:null;const assocType=","const m=prefill?.id?prefill:null;const checklistInicial=m?checklistItems(m.id).filter(x=>!x.concluido).map(x=>x.titulo):[];const assocType=",1)
obs='<div class="field full"><label>Observações</label><textarea name="observacoes" placeholder="Contexto, instruções ou observações da meta">${esc(m?.observacoes||\'\')}</textarea></div>'
check='<div class="field full"><label>Checklist</label><textarea name="checklist" rows="4" placeholder="Digite um item por linha">${esc(checklistInicial.join(\'\\n\'))}</textarea><small class="muted">Cada linha vira um item marcável dentro da meta.</small></div>'
s=s.replace(obs,obs+check,1)

# Ao salvar, atualiza itens nao concluidos e preserva os concluidos.
target="const ins=await sb().from('meta_responsaveis').insert(responsaveis.map(usuario_id=>({meta_id:id,usuario_id})));if(ins.error){alert(ins.error.message);return}"
addition=target+"const checklist=String(fd.get('checklist')||'').split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);const delCk=await sb().from('meta_checklist').delete().eq('meta_id',id).eq('concluido',false);if(delCk.error){alert(delCk.error.message);return}if(checklist.length){const ckIns=await sb().from('meta_checklist').insert(checklist.map(titulo=>({id:uid(),meta_id:id,titulo,created_by:currentUser().id})));if(ckIns.error){alert(ckIns.error.message);return}}"
s=s.replace(target,addition,1)

# Detalhe da meta: tabs nativas para Arquivos, Historico, Checklist e Comentarios.
s=s.replace('<button class="metas-tab" data-v2tab="history">Histórico (${hist.length})</button>','<button class="metas-tab" data-v2tab="history">Histórico (${hist.length})</button><button class="metas-tab" data-v2tab="checklist">Checklist (${checklistItems(m.id).length})</button><button class="metas-tab" data-v2tab="comments">Comentários (${commentItems(m.id).length})</button>',1)
s=s.replace('<div class="metas-tab-panel hidden" data-v2panel="history">${historyHtml(hist)}</div>${editable?', '<div class="metas-tab-panel hidden" data-v2panel="history">${historyHtml(hist)}</div><div class="metas-tab-panel hidden" data-v2panel="checklist">${checklistPanelHtml(m)}</div><div class="metas-tab-panel hidden" data-v2panel="comments">${commentsPanelHtml(m)}</div>${editable?',1)
s=s.replace("qsa('[data-open-meta-file]').forEach(b=>b.onclick=()=>openMetaFile(state.files.find(f=>f.id===b.dataset.openMetaFile)))}","qsa('[data-open-meta-file]').forEach(b=>b.onclick=()=>openMetaFile(state.files.find(f=>f.id===b.dataset.openMetaFile)));wireMetaCollaboration(m)}",1)

Path(FILE).write_text(s)

# CSS necessario para checklist e cards compactos.
c=Path(CSS); css=c.read_text()
extra='''\n.meta-checklist-list,.meta-comments-list{display:grid;gap:8px}.meta-check-item{display:flex;align-items:center;gap:10px;border:1px solid var(--line,#d9e4e2);padding:10px 12px;border-radius:10px;background:#fff}.meta-check-item.done .meta-check-text{text-decoration:line-through;opacity:.62}.meta-check-item input{width:18px;height:18px}.meta-check-text{flex:1;min-width:0}.meta-check-meta{font-size:11px;color:var(--muted,#70807e)}.meta-collab-add{display:flex;gap:8px;margin-top:12px}.meta-collab-add input,.meta-collab-add textarea{flex:1;min-width:0}.meta-comment-item{border-left:3px solid #7bbdb6;background:#f8fbfb;border-radius:0 10px 10px 0;padding:10px 12px}.meta-comment-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:5px}.meta-comment-item p{margin:0;white-space:pre-wrap}.meta-check-delete{border:0;background:transparent;cursor:pointer;font-size:18px;opacity:.6}.metas2-active-home{margin-top:14px}.metas2-card-grid{grid-template-columns:repeat(auto-fill,minmax(185px,1fr))}.metas2-card{min-height:0;padding:12px}.metas2-card p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n'''
if '.meta-checklist-list' not in css: css+=extra
c.write_text(css)

# Forca navegador a carregar a versao corrigida.
i=Path(INDEX); t=i.read_text()
for old,new in [('metas-v2.css?v=16','metas-v2.css?v=18'),('metas-v2.css?v=17','metas-v2.css?v=18'),('metas-v2.js?v=16','metas-v2.js?v=18'),('metas-v2.js?v=17','metas-v2.js?v=18')]: t=t.replace(old,new)
i.write_text(t)
