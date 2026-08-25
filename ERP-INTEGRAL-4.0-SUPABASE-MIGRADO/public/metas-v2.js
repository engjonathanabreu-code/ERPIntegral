(() => {
'use strict';

const B=()=>window.ERPIntegralBridge;
const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const STAGES=['Topografia','Projetos','Protocolado Prefeitura','Protocolo ORI','Diligencia Documental','Diligencia Topografia','Diligencia Projetos','Diligencia Jurídico','Diligencia Pós Protocolo'];
const STATES=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const META_STATUS=['Em andamento','Concluído','Cancelado'];
const state={loaded:false,loading:false,error:null,screen:'home',weekOffset:0,selectedUser:null,sectors:[],orders:[],orderComments:[],metas:[],responsibles:[],history:[],files:[],checklist:[],comments:[]};
let fetchPromise=null;
const esc=v=>B()?.esc?.(v)??String(v??'');
const brDate=v=>B()?.brDate?.(v)??v;
const uid=()=>B()?.uid?.()??crypto.randomUUID();
const today=()=>B()?.today?.()??new Date().toISOString().slice(0,10);
const sb=()=>B()?.sb;
const currentUser=()=>B()?.currentUser;
const db=()=>B()?.db||{users:[],projects:[],plans:[]};
const userName=id=>db().users.find(u=>u.id===id)?.name||'Usuário';
const projectName=id=>db().projects.find(p=>p.id===id)?.name||'Projeto';
const planName=id=>db().plans.find(p=>p.id===id)?.title||'Plano de trabalho';
const roleName=()=>String(currentUser()?.type||currentUser()?.role||document.querySelector('.topbar .badge')?.textContent||document.querySelector('.user-mini')?.textContent||'').trim();
const isType=(...types)=>{const r=roleName().toLowerCase();return types.some(t=>r===String(t).toLowerCase()||r.includes(String(t).toLowerCase()));};
const canManageMeta=()=>isType('Administrador','Diretor Técnico','Diretor de Projetos','Pós-protocolo','Pós Protocolo');
const canManageOS=()=>isType('Administrador','Diretor de Projetos','Pós-protocolo','Pós Protocolo');
const canManageSectors=()=>canManageMeta();
const normRole=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function allowedProfessional(u){const t=normRole(u?.type||u?.role||'');return t.includes('projet')||t.includes('topografia')||t.includes('pos protocolo');}
const isMetaApprover=()=>['administrador','diretor tecnico','diretor de projetos'].includes(normRole(roleName()));
const isMetaResponsible=m=>metaResponsibles(m.id).includes(currentUser()?.id);
const isPendingApproval=m=>normRole(m?.status)==='aguardando aprovacao';
const canRequestConclusion=m=>!!m&&isMetaResponsible(m)&&!isMetaApprover()&&!['concluido','cancelado','aguardando aprovacao'].includes(normRole(m.status));
const canApproveConclusion=m=>!!m&&isMetaApprover()&&isPendingApproval(m);

function weekStartDate(offset=0){const d=new Date();d.setHours(12,0,0,0);const day=d.getDay();d.setDate(d.getDate()+(day===0?-6:1-day)+offset*7);return d;}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function weekStartISO(offset=state.weekOffset){return iso(weekStartDate(offset));}
function weekEndISO(offset=state.weekOffset){const d=weekStartDate(offset);d.setDate(d.getDate()+6);return iso(d)}
function weekLabel(offset=state.weekOffset){const a=weekStartDate(offset),b=new Date(a);b.setDate(a.getDate()+6);return `${a.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} – ${b.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}`;}
function mondayForDate(v){const d=v?new Date(`${v}T12:00:00`):new Date();const day=d.getDay();d.setDate(d.getDate()+(day===0?-6:1-day));return iso(d)}

async function fetchAll(){
  const client=sb();
  if(!client){state.error=new Error('Conexão com o Supabase ainda não está pronta.');return;}
  if(fetchPromise)return fetchPromise;
  state.loading=true;state.error=null;
  fetchPromise=(async()=>{
    try{
      const [s,o,oc,m,r,h,f,k,c]=await Promise.all([
        client.from('meta_setores').select('*').order('nome'),
        client.from('ordens_servico').select('*').order('created_at',{ascending:false}),
        client.from('ordem_servico_comentarios').select('*').order('created_at'),
        client.from('metas').select('*').order('semana_inicio',{ascending:false}),
        client.from('meta_responsaveis').select('*'),
        client.from('meta_historico').select('*').order('created_at',{ascending:false}),
        client.from('meta_arquivos').select('*').order('created_at',{ascending:false}),
        client.from('meta_checklist').select('*').order('created_at'),
        client.from('meta_comentarios').select('*').order('created_at')
      ]);
      const first=[s,o,oc,m,r,h,f,k,c].find(x=>x.error);
      if(first?.error)throw first.error;
      state.sectors=s.data||[];state.orders=o.data||[];state.orderComments=oc.data||[];state.metas=m.data||[];state.responsibles=r.data||[];state.history=h.data||[];state.files=f.data||[];state.checklist=k.data||[];state.comments=c.data||[];state.loaded=true;
    }catch(e){state.error=e;state.loaded=false;console.warn('Metas V2:',e)}
    finally{state.loading=false;fetchPromise=null;}
  })();
  return fetchPromise;
}

function metaResponsibles(metaId){return state.responsibles.filter(r=>r.meta_id===metaId).map(r=>r.usuario_id)}
function metasForUser(userId){return state.metas.filter(m=>metaResponsibles(m.id).includes(userId))}
function metasForWeek(offset=state.weekOffset){const w=weekStartISO(offset);return state.metas.filter(m=>m.semana_inicio===w)}
function associationLabel(m){if(m.associacao_tipo==='projeto')return `Projeto · ${projectName(m.associacao_id)}`;if(m.associacao_tipo==='plano')return `Plano · ${planName(m.associacao_id)}`;if(m.associacao_tipo==='ordem_servico')return `OS · ${state.orders.find(o=>o.id===m.associacao_id)?.nome||'Ordem de Serviço'}`;return 'Meta avulsa';}
function sectorLabel(id){return state.sectors.find(s=>s.id===id)?.nome||'Sem setor'}
function canSeeMeta(m){return canManageMeta()||metaResponsibles(m.id).includes(currentUser()?.id)}
function visibleMetas(list=state.metas){return list.filter(canSeeMeta)}
function statusBadge(v){const c=v==='Concluído'?'ok':v==='Cancelado'?'danger':v==='Aguardando aprovação'?'warn':'';return `<span class="badge ${c}">${esc(v)}</span>`}

async function historyAdd(meta,{acao,descricao,entityType=null,entityId=null}={}){
  const client=sb();if(!client)return;
  const base={meta_id:meta?.id||null,meta_titulo:meta?.titulo||'',acao:acao||'Atualização',descricao:descricao||null,autor_id:currentUser()?.id||null};
  let entities=[];
  if(entityType)entities=[{tipo:entityType,id:entityId||null}];
  else if(meta?.associacao_tipo==='avulsa')entities=metaResponsibles(meta.id).map(id=>({tipo:'colaborador',id}));
  else entities=[{tipo:meta?.associacao_tipo||'avulsa',id:meta?.associacao_id||null}];
  if(!entities.length)entities=[{tipo:'avulsa',id:null}];
  const rows=entities.map(e=>({id:uid(),...base,entidade_tipo:e.tipo,entidade_id:e.id}));
  const r=await client.from('meta_historico').insert(rows);if(r.error)console.warn(r.error);else state.history.unshift(...rows.map(x=>({...x,created_at:new Date().toISOString()})));
}

async function requestMetaConclusion(m){
  if(!canRequestConclusion(m))return;
  if(!confirm(`Concluir a meta “${m.titulo}” e enviar para aprovação?`))return;
  const r=await sb().from('metas').update({status:'Aguardando aprovação',updated_at:new Date().toISOString()}).eq('id',m.id).select().single();
  if(r.error){alert(`Não foi possível concluir a meta: ${r.error.message}`);return;}
  Object.assign(m,r.data);
  await historyAdd(m,{acao:'Conclusão solicitada',descricao:`${currentUser()?.name||'Colaborador'} informou que a meta foi concluída e enviou para aprovação.`});
  await fetchAll();renderCurrentScreen();
}
async function approveMetaConclusion(m){
  if(!canApproveConclusion(m))return;
  if(!confirm(`Aprovar a conclusão da meta “${m.titulo}”?`))return;
  const r=await sb().from('metas').update({status:'Concluído',updated_at:new Date().toISOString()}).eq('id',m.id).select().single();
  if(r.error){alert(`Não foi possível aprovar a meta: ${r.error.message}`);return;}
  Object.assign(m,r.data);
  await historyAdd(m,{acao:'Conclusão aprovada',descricao:`${currentUser()?.name||'Aprovador'} aprovou a conclusão da meta.`});
  await fetchAll();renderCurrentScreen();
}
function renderCurrentScreen(){if(state.screen==='orders')renderOrders();else if(state.screen==='active')renderActive();else if(state.screen==='user')renderUserBoard();else renderHome();}
function conclusionActionHtml(m){if(canRequestConclusion(m))return '<span class="meta-conclusion-action request" data-request-meta>Concluir</span>';if(canApproveConclusion(m))return '<span class="meta-conclusion-action approve" data-approve-meta>Aprovar conclusão</span>';if(isPendingApproval(m)&&isMetaResponsible(m))return '<span class="meta-conclusion-pending">Aguardando aprovação</span>';return '';}
function wireMetaCards(){qsa('[data-meta-card]').forEach(card=>card.onclick=e=>{const m=state.metas.find(x=>x.id===card.dataset.metaCard);const req=e.target.closest?.('[data-request-meta]'),app=e.target.closest?.('[data-approve-meta]');if(req){e.preventDefault();e.stopPropagation();requestMetaConclusion(m);return}if(app){e.preventDefault();e.stopPropagation();approveMetaConclusion(m);return}metaDetail(card.dataset.metaCard)});}


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

function renderLoading(){B().title('Metas');qs('#content').innerHTML='<div class="card"><div class="notice">Carregando metas e ordens de serviço...</div></div>';}
function renderSetupError(){
  B().title('Metas');
  const missing=/relation .* does not exist|Could not find the table|42P01/i.test(state.error?.message||'');
  qs('#content').innerHTML=`<div class="card"><h3>${missing?'Configuração de Metas pendente':'Não foi possível carregar Metas'}</h3><p class="muted">${missing?'A nova estrutura já está no ERP, mas as tabelas precisam ser criadas uma vez no Supabase.':'Erro: '+esc(state.error?.message||'desconhecido')}</p>${missing?'<div class="notice">Execute o arquivo <b>supabase/metas_ordens_servico.sql</b> no SQL Editor do Supabase.</div>':''}</div>`;
}

function toolbar(){return `<div class="toolbar metas2-toolbar"><div class="left"><button class="btn ghost" id="metaWeekPrev">‹</button><div class="week-pill"><span>Semana</span><b>${esc(weekLabel())}</b></div><button class="btn ghost" id="metaWeekNext">›</button>${state.weekOffset?'<button class="btn small secondary" id="metaWeekNow">Semana atual</button>':''}</div><div class="right"><button class="btn secondary" id="metaOrders">Ordens de Serviço</button><button class="btn secondary" id="metaActive">Metas Ativas</button>${canManageSectors()?'<button class="btn secondary" id="metaSectorQuick">+ Setor</button>':''}${canManageMeta()?'<button class="btn" id="metaNew">+ Nova Meta</button>':''}</div></div>`}
function wireToolbar(){qs('#metaWeekPrev')?.addEventListener('click',()=>{state.weekOffset--;renderHome()});qs('#metaWeekNext')?.addEventListener('click',()=>{state.weekOffset++;renderHome()});qs('#metaWeekNow')?.addEventListener('click',()=>{state.weekOffset=0;renderHome()});qs('#metaOrders')?.addEventListener('click',()=>{state.screen='orders';renderOrders()});qs('#metaActive')?.addEventListener('click',()=>{state.screen='active';renderActive()});qs('#metaSectorQuick')?.addEventListener('click',()=>sectorModal());qs('#metaNew')?.addEventListener('click',()=>metaModal());}

function renderHome(){
  state.screen='home';B().title('Metas');
  const week=visibleMetas(metasForWeek());const active=visibleMetas().filter(m=>!['Concluído','Cancelado'].includes(m.status));const late=active.filter(m=>m.prazo&&m.prazo<today());
  const employees=(canManageMeta()?db().users.filter(u=>u.active&&allowedProfessional(u)):[currentUser()]).filter(Boolean);
  qs('#content').innerHTML=`${toolbar()}<div class="grid cols-3"><div class="card metric"><h3>Metas da semana</h3><b>${week.length}</b></div><div class="card metric"><h3>Metas ativas</h3><b>${active.length}</b></div><div class="card metric"><h3>Em atraso</h3><b>${late.length}</b></div></div><section class="card metas2-week-list"><div class="section-head"><div><h3>Semana selecionada</h3><p class="muted">Controle semanal de metas. Os prazos individuais continuam visíveis dentro de cada card.</p></div></div>${week.length?`<div class="metas2-card-grid">${week.map(metaCardHtml).join('')}</div>`:'<div class="empty">Nenhuma meta programada para esta semana.</div>'}</section><section class="card metas2-active-home"><div class="section-head"><div><h3>Metas ativas</h3><p class="muted">Até 15 metas em aberto para acompanhamento rápido.</p></div><button type="button" class="btn small secondary" id="metaActiveAll">Ver todas</button></div>${active.length?`<div class="metas2-card-grid">${active.slice(0,15).map(metaCardHtml).join('')}</div>`:'<div class="empty compact">Nenhuma meta ativa.</div>'}</section><h3 class="section-title">Colaboradores</h3><div class="metas-emp-grid">${employees.map(u=>{const ms=metasForUser(u.id);const act=ms.filter(m=>!['Concluído','Cancelado'].includes(m.status));const done=ms.filter(m=>m.status==='Concluído');return `<button type="button" class="card metas-emp-card" data-meta-user="${u.id}"><div class="metas-emp-head"><strong>${esc(u.name)}</strong><span class="badge">${esc(u.type)}</span></div><div class="metas-emp-stats"><div><b>${act.length}</b><span>Ativas</span></div><div><b>${done.length}</b><span>Concluídas</span></div><div><b>${ms.length}</b><span>Histórico</span></div></div></button>`}).join('')}</div>`;
  wireToolbar();qs('#metaActiveAll')?.addEventListener('click',()=>{state.screen='active';renderActive()});wireMetaCards();qsa('[data-meta-user]').forEach(b=>b.onclick=()=>{state.selectedUser=b.dataset.metaUser;state.screen='user';renderUserBoard()});
}
function metaCardHtml(m){const resp=metaResponsibles(m.id).map(userName).join(', ')||'Sem responsável';const action=conclusionActionHtml(m);return `<button type="button" class="metas2-card" data-meta-card="${m.id}"><div class="metas2-card-top"><strong>${esc(m.titulo)}</strong>${statusBadge(m.status)}</div><span class="muted metas2-assoc">${esc(associationLabel(m))}</span><p>${esc(m.observacoes||'Sem observações.')}</p><div class="metas2-card-foot"><span>${esc(sectorLabel(m.setor_id))}</span><span>${m.prazo?'Prazo '+brDate(m.prazo):'Sem prazo'}</span></div><small>${esc(resp)}</small>${action?`<div class="meta-conclusion-row">${action}</div>`:''}</button>`}

function renderUserBoard(){
  const u=db().users.find(x=>x.id===state.selectedUser)||currentUser();if(!u){renderHome();return}B().title(`Metas — ${u.name}`);
  const all=metasForUser(u.id);const week=all.filter(m=>m.semana_inicio===weekStartISO());
  const columns=[['Em andamento',week.filter(m=>['Em andamento','Aguardando aprovação'].includes(m.status))],['Concluído',week.filter(m=>m.status==='Concluído')],['Cancelado',week.filter(m=>m.status==='Cancelado')]];
  qs('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="metaUserBack">← Voltar</button><div class="right"><button class="btn secondary" id="metaUserHistory">Histórico de metas</button>${canManageMeta()?'<button class="btn" id="metaUserNew">+ Nova Meta</button>':''}<span class="badge">${esc(u.type)}</span></div></div><div class="week-pill standalone"><span>Semana</span><b>${esc(weekLabel())}</b></div><div class="metas-board metas2-board">${columns.map(([label,list])=>`<div class="metas-board-col"><div class="metas-board-col-head">${label}<span>${list.length}</span></div>${list.map(metaCardHtml).join('')||'<div class="metas-board-empty">Nenhuma meta</div>'}</div>`).join('')}</div>`;
  qs('#metaUserBack').onclick=renderHome;qs('#metaUserHistory').onclick=()=>historyModal('colaborador',u.id,`Histórico de metas — ${u.name}`);qs('#metaUserNew')?.addEventListener('click',()=>metaModal(null,u.id));wireMetaCards();
}

function renderActive(){
  state.screen='active';B().title('Metas Ativas');const active=visibleMetas().filter(m=>!['Concluído','Cancelado'].includes(m.status));
  qs('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="metaActiveBack">← Voltar</button><div class="right">${canManageSectors()?'<button class="btn secondary" id="metaNewSector">+ Setor</button>':''}${canManageMeta()?'<button class="btn" id="metaActiveNew">+ Nova Meta</button>':''}</div></div><div class="metas-ativas-groups"><section class="card"><div class="section-head"><div><h3>Setores</h3><p class="muted">Crie, edite ou exclua setores usados na organização das metas.</p></div></div><div class="metas-group-list">${state.sectors.filter(s=>s.ativo!==false).map(s=>{const count=active.filter(m=>m.setor_id===s.id).length;return `<div class="metas-group-item sector-manage-row"><button type="button" data-filter-sector="${s.id}"><strong>${esc(s.nome)}</strong><span class="muted">${count} meta(s) ativa(s)</span></button>${canManageSectors()?`<div class="actions"><button class="btn icon secondary" data-edit-sector="${s.id}">✎</button><button class="btn icon danger" data-del-sector="${s.id}">×</button></div>`:''}</div>`}).join('')||'<div class="empty compact">Nenhum setor.</div>'}</div></section><section class="card"><h3>Metas em aberto</h3><div class="metas2-card-grid">${active.map(metaCardHtml).join('')||'<div class="empty">Nenhuma meta ativa.</div>'}</div></section></div>`;
  qs('#metaActiveBack').onclick=renderHome;qs('#metaNewSector')?.addEventListener('click',()=>sectorModal());qs('#metaActiveNew')?.addEventListener('click',()=>metaModal());wireMetaCards();qsa('[data-edit-sector]').forEach(b=>b.onclick=()=>sectorModal(state.sectors.find(s=>s.id===b.dataset.editSector)));qsa('[data-del-sector]').forEach(b=>b.onclick=()=>deleteSector(b.dataset.delSector));qsa('[data-filter-sector]').forEach(b=>b.onclick=()=>{const id=b.dataset.filterSector;qsa('.metas2-card').forEach(card=>{const m=state.metas.find(x=>x.id===card.dataset.metaCard);card.hidden=m?.setor_id!==id})});
}
async function sectorModal(s={}){
  if(B()?.refreshCore)await B().refreshCore();
  B().openModal(s.id?'Editar setor':'Novo setor',`<form id="metaSectorForm" class="form-grid"><div class="field full"><label>Nome do setor</label><input name="nome" required value="${esc(s.nome||'')}"></div></form>`,()=>qs('#metaSectorForm').requestSubmit());
  qs('#metaSectorForm').onsubmit=async e=>{
    e.preventDefault();
    const nome=String(new FormData(e.target).get('nome')||'').trim();
    if(!nome)return;
    const client=sb();
    const now=new Date().toISOString();
    let r;
    if(s.id){
      r=await client.from('meta_setores').update({nome,ativo:true,updated_at:now}).eq('id',s.id).select().single();
    }else{
      const existing=await client.from('meta_setores').select('*').ilike('nome',nome).limit(1).maybeSingle();
      if(existing.error){alert(existing.error.message);return;}
      if(existing.data){
        r=await client.from('meta_setores').update({nome,ativo:true,updated_at:now}).eq('id',existing.data.id).select().single();
      }else{
        r=await client.from('meta_setores').insert({id:uid(),nome,ativo:true,created_by:currentUser().id,updated_at:now}).select().single();
      }
    }
    if(r.error){
      if(r.error.code==='23505'||/meta_setores_nome_key|duplicate key/i.test(r.error.message||''))alert('Já existe um setor com esse nome. Se ele estava inativo, atualize a tela e tente novamente.');
      else alert(r.error.message);
      return;
    }
    B().closeModal();
    await fetchAll();
    renderActive();
  };
}
async function deleteSector(id){const used=state.metas.some(m=>m.setor_id===id);if(used){alert('Este setor possui metas vinculadas. Edite as metas antes de excluir o setor.');return}if(!confirm('Excluir setor?'))return;const r=await sb().from('meta_setores').delete().eq('id',id);if(r.error){alert(r.error.message);return}state.sectors=state.sectors.filter(s=>s.id!==id);await fetchAll();renderActive()}

function renderOrders(){
  state.screen='orders';B().title('Ordens de Serviço');
  qs('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="osBack">← Voltar para Metas</button><div class="right">${canManageOS()?'<button class="btn" id="osNew">+ Nova Ordem de Serviço</button>':''}</div></div><div class="card"><div class="section-head"><div><h3>Ordens de Serviço</h3><p class="muted">Clique em uma OS para abrir seu card completo, comentários e histórico de metas.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Ordem de Serviço</th><th>Núcleo</th><th>Etapa atual</th><th>Município</th><th>UF</th><th>Metas</th><th></th></tr></thead><tbody>${state.orders.map(o=>`<tr><td><button class="project-link" data-open-os="${o.id}">${esc(o.nome)}</button></td><td>${esc(o.nucleo_referente||'—')}</td><td>${esc(o.etapa_atual)}</td><td>${esc(o.municipio)}</td><td>${esc(o.estado)}</td><td>${state.metas.filter(m=>m.associacao_tipo==='ordem_servico'&&m.associacao_id===o.id).length}</td><td class="actions">${canManageOS()?`<button class="btn icon secondary" data-edit-os="${o.id}">✎</button><button class="btn icon danger" data-del-os="${o.id}">×</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7">Nenhuma Ordem de Serviço cadastrada.</td></tr>'}</tbody></table></div></div>`;
  qs('#osBack').onclick=renderHome;qs('#osNew')?.addEventListener('click',()=>orderModal());qsa('[data-open-os]').forEach(b=>b.onclick=()=>orderDetail(b.dataset.openOs));qsa('[data-edit-os]').forEach(b=>b.onclick=()=>orderModal(state.orders.find(o=>o.id===b.dataset.editOs)));qsa('[data-del-os]').forEach(b=>b.onclick=()=>deleteOrder(b.dataset.delOs));
}
async function orderModal(o={}){if(B()?.refreshCore)await B().refreshCore();B().openModal(o.id?'Editar Ordem de Serviço':'Nova Ordem de Serviço',`<form id="osForm" class="form-grid"><div class="field full"><label>Nome</label><input name="nome" required placeholder="OS ..." value="${esc(o.nome||'')}"></div><div class="field full"><label>Núcleo referente</label><input name="nucleo" value="${esc(o.nucleo_referente||'')}"></div><div class="field full"><label>Etapa atual</label><select name="etapa" required>${STAGES.map(x=>`<option ${o.etapa_atual===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Município</label><input name="municipio" required value="${esc(o.municipio||'')}"></div><div class="field"><label>Estado</label><select name="estado" required><option value="">Selecione</option>${STATES.map(x=>`<option ${o.estado===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field full"><label>Observações</label><textarea name="observacoes">${esc(o.observacoes||'')}</textarea></div></form>`,()=>qs('#osForm').requestSubmit());qs('#osForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),row={id:o.id||uid(),nome:f.get('nome').trim(),nucleo_referente:f.get('nucleo').trim()||null,etapa_atual:f.get('etapa'),municipio:f.get('municipio').trim(),estado:f.get('estado'),observacoes:f.get('observacoes').trim()||null,created_by:o.created_by||currentUser().id,updated_at:new Date().toISOString()};const r=await sb().from('ordens_servico').upsert(row,{onConflict:'id'}).select().single();if(r.error){alert(r.error.message);return}if(o.id)Object.assign(o,r.data);else state.orders.unshift(r.data);B().closeModal();await fetchAll();renderOrders()}}
async function deleteOrder(id){if(state.metas.some(m=>m.associacao_tipo==='ordem_servico'&&m.associacao_id===id)){alert('Esta OS possui metas vinculadas. Exclua ou mova essas metas antes de excluir a Ordem de Serviço.');return}if(!confirm('Excluir Ordem de Serviço?'))return;const r=await sb().from('ordens_servico').delete().eq('id',id);if(r.error){alert(r.error.message);return}state.orders=state.orders.filter(o=>o.id!==id);await fetchAll();renderOrders()}
function canCommentOrder(orderId){if(canManageOS())return true;return state.metas.some(m=>m.associacao_tipo==='ordem_servico'&&m.associacao_id===orderId&&metaResponsibles(m.id).includes(currentUser().id))}
function orderDetail(id){const o=state.orders.find(x=>x.id===id);if(!o){renderOrders();return}const metas=state.metas.filter(m=>m.associacao_tipo==='ordem_servico'&&m.associacao_id===id);const comments=state.orderComments.filter(c=>c.ordem_servico_id===id);const hist=state.history.filter(h=>h.entidade_tipo==='ordem_servico'&&h.entidade_id===id);B().title(o.nome);qs('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="osDetailBack">← Ordens de Serviço</button><div class="right">${canManageOS()?`<button class="btn secondary" id="osDetailEdit">Editar</button>`:''}${canManageMeta()?'<button class="btn" id="osDetailMeta">+ Meta para esta OS</button>':''}</div></div><section class="card os-hero"><div><span class="project-kicker">Ordem de Serviço</span><h3>${esc(o.nome)}</h3><p>${esc(o.observacoes||'Sem observações.')}</p></div><span class="badge">${esc(o.etapa_atual)}</span></section><div class="project-summary-grid"><div class="card summary-box"><span>Núcleo referente</span><strong>${esc(o.nucleo_referente||'—')}</strong></div><div class="card summary-box"><span>Município</span><strong>${esc(o.municipio)}</strong></div><div class="card summary-box"><span>Estado</span><strong>${esc(o.estado)}</strong></div><div class="card summary-box"><span>Metas vinculadas</span><strong>${metas.length}</strong></div></div><section class="card"><h3>Metas vinculadas</h3><div class="metas2-card-grid">${metas.map(metaCardHtml).join('')||'<div class="empty">Nenhuma meta vinculada.</div>'}</div></section><section class="card"><h3>Comentários</h3><div class="metas-comment-list">${comments.map(c=>`<div class="metas-comment"><div class="metas-comment-head"><strong>${esc(userName(c.autor_id))}</strong><span class="muted">${new Date(c.created_at).toLocaleString('pt-BR')}</span></div><p>${esc(c.texto).replace(/\n/g,'<br>')}</p></div>`).join('')||'<div class="empty compact">Nenhum comentário.</div>'}</div>${canCommentOrder(id)?'<div class="metas-comment-form"><textarea id="osCommentText" placeholder="Adicionar comentário..."></textarea><button class="btn secondary" id="osCommentAdd">Comentar</button></div>':'<div class="notice">Comentários disponíveis para usuários com metas atribuídas a esta OS.</div>'}</section><section class="card"><h3>Histórico de Metas</h3>${historyHtml(hist)}</section>`;qs('#osDetailBack').onclick=renderOrders;qs('#osDetailEdit')?.addEventListener('click',()=>orderModal(o));qs('#osDetailMeta')?.addEventListener('click',()=>metaModal({associacao_tipo:'ordem_servico',associacao_id:o.id}));qs('#osCommentAdd')?.addEventListener('click',()=>addOrderComment(o));wireMetaCards();}
async function addOrderComment(o){const text=qs('#osCommentText')?.value.trim();if(!text)return;const row={id:uid(),ordem_servico_id:o.id,autor_id:currentUser().id,texto:text};const r=await sb().from('ordem_servico_comentarios').insert(row).select().single();if(r.error){alert(r.error.message);return}state.orderComments.push(r.data);orderDetail(o.id)}

function associationOptions(type,selected){if(type==='projeto')return db().projects.map(x=>`<option value="${x.id}" ${selected===x.id?'selected':''}>${esc(x.name)}</option>`).join('');if(type==='plano')return db().plans.map(x=>`<option value="${x.id}" ${selected===x.id?'selected':''}>${esc(x.title)}</option>`).join('');if(type==='ordem_servico')return state.orders.map(x=>`<option value="${x.id}" ${selected===x.id?'selected':''}>${esc(x.nome)}</option>`).join('');return ''}
async function metaModal(prefill=null,defaultUserId=null){if(B()?.refreshCore)await B().refreshCore();const m=prefill?.id?prefill:null;const checklistInicial=m?checklistItems(m.id).filter(x=>!x.concluido).map(x=>x.titulo):[];const assocType=m?.associacao_tipo||prefill?.associacao_tipo||'avulsa';const assocId=m?.associacao_id||prefill?.associacao_id||'';const resp=m?metaResponsibles(m.id):(defaultUserId?[defaultUserId]:[]);B().openModal(m?'Editar meta':'Nova Meta',`<form id="metaV2Form" class="form-grid"><div class="field full"><label>Título da nova meta</label><input name="titulo" required value="${esc(m?.titulo||'')}"></div><div class="field full"><label>Observações</label><textarea name="observacoes" placeholder="Contexto, instruções ou observações da meta">${esc(m?.observacoes||'')}</textarea></div><div class="field full"><label>Checklist</label><textarea name="checklist" rows="4" placeholder="Digite um item por linha">${esc(checklistInicial.join('\n'))}</textarea><small class="muted">Cada linha vira um item marcável dentro da meta.</small></div><div class="field"><label>Semana</label><input name="semana" type="date" value="${m?.semana_inicio||weekStartISO()}"></div><div class="field"><label>Prazo (opcional)</label><input name="prazo" type="date" value="${m?.prazo||''}"></div><div class="field"><label>Status</label><select name="status">${META_STATUS.map(x=>`<option ${(m?.status||'Em andamento')===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Setor</label><select name="setor"><option value="">Sem setor</option>${state.sectors.filter(s=>s.ativo!==false).map(s=>`<option value="${s.id}" ${m?.setor_id===s.id?'selected':''}>${esc(s.nome)}</option>`).join('')}</select></div><div class="field full"><label>Associar meta a</label><select name="assocType" id="metaAssocType"><option value="plano" ${assocType==='plano'?'selected':''}>Plano de Trabalho</option><option value="projeto" ${assocType==='projeto'?'selected':''}>Projeto do ERP</option><option value="ordem_servico" ${assocType==='ordem_servico'?'selected':''}>Ordem de Serviço</option><option value="avulsa" ${assocType==='avulsa'?'selected':''}>Meta avulsa</option></select></div><div class="field full" id="metaAssocWrap"></div><div class="field full"><label>Responsáveis</label><div class="check-grid">${db().users.filter(u=>u.active&&allowedProfessional(u)).map(u=>`<label class="check-item"><input type="checkbox" name="responsavel" value="${u.id}" ${resp.includes(u.id)?'checked':''}>${esc(u.name)} <span class="muted">(${esc(u.type)})</span></label>`).join('')}</div></div></form>`,()=>qs('#metaV2Form').requestSubmit());const drawAssoc=()=>{const type=qs('#metaAssocType').value;qs('#metaAssocWrap').innerHTML=type==='avulsa'?'<div class="notice">Meta avulsa: o histórico ficará registrado no card de cada colaborador responsável.</div>':`<label>${type==='plano'?'Plano de Trabalho':type==='projeto'?'Projeto do ERP':'Ordem de Serviço'}</label><select name="assocId" required><option value="">Selecione</option>${associationOptions(type,assocId)}</select>`};drawAssoc();qs('#metaAssocType').onchange=drawAssoc;qs('#metaV2Form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),responsaveis=fd.getAll('responsavel');if(!responsaveis.length){alert('Selecione ao menos um responsável.');return}const type=fd.get('assocType'),aid=type==='avulsa'?null:fd.get('assocId');if(type!=='avulsa'&&!aid){alert('Selecione o item que será associado à meta.');return}const row={id:m?.id||uid(),titulo:fd.get('titulo').trim(),observacoes:fd.get('observacoes').trim()||null,semana_inicio:mondayForDate(fd.get('semana')),prazo:fd.get('prazo')||null,status:fd.get('status')||'Em andamento',setor_id:fd.get('setor')||null,associacao_tipo:type,associacao_id:aid||null,created_by:m?.created_by||currentUser().id,updated_at:new Date().toISOString()};const save=await sb().from('metas').upsert(row,{onConflict:'id'}).select().single();if(save.error){alert(save.error.message);return}const id=row.id;const del=await sb().from('meta_responsaveis').delete().eq('meta_id',id);if(del.error){alert(del.error.message);return}const ins=await sb().from('meta_responsaveis').insert(responsaveis.map(usuario_id=>({meta_id:id,usuario_id})));if(ins.error){alert(ins.error.message);return}const checklist=String(fd.get('checklist')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const delCk=await sb().from('meta_checklist').delete().eq('meta_id',id).eq('concluido',false);if(delCk.error){alert(delCk.error.message);return}if(checklist.length){const ckIns=await sb().from('meta_checklist').insert(checklist.map(titulo=>({id:uid(),meta_id:id,titulo,created_by:currentUser().id})));if(ckIns.error){alert(ckIns.error.message);return}}if(m){Object.assign(m,save.data);state.responsibles=state.responsibles.filter(r=>r.meta_id!==id)}else state.metas.unshift(save.data);state.responsibles.push(...responsaveis.map(usuario_id=>({meta_id:id,usuario_id})));await historyAdd(save.data,{acao:m?'Editada':'Criada',descricao:m?'Dados da meta atualizados.':'Meta criada e atribuída.'});B().closeModal();state.screen==='orders'&&type==='ordem_servico'?orderDetail(aid):renderHome()}}

async function deleteMeta(m){if(!canManageMeta()||!confirm('Excluir esta meta? O histórico permanecerá registrado.'))return;await historyAdd(m,{acao:'Excluída',descricao:'Meta excluída do planejamento.'});const r=await sb().from('metas').delete().eq('id',m.id);if(r.error){alert(r.error.message);return}state.metas=state.metas.filter(x=>x.id!==m.id);state.responsibles=state.responsibles.filter(x=>x.meta_id!==m.id);B().closeModal();renderHome()}
function metaDetail(id){const m=state.metas.find(x=>x.id===id);if(!m)return;const resp=metaResponsibles(id);const files=state.files.filter(f=>f.meta_id===id),hist=state.history.filter(h=>h.meta_id===id);const editable=canManageMeta();const conclusion=conclusionActionHtml(m);B().openModal(m.titulo,`<div class="metas-modal-meta"><span class="badge">${esc(associationLabel(m))}</span>${statusBadge(m.status)}<span class="badge">${esc(sectorLabel(m.setor_id))}</span></div><div class="card meta-detail-card"><div class="info-grid"><div class="info-box"><b>Semana</b>${brDate(m.semana_inicio)} a ${brDate(weekEndFromStart(m.semana_inicio))}</div><div class="info-box"><b>Prazo</b>${brDate(m.prazo)}</div><div class="info-box"><b>Responsáveis</b>${esc(resp.map(userName).join(', ')||'—')}</div></div><div class="field"><label>Observações</label><div class="info-box">${esc(m.observacoes||'Sem observações.')}</div></div>${conclusion?`<div class="meta-conclusion-row detail">${conclusion}</div>`:''}</div><div class="metas-tabs"><button class="metas-tab active" data-v2tab="files">Arquivos (${files.length})</button><button class="metas-tab" data-v2tab="history">Histórico (${hist.length})</button><button class="metas-tab" data-v2tab="checklist">Checklist (${checklistItems(m.id).length})</button><button class="metas-tab" data-v2tab="comments">Comentários (${commentItems(m.id).length})</button></div><div class="metas-tab-panel" data-v2panel="files"><div class="meta-file-list">${files.map(f=>`<button type="button" class="meta-file" data-open-meta-file="${f.id}"><strong>${esc(f.nome)}</strong><span class="muted">${new Date(f.created_at).toLocaleString('pt-BR')}</span></button>`).join('')||'<div class="empty compact">Nenhum arquivo enviado.</div>'}</div><div class="dropzone compact"><input id="metaFileInput" type="file"><button type="button" class="btn secondary" id="metaFileUpload">Enviar arquivo</button></div></div><div class="metas-tab-panel hidden" data-v2panel="history">${historyHtml(hist)}</div><div class="metas-tab-panel hidden" data-v2panel="checklist">${checklistPanelHtml(m)}</div><div class="metas-tab-panel hidden" data-v2panel="comments">${commentsPanelHtml(m)}</div>${editable?`<div class="meta-admin-actions"><button class="btn secondary" id="metaEdit">Editar meta</button><button class="btn danger" id="metaDelete">Excluir meta</button></div>`:''}`,()=>B().closeModal());qsa('[data-v2tab]').forEach(t=>t.onclick=()=>{qsa('[data-v2tab]').forEach(x=>x.classList.remove('active'));t.classList.add('active');qsa('[data-v2panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.v2panel!==t.dataset.v2tab))});qs('[data-request-meta]')?.addEventListener('click',()=>requestMetaConclusion(m));qs('[data-approve-meta]')?.addEventListener('click',()=>approveMetaConclusion(m));qs('#metaEdit')?.addEventListener('click',()=>{B().closeModal();metaModal(m)});qs('#metaDelete')?.addEventListener('click',()=>deleteMeta(m));qs('#metaFileUpload').onclick=()=>uploadMetaFile(m);qsa('[data-open-meta-file]').forEach(b=>b.onclick=()=>openMetaFile(state.files.find(f=>f.id===b.dataset.openMetaFile)));wireMetaCollaboration(m)}
function weekEndFromStart(start){const d=new Date(`${start}T12:00:00`);d.setDate(d.getDate()+6);return iso(d)}
async function uploadMetaFile(m){const file=qs('#metaFileInput')?.files?.[0];if(!file)return;const safe=file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${currentUser().id}/metas/${m.id}/${uid()}-${safe}`;const up=await sb().storage.from('documentos').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(up.error){alert(up.error.message);return}const row={id:uid(),meta_id:m.id,nome:file.name,caminho_storage:path,mime_type:file.type||null,tamanho_bytes:file.size,enviado_por:currentUser().id};const r=await sb().from('meta_arquivos').insert(row).select().single();if(r.error){await sb().storage.from('documentos').remove([path]);alert(r.error.message);return}state.files.unshift(r.data);await historyAdd(m,{acao:'Arquivo enviado',descricao:`Arquivo ${file.name} anexado à meta.`});B().closeModal();metaDetail(m.id)}
async function openMetaFile(f){if(!f)return;const r=await sb().storage.from('documentos').createSignedUrl(f.caminho_storage,60);if(r.error){alert(r.error.message);return}window.open(r.data.signedUrl,'_blank','noopener')}

function historyHtml(list){return `<div class="meta-history-list">${list.length?list.map(h=>`<div class="meta-history-item"><div><strong>${esc(h.meta_titulo||h.acao)}</strong><span>${esc(h.acao)}</span></div><p>${esc(h.descricao||'')}</p><small>${new Date(h.created_at).toLocaleString('pt-BR')} · ${esc(userName(h.autor_id))}</small></div>`).join(''):'<div class="empty compact">Nenhum histórico de metas registrado.</div>'}</div>`}
function historyModal(type,id,titleText){const list=state.history.filter(h=>h.entidade_tipo===type&&h.entidade_id===id);B().openModal(titleText,historyHtml(list),()=>B().closeModal())}

function installEntityHistoryHooks(){
  const bridge=B();if(!bridge||!state.loaded)return;
  if(bridge.currentView==='projects'&&bridge.currentProjectId&&!qs('#projectMetaHistoryBtn')){const right=qs('.project-detail-toolbar .right');if(right){const b=document.createElement('button');b.id='projectMetaHistoryBtn';b.className='btn secondary';b.textContent='Histórico de metas';b.onclick=()=>historyModal('projeto',bridge.currentProjectId,`Histórico de metas — ${projectName(bridge.currentProjectId)}`);right.prepend(b)}}
  if(bridge.currentView==='plans'){qsa('.plan-card[data-plan-card-id]').forEach(card=>{if(card.querySelector('.planMetaHistoryBtn'))return;const id=card.dataset.planCardId,head=card.querySelector('.plan-head');if(!head)return;const b=document.createElement('button');b.className='btn small secondary planMetaHistoryBtn';b.textContent='Histórico de metas';b.onclick=()=>historyModal('plano',id,`Histórico de metas — ${planName(id)}`);head.appendChild(b)})}
  if(bridge.currentView==='users'){qsa('[data-edit-user]').forEach(edit=>{const row=edit.closest('tr');if(!row||row.querySelector('.userMetaHistoryBtn'))return;const id=edit.dataset.editUser,b=document.createElement('button');b.className='btn small secondary userMetaHistoryBtn';b.textContent='Histórico de metas';b.onclick=()=>historyModal('colaborador',id,`Histórico de metas — ${userName(id)}`);edit.parentElement.prepend(b)})}
}
let historyHookTimer=null;
const observer=new MutationObserver(()=>{
  if(historyHookTimer)return;
  historyHookTimer=setTimeout(()=>{historyHookTimer=null;installEntityHistoryHooks();},120);
});
observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});

let renderPromise=null;
async function render(){
  if(renderPromise)return renderPromise;
  renderPromise=(async()=>{
    const firstLoad=!state.loaded;
    if(firstLoad)renderLoading();
    if(B()?.refreshCore)await B().refreshCore();
    await fetchAll();
    if(B()?.currentView!=='metas')return;
    if(state.error){renderSetupError();return;}
    renderCurrentScreen();
    installEntityHistoryHooks();
  })().finally(()=>{renderPromise=null;});
  return renderPromise;
}
window.ERPMetasV2={render,refresh:render,historyModal};
window.addEventListener('erp-bridge-ready',()=>{if(B()?.currentView==='metas')render();});
})();
