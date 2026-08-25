(() => {
'use strict';

const APP_KEY='erp_integral_v2_db';
const SESSION_KEY='erp_integral_v2_session';
const SERVICE_TYPES=['REURB PRIVADO','REURB LICITADO','ETSA','ETSA + ORTOFOTO','OUTROS'];
const USER_TYPES=['Administrador','Comercial','Financeiro','Projetos','Topografia','Marketing','Pós-protocolo','Atendimentos','Diretor Técnico'];
const USER_SECTORS=['Administrativo','Comercial','Financeiro','Projetos','Topografia','Marketing','Pós-protocolo','Atendimentos'];
const METAS_SECTORS=['Projetos','Topografia','Pós-protocolo','Atendimentos'];
const PLAN_STATUS_COLUMNS=['Planejamento','Em andamento','Concluído','Cancelado'];
const WEEKDAY_LABELS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const STATES=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid=()=>crypto.randomUUID();
const today=()=>new Date().toISOString().slice(0,10);
const brDate=v=>v?new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR'):'—';
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const normEmail=v=>String(v||'').trim().toLowerCase();
const cpfDigits=v=>String(v||'').replace(/\D/g,'');
const fmtCpf=v=>cpfDigits(v).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
const daysUntil=v=>v?Math.ceil((new Date(`${v}T23:59:59`)-new Date())/86400000):null;

function seed(){
  return {version:3,users:[],clients:[],projects:[],payments:[],documents:[],plans:[]};
}

const SB_CONFIG=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient(SB_CONFIG.url,SB_CONFIG.publishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
let db=seed();
let currentUser=null;
let currentView='dashboard';
let currentProjectId=null;
let searchTerm='';
let openPaymentGroups={};
let metasScreen='home';
let metasWeekOffset=0;
let metasSectorFilter=null;
let metasBoardUser=null;
let syncTimer=null;
let syncing=false;
let pendingSync=false;
let remoteLoaded=false;
const PROJECT_GROUPS_STORAGE='erp_integral_project_groups_collapsed';
let collapsedProjectGroups=(()=>{try{return JSON.parse(localStorage.getItem(PROJECT_GROUPS_STORAGE)||'{}')}catch{return {}}})();
function setProjectGroupCollapsed(key,value){collapsedProjectGroups[key]=value;try{localStorage.setItem(PROJECT_GROUPS_STORAGE,JSON.stringify(collapsedProjectGroups))}catch{}}

function normalizeDB(raw){
  const db=raw&&typeof raw==='object'?raw:seed();
  for(const k of ['users','clients','projects','payments','documents','plans']) if(!Array.isArray(db[k])) db[k]=[];
  db.projects=db.projects.map(p=>({...p,stages:Array.isArray(p.stages)?p.stages:[]}));
  db.plans=db.plans.map(p=>({...p,comments:Array.isArray(p.comments)?p.comments:[],steps:Array.isArray(p.steps)?p.steps.map(s=>({...s,responsibleIds:Array.isArray(s.responsibleIds)?s.responsibleIds:[],deliverables:Array.isArray(s.deliverables)?s.deliverables:[]})):[]}));
  return db;
}
function loadCache(){try{return normalizeDB(JSON.parse(localStorage.getItem(APP_KEY)||'null'));}catch{return seed();}}
function cacheDB(){try{localStorage.setItem(APP_KEY,JSON.stringify(db));}catch(e){console.warn('Cache local indisponível',e)}}
function saveDB(){cacheDB();queueRemoteSync();}
function isAdmin(){return currentUser?.type==='Administrador';}
function isComercial(){return currentUser?.type==='Comercial';}
function canManageCore(){return isAdmin()||isComercial();}
function findUser(id){return db.users.find(u=>u.id===id);}
function findProject(id){return db.projects.find(p=>p.id===id);}
function findClient(id){return db.clients.find(c=>c.id===id);}
function isTechDirector(){return currentUser?.type==='Diretor Técnico';}
function isMetasManager(){return isAdmin()||isTechDirector();}
function canSeePlan(plan){return canManageCore()||isTechDirector()||plan.steps.some(s=>s.responsibleIds.includes(currentUser.id));}
function canEditStep(step){return isAdmin()||isTechDirector()||step.responsibleIds.includes(currentUser.id);}
function isMetasSector(){return METAS_SECTORS.includes(currentUser?.type);}
function canSeeMetas(){return isMetasManager()||isMetasSector();}
function metasScopeUsers(){return db.users.filter(u=>u.active&&METAS_SECTORS.includes(u.type));}
function stepsForUser(userId){return db.plans.flatMap(p=>p.steps.filter(s=>s.responsibleIds.includes(userId)).map(s=>({...s,planId:p.id,planTitle:p.title,planStatus:p.status})));}
function metasKpis(steps){
  const open=steps.filter(s=>s.status!=='Concluída');
  const late=open.filter(s=>s.deadline&&daysUntil(s.deadline)<0);
  const done=steps.filter(s=>s.completedAt&&s.createdAt);
  const avgDays=done.length?done.reduce((sum,s)=>sum+Math.max(0,(new Date(s.completedAt)-new Date(s.createdAt))/86400000),0)/done.length:null;
  return {ativas:open.length,emAberto:late.length,tempoMedio:avgDays};
}
function fmtDuration(days){if(days==null)return '—';if(days<1)return `${Math.round(days*24)}h`;return `${days.toFixed(1)} dia(s)`}
function weekStart(offset=0){const d=new Date();d.setHours(0,0,0,0);const day=d.getDay();const mondayDiff=(day===0?-6:1-day);d.setDate(d.getDate()+mondayDiff+offset*7);return d}
function weekDays(offset=0){const start=weekStart(offset);return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d})}

const projectStatusToRemote=v=>['Planejamento','Em andamento','Pausado','Concluído','Cancelado'].includes(v)?v:'Planejamento';
const projectStageStatusToRemote=v=>({'Não iniciada':'Pendente','Pendente':'Pendente','Em andamento':'Em andamento','Concluída':'Concluída','Bloqueada':'Bloqueada'}[v]||'Pendente');
const projectStageStatusFromRemote=v=>v==='Pendente'?'Não iniciada':v;
const planStatusToRemote=v=>({'Pausado':'Planejamento','Planejamento':'Planejamento','Em andamento':'Em andamento','Concluído':'Concluído','Cancelado':'Cancelado'}[v]||'Em andamento');
const planStatusFromRemote=v=>v==='Planejamento'?'Pausado':v;
const planStepStatusToRemote=v=>({'Aguardando':'Em revisão','Em revisão':'Em revisão','Pendente':'Pendente','Em andamento':'Em andamento','Concluída':'Concluída','Bloqueada':'Bloqueada'}[v]||'Pendente');
const planStepStatusFromRemote=v=>v==='Em revisão'?'Aguardando':v;

function throwIfError(result,label){if(result?.error)throw new Error(`${label}: ${result.error.message}`);return result?.data||[];}

async function loadRemoteDB(){
  if(!sb)throw new Error('Biblioteca do Supabase não foi carregada.');
  const [profilesR,clientsR,projectsR,stagesR,paymentsR,plansR,stepsR,respR,delivR,docsR,commentsR]=await Promise.all([
    sb.from('profiles').select('*').order('nome'),
    sb.from('clientes').select('*').order('nome'),
    sb.from('projetos').select('*').order('created_at'),
    sb.from('etapas_projeto').select('*').order('ordem'),
    sb.from('pagamentos').select('*').order('vencimento'),
    sb.from('planos_trabalho').select('*').order('created_at'),
    sb.from('etapas_plano').select('*').order('ordem'),
    sb.from('etapa_responsaveis').select('*'),
    sb.from('entregaveis').select('*').order('ordem'),
    sb.from('documentos').select('*').order('created_at',{ascending:false}),
    sb.from('comentarios_plano').select('*').order('created_at')
  ]);
  const profiles=throwIfError(profilesR,'Perfis');
  const clients=throwIfError(clientsR,'Clientes');
  const projects=throwIfError(projectsR,'Projetos');
  const stages=throwIfError(stagesR,'Etapas dos projetos');
  const payments=throwIfError(paymentsR,'Pagamentos');
  const plans=throwIfError(plansR,'Planos de trabalho');
  const steps=throwIfError(stepsR,'Etapas dos planos');
  const responsibles=throwIfError(respR,'Responsáveis');
  const deliverables=throwIfError(delivR,'Entregáveis');
  const docs=throwIfError(docsR,'Documentos');
  const comments=throwIfError(commentsR,'Comentários');

  db={version:3,
    users:profiles.map(x=>({id:x.id,name:x.nome,cpf:x.cpf||'',email:x.email||'',type:x.tipo,sector:x.setor||x.tipo,active:x.ativo!==false,createdAt:(x.created_at||'').slice(0,10)})),
    clients:clients.map(x=>({id:x.id,name:x.nome,state:x.estado,city:x.cidade||'',contact:x.telefone||x.email||x.documento||'',createdAt:(x.created_at||'').slice(0,10)})),
    projects:projects.map(x=>({id:x.id,name:x.nome,clientId:x.cliente_id||'',type:x.tipo_servico,manager:x.responsavel||'',status:x.status,start:x.data_inicio||'',deadline:x.prazo_final||'',contractValue:Number(x.valor_contrato||0),notes:x.observacoes||'',createdAt:(x.created_at||'').slice(0,10),stages:stages.filter(s=>s.projeto_id===x.id).map(s=>({id:s.id,name:s.titulo,owner:s.descricao||'',deadline:s.prazo||'',progress:Number(s.progresso||0),weight:Number(s.peso||0),status:projectStageStatusFromRemote(s.status)}))})),
    payments:payments.map(x=>({id:x.id,projectId:x.projeto_id,name:x.nome_etapa,value:Number(x.valor_previsto||0),receivedValue:Number(x.valor_recebido||0),percent:0,dueDate:x.vencimento||'',paid:x.status==='Pago',paidAt:x.data_pagamento||'',createdAt:(x.created_at||'').slice(0,10)})),
    documents:docs.map(x=>({id:x.id,projectId:x.projeto_id||'',stepId:x.etapa_plano_id||'',name:x.nome,type:x.mime_type||'',size:Number(x.tamanho_bytes||0),path:x.caminho_storage,createdAt:(x.created_at||'').slice(0,10)})),
    plans:plans.map(x=>({id:x.id,title:x.titulo,projectId:x.projeto_id||'',status:planStatusFromRemote(x.status),createdAt:(x.created_at||'').slice(0,10),comments:comments.filter(c=>c.plano_id===x.id).map(c=>({id:c.id,authorId:c.autor_id,text:c.texto,createdAt:c.created_at})),steps:steps.filter(s=>s.plano_id===x.id).map(s=>({id:s.id,title:s.titulo,deadline:s.prazo||'',status:planStepStatusFromRemote(s.status),notes:s.observacoes||'',createdAt:s.created_at||'',completedAt:s.concluido_em||'',responsibleIds:responsibles.filter(r=>r.etapa_id===s.id).map(r=>r.usuario_id),deliverables:deliverables.filter(d=>d.etapa_id===s.id).map(d=>({id:d.id,text:d.titulo,done:!!d.concluido}))}))}))
  };
  cacheDB();remoteLoaded=true;
}

async function getProfile(authUser){
  let {data,error}=await sb.from('profiles').select('*').eq('id',authUser.id).maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('Seu perfil não foi encontrado. Execute novamente o script de configuração ou confirme o usuário em public.profiles.');
  if(!data.ativo)throw new Error('Este usuário está inativo.');
  return {id:data.id,name:data.nome,cpf:data.cpf||'',email:data.email||authUser.email||'',type:data.tipo,sector:data.setor||data.tipo,active:data.ativo};
}

async function init(){
  if(!sb){renderFatal('Não foi possível carregar a conexão com o Supabase. Verifique sua internet e recarregue a página.');return;}
  const {data:{session}}=await sb.auth.getSession();
  if(!session){renderLogin();return;}
  try{
    currentUser=await getProfile(session.user);
    await loadRemoteDB();
    currentView=isAdmin()?'dashboard':'plans';
    renderApp();
  }catch(e){console.error(e);await sb.auth.signOut();renderLogin(e.message);}
}
function renderFatal(message){$('#app').innerHTML=`<main class="login-wrap"><section class="login-card"><h1>ERP Integral</h1><div class="login-error">${esc(message)}</div></section></main>`;matrixStart();}

function queueRemoteSync(){
  if(!remoteLoaded||!currentUser)return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>syncRemoteDB().catch(showSyncError),350);
}
function showSyncError(e){console.error(e);alert(`Não foi possível salvar no Supabase: ${e.message}`);}
async function upsertRows(table,rows){if(!rows.length)return;throwIfError(await sb.from(table).upsert(rows,{onConflict:'id'}),`Salvar ${table}`);}
async function deleteMissing(table,ids,extraQuery){
  if(!canManageCore())return;
  let q=sb.from(table).delete();
  if(extraQuery)q=extraQuery(q);
  if(ids.length)q=q.not('id','in',`(${ids.join(',')})`);else q=q.neq('id','00000000-0000-0000-0000-000000000000');
  const r=await q;
  if(r.error){
    if(table==='projetos'&&/foreign key|permission denied|row-level security/i.test(r.error.message))throw new Error('Não foi possível excluir um ou mais projetos: existem etapas financeiras vinculadas a eles. Peça a um administrador para excluir.');
    throw new Error(`Excluir registros antigos de ${table}: ${r.error.message}`);
  }
}
async function syncRemoteDB(){
  if(syncing){pendingSync=true;return;} syncing=true;
  try{
    if(isAdmin()){
      await upsertRows('profiles',db.users.map(u=>({id:u.id,nome:u.name||'',cpf:u.cpf||null,email:u.email||null,tipo:u.type,setor:u.sector||u.type,ativo:u.active!==false})));
    }
    if(canManageCore()){
      await upsertRows('clientes',db.clients.map(c=>({id:c.id,nome:c.name,estado:c.state,cidade:c.city||null,telefone:c.contact||null,created_by:currentUser.id})));
      await deleteMissing('clientes',db.clients.map(x=>x.id));
      await upsertRows('projetos',db.projects.map(p=>({id:p.id,cliente_id:p.clientId||null,nome:p.name,tipo_servico:p.type,responsavel:p.manager||null,status:projectStatusToRemote(p.status),data_inicio:p.start||null,prazo_final:p.deadline||null,valor_contrato:Number(p.contractValue||0),observacoes:p.notes||null,created_by:currentUser.id})));
      await deleteMissing('projetos',db.projects.map(x=>x.id));
      const projectStages=db.projects.flatMap(p=>p.stages.map((s,i)=>({id:s.id,projeto_id:p.id,titulo:s.name,descricao:s.owner||null,peso:Number(s.weight||0),progresso:Number(s.progress||0),prazo:s.deadline||null,status:projectStageStatusToRemote(s.status),ordem:i})));
      await upsertRows('etapas_projeto',projectStages);await deleteMissing('etapas_projeto',projectStages.map(x=>x.id));
      await upsertRows('planos_trabalho',db.plans.map(p=>({id:p.id,projeto_id:p.projectId||null,titulo:p.title,status:planStatusToRemote(p.status),created_by:currentUser.id})));
      await deleteMissing('planos_trabalho',db.plans.map(x=>x.id));
      const steps=db.plans.flatMap(p=>p.steps.map((s,i)=>({id:s.id,plano_id:p.id,titulo:s.title,prazo:s.deadline||null,status:planStepStatusToRemote(s.status),observacoes:s.notes||null,ordem:i})));
      await upsertRows('etapas_plano',steps);await deleteMissing('etapas_plano',steps.map(x=>x.id));
      const resp=db.plans.flatMap(p=>p.steps.flatMap(s=>s.responsibleIds.map(id=>({etapa_id:s.id,usuario_id:id}))));
      const delivs=db.plans.flatMap(p=>p.steps.flatMap(s=>s.deliverables.map((d,i)=>({id:d.id,etapa_id:s.id,titulo:d.text,concluido:!!d.done,ordem:i}))));
      const allStepIds=steps.map(x=>x.id);
      if(allStepIds.length){
        const rr=await sb.from('etapa_responsaveis').delete().in('etapa_id',allStepIds);if(rr.error)throw rr.error;
        if(resp.length){const r=await sb.from('etapa_responsaveis').insert(resp);if(r.error)throw r.error;}
      }
      await upsertRows('entregaveis',delivs);await deleteMissing('entregaveis',delivs.map(x=>x.id));
    }
    if(isAdmin()){
      await upsertRows('pagamentos',db.payments.map(x=>({id:x.id,projeto_id:x.projectId,nome_etapa:x.name,valor_previsto:Number(x.value||0),valor_recebido:Number(x.receivedValue||0),vencimento:x.dueDate||null,data_pagamento:x.paidAt||null,status:x.paid?'Pago':Number(x.receivedValue||0)>0?'Parcial':'Pendente'})));
      await deleteMissing('pagamentos',db.payments.map(x=>x.id));
    }
    if(!canManageCore()){
      const allowedSteps=db.plans.flatMap(p=>p.steps.filter(canEditStep));
      for(const step of allowedSteps){
        const r=await sb.from('etapas_plano').update({status:planStepStatusToRemote(step.status),observacoes:step.notes||null}).eq('id',step.id);
        if(r.error)throw new Error(`Atualizar etapa: ${r.error.message}`);
        for(const d of step.deliverables){
          const dr=await sb.from('entregaveis').update({concluido:!!d.done}).eq('id',d.id);
          if(dr.error)throw new Error(`Atualizar entregável: ${dr.error.message}`);
        }
      }
    }
    cacheDB();
  }finally{syncing=false;if(pendingSync){pendingSync=false;queueRemoteSync();}}
}

function matrixStart(){
  document.body.classList.add('login-mode');
  const canvas=$('#matrix'); if(!canvas)return;
  const ctx=canvas.getContext('2d'); let w,h,cols,drops,raf;
  const resize=()=>{w=canvas.width=innerWidth*devicePixelRatio;h=canvas.height=innerHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);cols=Math.ceil(innerWidth/18);drops=Array(cols).fill(0).map(()=>Math.random()*innerHeight/18)};
  resize(); window.addEventListener('resize',resize,{once:false});
  const chars='01INTEGRALREURBETSA<>[]{};/'.split('');
  const draw=()=>{ctx.fillStyle='rgba(255,255,255,.10)';ctx.fillRect(0,0,innerWidth,innerHeight);ctx.fillStyle='rgba(15,122,116,.42)';ctx.font='14px monospace';drops.forEach((y,i)=>{ctx.fillText(chars[Math.floor(Math.random()*chars.length)],i*18,y*18);if(y*18>innerHeight&&Math.random()>.975)drops[i]=0;drops[i]+=.45});raf=requestAnimationFrame(draw)};
  draw(); window.__stopMatrix=()=>cancelAnimationFrame(raf);
}
function matrixStop(){document.body.classList.remove('login-mode');if(window.__stopMatrix)window.__stopMatrix();const c=$('#matrix');if(c){const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height)}}

function renderLogin(initialError=''){
  currentUser=null;remoteLoaded=false;db=loadCache();
  $('#app').innerHTML=`<main class="login-wrap"><section class="login-card">
    <img class="login-logo" src="logo-integral.png" alt="Integral">
    <h1>ERP Integral</h1>
    <form id="loginForm">
      <div class="field"><label>E-mail</label><input id="loginEmail" type="email" autocomplete="username" required></div>
      <div class="field"><label>Senha</label><input id="loginPassword" type="password" autocomplete="current-password" required></div>
      <button class="btn wide" type="submit">Entrar</button>
      <div id="loginError" class="login-error">${esc(initialError)}</div>
    </form>
  </section></main>`;
  matrixStart();
  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const button=e.submitter||$('#loginForm button[type="submit"]');
    button.disabled=true;button.textContent='Entrando...';$('#loginError').textContent='';
    try{
      const email=normEmail($('#loginEmail').value),password=$('#loginPassword').value;
      const {data,error}=await sb.auth.signInWithPassword({email,password});
      if(error)throw error;
      currentUser=await getProfile(data.user);
      await loadRemoteDB();
      currentView=isAdmin()?'dashboard':'plans';matrixStop();renderApp();
    }catch(err){console.error(err);$('#loginError').textContent=err.message==='Invalid login credentials'?'E-mail ou senha incorretos.':err.message;await sb.auth.signOut();}
    finally{if(document.body.contains(button)){button.disabled=false;button.textContent='Entrar';}}
  });
}

const ADMIN_NAV=[['dashboard','Visão geral'],['progress','Andamentos'],['clients','Clientes'],['projects','Projetos'],['payments','Financeiro'],['documents','Documentos'],['plans','Planos de trabalho'],['metas','Metas'],['users','Usuários']];
const COMERCIAL_NAV=[['clients','Clientes'],['projects','Projetos'],['plans','Planos de trabalho']];
function navItems(){if(isAdmin())return ADMIN_NAV;if(isComercial())return COMERCIAL_NAV;if(isTechDirector())return [['metas','Metas']];if(isMetasSector())return [['plans','Planos de trabalho'],['metas','Metas']];return [['plans','Planos de trabalho']];}

async function changeOwnPassword(){
  openModal('Alterar minha senha',`<form id="ownPasswordForm" class="form-grid"><div class="field full"><label>Nova senha</label><input name="password" type="password" autocomplete="new-password" minlength="8" required></div><div class="field full"><label>Confirmar nova senha</label><input name="confirm" type="password" autocomplete="new-password" minlength="8" required></div><div id="ownPasswordStatus" class="field full muted">Use pelo menos 8 caracteres.</div></form>`,()=>$('#ownPasswordForm').requestSubmit());
  $('#ownPasswordForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),password=String(fd.get('password')||''),confirm=String(fd.get('confirm')||''),status=$('#ownPasswordStatus');if(password.length<8){status.textContent='A senha precisa ter pelo menos 8 caracteres.';return}if(password!==confirm){status.textContent='As senhas não coincidem.';return}const btn=$('#modalSave');btn.disabled=true;btn.textContent='Alterando...';const {error}=await sb.auth.updateUser({password});if(error){status.textContent=error.message;btn.disabled=false;btn.textContent='Salvar';return}status.textContent='Senha alterada com sucesso.';btn.textContent='Concluído';setTimeout(closeModal,700)};
}

function renderApp(){
  matrixStop();
  const allowedViews=navItems().map(([id])=>id);
  if(!allowedViews.includes(currentView))currentView=allowedViews[0];
  $('#app').innerHTML=`<div class="shell"><aside class="sidebar">
    <div class="brand"><img src="logo-integral.png" alt="Integral"></div>
    <nav class="nav">${navItems().map(([id,label])=>`<button data-view="${id}" class="${currentView===id?'active':''}">${label}</button>`).join('')}</nav>
    <div class="sidebar-foot"><div class="user-mini"><strong>${esc(currentUser.name)}</strong>${esc(currentUser.type)}</div><button id="changeMyPassword" class="security-link-btn" type="button">Alterar minha senha</button><button id="logout" class="btn secondary wide">Sair</button></div>
  </aside><section class="main"><header class="topbar"><h2 id="pageTitle"></h2><span class="badge">${esc(currentUser.type)}</span></header><div id="content" class="content"></div></section></div>`;
  $$('.nav button').forEach(b=>b.onclick=()=>{currentView=b.dataset.view;currentProjectId=null;searchTerm='';metasScreen='home';metasSectorFilter=null;metasBoardUser=null;renderApp()});
  $('#changeMyPassword').onclick=changeOwnPassword;
  $('#logout').onclick=async()=>{await sb.auth.signOut();renderLogin();};
  renderView();
}
function title(t){$('#pageTitle').textContent=t;}
function renderView(){
  const fn={dashboard:renderDashboard,progress:renderProgress,clients:renderClients,projects:renderProjects,payments:renderPayments,documents:renderDocuments,plans:renderPlans,metas:renderMetas,users:renderUsers}[currentView]||renderDashboard;fn();
}

function renderDashboard(){
  title('Visão geral');
  const late=db.plans.flatMap(p=>p.steps).filter(s=>s.deadline&&daysUntil(s.deadline)<0&&s.status!=='Concluída').length;
  const now=new Date();
  const months=Array.from({length:6},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()+i,1);
    const year=d.getFullYear(),month=d.getMonth();
    const payments=db.payments.filter(x=>{
      if(!x.dueDate||paymentBalance(x)<=0)return false;
      const due=new Date(`${x.dueDate}T12:00:00`);
      return due.getFullYear()===year&&due.getMonth()===month;
    });
    return {
      key:`${year}-${String(month+1).padStart(2,'0')}`,
      label:d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}),
      short:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''),
      total:payments.reduce((sum,x)=>sum+paymentBalance(x),0),
      count:payments.length
    };
  });
  const maxOpen=Math.max(...months.map(m=>m.total),1);
  const sixMonthTotal=months.reduce((sum,m)=>sum+m.total,0);
  const curMonthLabel=now.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const receivedThisMonth=db.payments.filter(x=>{
    if(!x.paidAt)return false;
    const paidAt=new Date(`${x.paidAt}T12:00:00`);
    return paidAt.getFullYear()===now.getFullYear()&&paidAt.getMonth()===now.getMonth();
  }).reduce((sum,x)=>sum+paymentReceived(x),0);
  $('#content').innerHTML=`<div class="grid cols-4">
    <div class="card metric"><h3>Clientes</h3><b>${db.clients.length}</b></div><div class="card metric"><h3>Projetos</h3><b>${db.projects.length}</b></div><div class="card metric"><h3>Planos de trabalho</h3><b>${db.plans.length}</b></div><div class="card metric"><h3>Etapas atrasadas</h3><b>${late}</b></div>
  </div>
  <section class="card receivables-card">
    <div class="section-head"><div><h4>Valores em aberto para receber</h4><span class="muted">Próximos 6 meses, atualizados automaticamente conforme a data atual</span></div><div class="receivables-totals"><div class="receivables-total highlight"><span>Recebido em ${esc(curMonthLabel)}</span><strong>${money(receivedThisMonth)}</strong></div><div class="receivables-total"><span>Total previsto (6 meses)</span><strong>${money(sixMonthTotal)}</strong></div></div></div>
    <div class="receivables-grid">${months.map(m=>`<div class="receivable-month"><div class="receivable-head"><span>${esc(m.label)}</span><b>${money(m.total)}</b></div><div class="receivable-bar"><i style="width:${Math.round(m.total/maxOpen*100)}%"></i></div><small>${m.count} etapa(s) em aberto</small></div>`).join('')}</div>
  </section>
  <h3 class="section-title">Projetos por tipo</h3><div class="grid cols-3">${SERVICE_TYPES.map(t=>`<div class="card metric"><h3>${t}</h3><b>${db.projects.filter(p=>p.type===t).length}</b></div>`).join('')}</div>`;
}

function renderProgress(){
  title('Andamentos dos projetos');
  const q=searchTerm.toLowerCase();
  const rows=db.projects.filter(p=>!q||p.name.toLowerCase().includes(q)).map(p=>{
    const plan=db.plans.find(x=>x.projectId===p.id);const total=plan?.steps.length||0;const done=plan?.steps.filter(s=>s.status==='Concluída').length||0;const pct=total?Math.round(done/total*100):0;
    return `<tr><td><button class="project-link" data-project="${p.id}">${esc(p.name)}</button></td><td>${esc(p.type)}</td><td>${esc(p.status||'Ativo')}</td><td>${done}/${total}</td><td><div class="progress"><i style="width:${pct}%"></i></div><span class="muted">${pct}%</span></td></tr>`
  }).join('');
  $('#content').innerHTML=`<div class="toolbar"><div class="left"><input id="searchProgress" class="search" placeholder="Buscar projeto pelo nome" value="${esc(searchTerm)}"></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Projeto</th><th>Tipo</th><th>Status</th><th>Etapas</th><th>Progresso</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Nenhum projeto encontrado.</td></tr>'}</tbody></table></div>`;
  $('#searchProgress').oninput=e=>{searchTerm=e.target.value;renderProgress()};
  $$('[data-project]').forEach(b=>b.onclick=()=>{currentProjectId=b.dataset.project;currentView='projects';renderApp()});
}

function renderClients(){
  title('Clientes'); const groups={};db.clients.forEach(c=>(groups[c.state||'Sem Estado']??=[]).push(c));
  $('#content').innerHTML=`<div class="toolbar"><div></div><div class="right"><button id="newClient" class="btn">Adicionar cliente</button></div></div>${Object.keys(groups).sort().map(st=>`<div class="group-title">${st}</div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Cidade</th><th>Contato</th><th></th></tr></thead><tbody>${groups[st].map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.city||'—')}</td><td>${esc(c.contact||'—')}</td><td class="actions"><button class="btn icon secondary" data-edit-client="${c.id}" title="Editar">✎</button><button class="btn icon danger" data-del-client="${c.id}" title="Excluir">×</button></td></tr>`).join('')}</tbody></table></div>`).join('')||'<div class="empty">Nenhum cliente cadastrado.</div>'}`;
  $('#newClient').onclick=()=>clientModal();$$('[data-edit-client]').forEach(b=>b.onclick=()=>clientModal(findClient(b.dataset.editClient)));$$('[data-del-client]').forEach(b=>b.onclick=()=>{if(confirm('Excluir cliente?')){db.clients=db.clients.filter(x=>x.id!==b.dataset.delClient);saveDB();renderClients()}});
}
function clientModal(c={}){openModal(c.id?'Editar cliente':'Novo cliente',`<form id="clientForm" class="form-grid"><div class="field full"><label>Nome</label><input name="name" required value="${esc(c.name||'')}"></div><div class="field"><label>Estado</label><select name="state" required><option value="">Selecione</option>${STATES.map(s=>`<option ${c.state===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="field"><label>Cidade</label><input name="city" value="${esc(c.city||'')}"></div><div class="field full"><label>Contato</label><input name="contact" value="${esc(c.contact||'')}"></div></form>`,()=>$('#clientForm').requestSubmit());$('#clientForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));if(c.id)Object.assign(c,f);else db.clients.push({id:uid(),...f,createdAt:today()});saveDB();closeModal();renderClients()}}

function projectProgress(p){
  const stages=Array.isArray(p.stages)?p.stages:[];
  if(!stages.length)return 0;
  const weighted=stages.some(s=>Number(s.weight)>0);
  if(weighted){const total=stages.reduce((a,s)=>a+Number(s.weight||0),0)||100;return Math.round(stages.reduce((a,s)=>a+(Number(s.progress||0)*Number(s.weight||0)),0)/total)}
  return Math.round(stages.reduce((a,s)=>a+Number(s.progress||0),0)/stages.length);
}
function statusBadge(v){const x=String(v||'');const c=/Conclu|Recebido|Pago/i.test(x)?'ok':/Suspenso|Pausado|Atrasado|Cancelado/i.test(x)?'danger':/Planejamento|Pendente|Não iniciada/i.test(x)?'warn':'';return `<span class="badge ${c}">${esc(x||'—')}</span>`}
function paymentReceived(x){return Math.max(0,Math.min(Number(x.value||0),x.paid?Number(x.value||0):Number(x.receivedValue||0)))}
function paymentBalance(x){return Math.max(0,Number(x.value||0)-paymentReceived(x))}
function paymentStatus(x){return x.paid||paymentBalance(x)<=0&&Number(x.value||0)>0?'Pago':paymentReceived(x)>0?'Parcial':'Pendente'}
function naturalCompare(a,b){
  const re=/(\d+)|(\D+)/g;
  const ax=String(a||'').match(re)||[],bx=String(b||'').match(re)||[];
  while(ax.length&&bx.length){
    const x=ax.shift(),y=bx.shift();
    if(x!==y){const nx=Number(x),ny=Number(y);if(!isNaN(nx)&&!isNaN(ny))return nx-ny;return x<y?-1:1}
  }
  return ax.length-bx.length;
}
function sortPayments(arr){
  return [...arr].sort((a,b)=>{
    const da=a.dueDate||'',dbb=b.dueDate||'';
    if(da&&dbb&&da!==dbb)return da<dbb?-1:1;
    if(da&&!dbb)return -1;
    if(!da&&dbb)return 1;
    return naturalCompare(a.name,b.name);
  });
}
function addMonthsClamped(y,m0,day,offset){
  const total=m0+offset,targetY=y+Math.floor(total/12),targetM=((total%12)+12)%12;
  const lastDay=new Date(targetY,targetM+1,0).getDate();
  return new Date(targetY,targetM,Math.min(day,lastDay));
}
function toISODate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function renderProjects(){
  title(currentProjectId?'Detalhes do projeto':'Projetos');
  if(currentProjectId){renderProjectDetail();return;}
  const q=searchTerm.trim().toLowerCase();
  const rows=db.projects.filter(p=>(`${p.name} ${findClient(p.clientId)?.name||''} ${p.type} ${p.manager||''}`).toLowerCase().includes(q));
  const groups={};rows.forEach(p=>(groups[p.type||'OUTROS']??=[]).push(p));
  $('#content').innerHTML=`<div class="toolbar"><div class="left"><input id="searchProjects" class="search" placeholder="Pesquisar projeto, cliente, tipo ou responsável" value="${esc(searchTerm)}"></div><div class="right"><button id="newProject" class="btn">Adicionar projeto</button></div></div>${SERVICE_TYPES.map(t=>groups[t]?.length?`<section class="project-group ${collapsedProjectGroups[t]?'collapsed':''}" data-project-group="${esc(t)}"><div class="group-title"><button type="button" class="project-group-toggle" data-toggle-project-group="${esc(t)}" aria-expanded="${collapsedProjectGroups[t]?'false':'true'}"><span class="chev">⌄</span><span>${t}</span><span>${groups[t].length}</span></button></div><div class="table-wrap"><table class="table project-table"><thead><tr><th>Projeto</th><th>Cliente</th><th>Responsável</th><th>Prazo</th><th>Andamento</th><th>Status</th><th></th></tr></thead><tbody>${groups[t].map(p=>`<tr><td><button class="project-link" data-open-project="${p.id}">${esc(p.name)}</button><small class="project-sub">Início: ${brDate(p.start)}</small></td><td>${esc(findClient(p.clientId)?.name||'—')}</td><td>${esc(p.manager||'—')}</td><td>${brDate(p.deadline)}</td><td><div class="progress"><i style="width:${projectProgress(p)}%"></i></div><span class="muted">${projectProgress(p)}%</span></td><td>${statusBadge(p.status)}</td><td class="actions"><button class="btn icon secondary" data-edit-project="${p.id}" title="Editar">✎</button><button class="btn icon danger" data-del-project="${p.id}" title="Excluir">×</button></td></tr>`).join('')}</tbody></table></div></section>`:'').join('')||'<div class="empty">Nenhum projeto encontrado.</div>'}`;
  $('#searchProjects').oninput=e=>{searchTerm=e.target.value;renderProjects()};
  $('#newProject').onclick=()=>projectModal();
  $$('[data-open-project]').forEach(b=>b.onclick=()=>{currentProjectId=b.dataset.openProject;renderProjects()});
  $$('[data-edit-project]').forEach(b=>b.onclick=()=>projectModal(findProject(b.dataset.editProject)));
  $$('[data-del-project]').forEach(b=>b.onclick=()=>deleteProject(b.dataset.delProject));
  $$('[data-toggle-project-group]').forEach(b=>b.onclick=()=>{const key=b.dataset.toggleProjectGroup;setProjectGroupCollapsed(key,!collapsedProjectGroups[key]);renderProjects()});
}
function renderProjectDetail(){
  const p=findProject(currentProjectId);if(!p){currentProjectId=null;renderProjects();return}
  const plan=db.plans.find(x=>x.projectId===p.id),pays=db.payments.filter(x=>x.projectId===p.id),docs=db.documents.filter(x=>x.projectId===p.id);
  $('#content').innerHTML=`<div class="toolbar project-detail-toolbar"><button id="backProjects" class="btn ghost">← Voltar</button><div class="right"><button id="editProjectDetail" class="btn icon secondary" title="Editar projeto">✎</button><button id="delProjectDetail" class="btn icon danger" title="Excluir projeto">×</button></div></div>
  <section class="card project-hero"><div><div class="project-kicker">${esc(p.type)}</div><h3>${esc(p.name)}</h3><p>${esc(p.notes||'Sem observações cadastradas.')}</p></div>${statusBadge(p.status)}</section>
  <div class="project-summary-grid"><div class="card summary-box"><span>Cliente</span><strong>${esc(findClient(p.clientId)?.name||'—')}</strong></div><div class="card summary-box"><span>Responsável</span><strong>${esc(p.manager||'—')}</strong></div><div class="card summary-box"><span>Prazo final</span><strong>${brDate(p.deadline)}</strong></div><div class="card summary-box"><span>Andamento</span><strong>${projectProgress(p)}%</strong><div class="progress"><i style="width:${projectProgress(p)}%"></i></div></div><div class="card summary-box"><span>Valor do contrato</span><strong>${money(p.contractValue)}</strong></div><div class="card summary-box"><span>Plano / documentos</span><strong>${plan?'1 plano':'Sem plano'} · ${docs.length} doc.</strong></div></div>
  <div class="project-columns"><section class="card"><div class="section-head"><div><h4>Etapas do projeto</h4><span class="muted">${p.stages.length} etapa(s)</span></div><button id="addProjectStage" class="btn icon secondary" title="Adicionar etapa">＋</button></div><div class="project-stage-list">${p.stages.map(s=>`<article class="project-stage"><div class="stage-main"><div><strong>${esc(s.name)}</strong><div class="meta-line"><span>${esc(s.owner||'Sem responsável')}</span><span>Prazo ${brDate(s.deadline)}</span><span>Peso ${Number(s.weight||0)}%</span></div></div>${statusBadge(s.status)}</div><div class="stage-progress-line"><div class="progress"><i style="width:${Math.max(0,Math.min(100,Number(s.progress||0)))}%"></i></div><b>${Number(s.progress||0)}%</b></div><div class="actions stage-buttons"><button class="btn icon secondary" data-edit-stage="${s.id}" title="Editar">✎</button><button class="btn icon danger" data-del-stage="${s.id}" title="Excluir">×</button></div></article>`).join('')||'<div class="empty compact">Nenhuma etapa cadastrada.</div>'}</div></section>
  ${isAdmin()?`<section class="card"><div class="section-head"><div><h4>Resumo financeiro</h4><span class="muted">${pays.length} etapa(s) de pagamento</span></div><div class="actions"><button id="genProjectPayments" class="btn small secondary" title="Gerar parcelas">Gerar parcelas</button><button id="addProjectPayment" class="btn icon secondary" title="Adicionar etapa de pagamento">＋</button></div></div><div class="finance-summary three"><div><span>Valor previsto</span><strong>${money(pays.reduce((a,b)=>a+Number(b.value||0),0))}</strong></div><div><span>Recebido</span><strong>${money(pays.reduce((a,b)=>a+paymentReceived(b),0))}</strong></div><div><span>Saldo</span><strong>${money(pays.reduce((a,b)=>a+paymentBalance(b),0))}</strong></div></div>${sortPayments(pays).slice(0,8).map(x=>`<div class="mini-payment detailed"><div><strong>${esc(x.name)}</strong><small>Vencimento ${brDate(x.dueDate)} · Recebido ${money(paymentReceived(x))}</small></div><div class="payment-mini-actions">${statusBadge(paymentStatus(x))}<button class="btn icon secondary" data-edit-project-pay="${x.id}" title="Registrar recebimento">✎</button></div></div>`).join('')||'<div class="empty compact">Nenhuma etapa de pagamento.</div>'}</section>`:''}</div>
  <section class="card project-documents-card"><div class="section-head"><div><h4>Documentos do projeto</h4><span class="muted">${docs.length} arquivo(s) vinculado(s)</span></div></div><div class="project-document-list">${docs.map(d=>`<article class="project-document-item"><div class="document-icon">↧</div><div class="document-info"><strong>${esc(d.name)}</strong><span>${brDate(d.createdAt)}${d.size?` · ${Math.max(1,Math.round(d.size/1024))} KB`:''}</span></div><button class="btn small secondary" data-project-download-doc="${d.id}">Baixar</button></article>`).join('')||'<div class="empty compact">Nenhum documento vinculado a este projeto.</div>'}</div></section>`;
  $('#backProjects').onclick=()=>{currentProjectId=null;renderProjects()};
  $('#editProjectDetail').onclick=()=>projectModal(p);$('#delProjectDetail').onclick=()=>deleteProject(p.id);$('#addProjectStage').onclick=()=>stageModal(p);
  if(isAdmin()){
    $('#addProjectPayment').onclick=()=>paymentModal({projectId:p.id},renderProjectDetail);
    $('#genProjectPayments').onclick=()=>installmentGeneratorModal(p.id,renderProjectDetail);
    $$('[data-edit-project-pay]').forEach(b=>b.onclick=()=>paymentModal(db.payments.find(x=>x.id===b.dataset.editProjectPay),renderProjectDetail));
  }
  $$('[data-edit-stage]').forEach(b=>b.onclick=()=>stageModal(p,p.stages.find(x=>x.id===b.dataset.editStage)));
  $$('[data-del-stage]').forEach(b=>b.onclick=()=>{if(confirm('Excluir etapa do projeto?')){p.stages=p.stages.filter(x=>x.id!==b.dataset.delStage);saveDB();renderProjectDetail()}});
  $$('[data-project-download-doc]').forEach(b=>b.onclick=async()=>{const d=db.documents.find(x=>x.id===b.dataset.projectDownloadDoc);if(!d)return;const {data,error}=await sb.storage.from('documentos').createSignedUrl(d.path,60);if(error){alert(`Não foi possível abrir o documento: ${error.message}`);return}window.open(data.signedUrl,'_blank','noopener')});
}
function projectModal(p={}){
  openModal(p.id?'Editar projeto':'Novo projeto',`<form id="projectForm" class="form-grid"><div class="field full"><label>Nome do projeto</label><input name="name" required value="${esc(p.name||'')}"></div><div class="field"><label>Tipo de serviço</label><select name="type" required><option value="">Selecione</option>${SERVICE_TYPES.map(t=>`<option ${p.type===t?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label>Cliente</label><select name="clientId"><option value="">Sem cliente</option>${db.clients.map(c=>`<option value="${c.id}" ${p.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Gestor / equipe responsável</label><input name="manager" value="${esc(p.manager||'')}"></div><div class="field"><label>Status</label><select name="status">${['Planejamento','Em andamento','Suspenso','Concluído','Cancelado'].map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="field"><label>Data de início</label><input type="date" name="start" value="${p.start||today()}"></div><div class="field"><label>Prazo final</label><input type="date" name="deadline" value="${p.deadline||''}"></div><div class="field full"><label>Valor do contrato</label><input type="number" step="0.01" name="contractValue" value="${Number(p.contractValue||0)}"></div><div class="field full"><label>Observações</label><textarea name="notes">${esc(p.notes||'')}</textarea></div></form>`,()=>$('#projectForm').requestSubmit());
  $('#projectForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.contractValue=Number(f.contractValue||0);if(p.id)Object.assign(p,f);else db.projects.push({id:uid(),...f,stages:[],createdAt:today()});saveDB();closeModal();currentProjectId=p.id||null;renderProjects()};
}
function stageModal(project,stage={}){
  openModal(stage.id?'Editar etapa':'Nova etapa',`<form id="stageForm" class="form-grid"><div class="field full"><label>Nome da etapa</label><input name="name" required value="${esc(stage.name||'')}"></div><div class="field"><label>Responsável</label><input name="owner" value="${esc(stage.owner||'')}"></div><div class="field"><label>Prazo</label><input type="date" name="deadline" value="${stage.deadline||''}"></div><div class="field"><label>Andamento (%)</label><input type="number" min="0" max="100" name="progress" value="${Number(stage.progress||0)}"></div><div class="field"><label>Peso no projeto (%)</label><input type="number" min="0" max="100" name="weight" value="${Number(stage.weight||0)}"></div><div class="field full"><label>Status</label><select name="status">${['Não iniciada','Em andamento','Concluída','Bloqueada'].map(s=>`<option ${stage.status===s?'selected':''}>${s}</option>`).join('')}</select></div></form>`,()=>$('#stageForm').requestSubmit());
  $('#stageForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.progress=Math.max(0,Math.min(100,Number(f.progress||0)));f.weight=Number(f.weight||0);if(stage.id)Object.assign(stage,f);else project.stages.push({id:uid(),...f});saveDB();closeModal();renderProjectDetail()};
}
function deleteProject(id){
  if(!isAdmin()&&db.payments.some(x=>x.projectId===id)){alert('Este projeto possui etapas financeiras cadastradas. Apenas um administrador pode excluí-lo.');return;}
  if(!confirm('Excluir este projeto e seus registros vinculados?'))return;db.projects=db.projects.filter(x=>x.id!==id);db.payments=db.payments.filter(x=>x.projectId!==id);db.documents=db.documents.filter(x=>x.projectId!==id);db.plans=db.plans.filter(x=>x.projectId!==id);saveDB();currentProjectId=null;renderProjects()}

function renderPayments(){
  title('Financeiro');
  const grouped={};db.payments.forEach(x=>(grouped[x.projectId]??=[]).push(x));
  $('#content').innerHTML=`<div class="toolbar"><div></div><div class="right"><button id="genPayment" class="btn secondary">Gerar parcelas</button><button id="newPayment" class="btn">Adicionar etapa de pagamento</button></div></div>${db.projects.map(p=>{
    const arr=sortPayments(grouped[p.id]||[]);
    const expected=arr.reduce((a,b)=>a+Number(b.value||0),0),received=arr.reduce((a,b)=>a+paymentReceived(b),0);
    const open=!!openPaymentGroups[p.id];
    return `<div class="card payment-group ${open?'open':''}" style="margin-bottom:14px"><button type="button" class="payment-group-toggle" data-toggle-payment="${p.id}"><div><h3>${esc(p.name)}</h3><span class="muted">${arr.length} etapa(s) · Previsto ${money(expected)} · Recebido ${money(received)} · Saldo ${money(expected-received)}</span></div><span class="chevron">${open?'▲':'▼'}</span></button>${open?(arr.length?`<div class="table-wrap"><table class="table payment-table"><thead><tr><th>Etapa</th><th>Previsto</th><th>Recebido</th><th>Saldo</th><th>Status</th><th>Vencimento</th><th></th></tr></thead><tbody>${arr.map(x=>`<tr><td>${esc(x.name)}<small class="project-sub">${Number(x.percent||0)?`${Number(x.percent)}% do contrato`:''}</small></td><td>${money(x.value)}</td><td>${money(paymentReceived(x))}</td><td>${money(paymentBalance(x))}</td><td>${statusBadge(paymentStatus(x))}${x.paidAt?`<small class="project-sub">${brDate(x.paidAt)}</small>`:''}</td><td>${brDate(x.dueDate)}</td><td class="actions">${!x.paid?`<button class="btn small secondary" data-pay-full="${x.id}" title="Marcar valor integral como pago">Marcar paga</button>`:''}<button class="btn icon secondary" data-edit-pay="${x.id}" title="Editar / registrar recebimento">✎</button><button class="btn icon danger" data-del-pay="${x.id}">×</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="muted payment-group-empty">Nenhuma etapa de pagamento.</div>'):''}</div>`}).join('')||'<div class="empty">Cadastre um projeto primeiro.</div>'}`;
  $('#newPayment').onclick=()=>paymentModal();
  $('#genPayment').onclick=()=>installmentGeneratorModal(null,renderPayments);
  $$('[data-toggle-payment]').forEach(b=>b.onclick=()=>{const id=b.dataset.togglePayment;openPaymentGroups[id]=!openPaymentGroups[id];renderPayments()});
  $$('[data-edit-pay]').forEach(b=>b.onclick=()=>paymentModal(db.payments.find(x=>x.id===b.dataset.editPay)));
  $$('[data-pay-full]').forEach(b=>b.onclick=()=>{const x=db.payments.find(v=>v.id===b.dataset.payFull);if(!x)return;if(confirm(`Marcar a etapa “${x.name}” como totalmente paga?`)){x.receivedValue=Number(x.value||0);x.paid=true;x.paidAt=today();saveDB();renderPayments()}});
  $$('[data-del-pay]').forEach(b=>b.onclick=()=>{if(confirm('Excluir etapa?')){db.payments=db.payments.filter(x=>x.id!==b.dataset.delPay);saveDB();renderPayments()}})
}
function installmentGeneratorModal(projectId,afterSave){
  const lockedProject=projectId?findProject(projectId):null;
  openModal('Gerar parcelas',`<form id="genPayForm" class="form-grid">
    <div class="field full"><label>Projeto</label>${lockedProject?`<input value="${esc(lockedProject.name)}" disabled><input type="hidden" name="projectId" value="${lockedProject.id}">`:`<select name="projectId" required><option value="">Selecione</option>${db.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>`}</div>
    <div class="field full"><label>Nome base da etapa</label><input name="baseName" required value="Parcela"></div>
    <div class="field"><label>Quantidade de parcelas</label><input name="count" type="number" min="1" max="360" step="1" required value="12"></div>
    <div class="field"><label>Valor de cada parcela</label><input name="value" type="number" min="0" step="0.01" required></div>
    <div class="field"><label>Vencimento da 1ª parcela</label><input name="firstDue" type="date" required value="${today()}"></div>
    <div class="field"><label>Repetir a cada (meses)</label><input name="interval" type="number" min="1" max="12" step="1" value="1"></div>
  </form>`,()=>$('#genPayForm').requestSubmit());
  $('#genPayForm').onsubmit=e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    if(!f.projectId){alert('Selecione um projeto.');return}
    const count=Math.max(1,Math.min(360,Math.round(Number(f.count||0))));
    const value=Math.max(0,Number(f.value||0));
    const interval=Math.max(1,Math.min(12,Math.round(Number(f.interval||1))));
    const base=(f.baseName||'Parcela').trim()||'Parcela';
    const [y,m,d]=f.firstDue.split('-').map(Number);
    for(let i=0;i<count;i++){
      const due=addMonthsClamped(y,m-1,d,i*interval);
      db.payments.push({id:uid(),projectId:f.projectId,name:`${base} ${i+1}/${count}`,value,receivedValue:0,percent:0,dueDate:toISODate(due),paid:false,paidAt:'',createdAt:today()});
    }
    openPaymentGroups[f.projectId]=true;
    saveDB();closeModal();
    if(typeof afterSave==='function')afterSave();else renderPayments();
  };
}
function paymentModal(x={},afterSave){
  const isPaid=!!x.paid||paymentStatus(x)==='Pago';
  openModal(x.id?'Editar etapa de pagamento':'Nova etapa de pagamento',`<form id="payForm" class="form-grid"><div class="field full"><label>Projeto</label><select name="projectId" required><option value="">Selecione</option>${db.projects.map(p=>`<option value="${p.id}" ${x.projectId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div class="field full"><label>Etapa de pagamento</label><input name="name" required value="${esc(x.name||'')}"></div><div class="field"><label>Valor previsto</label><input name="value" type="number" min="0" step="0.01" value="${Number(x.value||0)||''}"></div><div class="field"><label>Valor já recebido</label><input name="receivedValue" type="number" min="0" step="0.01" value="${paymentReceived(x)||''}"></div><div class="field"><label>Percentual do contrato</label><input name="percent" type="number" min="0" step="0.01" value="${Number(x.percent||0)||''}"></div><div class="field"><label>Vencimento</label><input name="dueDate" type="date" value="${x.dueDate||''}"></div><div class="field full"><label class="check-item payment-paid-check"><input id="paymentPaid" name="paid" type="checkbox" ${isPaid?'checked':''}> Marcar esta etapa como totalmente paga</label><span class="muted">Ao marcar, o valor recebido será igualado ao valor previsto.</span></div><div class="field full"><label>Data do pagamento integral</label><input name="paidAt" type="date" value="${x.paidAt||''}"></div></form>`,()=>$('#payForm').requestSubmit());
  $('#paymentPaid').onchange=e=>{if(e.target.checked){const form=$('#payForm');form.elements.receivedValue.value=form.elements.value.value;form.elements.paidAt.value=form.elements.paidAt.value||today()}};
  $('#payForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),f=Object.fromEntries(fd);f.value=Math.max(0,Number(f.value||0));f.receivedValue=Math.max(0,Math.min(f.value,Number(f.receivedValue||0)));f.percent=Math.max(0,Number(f.percent||0));f.paid=fd.get('paid')==='on'||(f.value>0&&f.receivedValue>=f.value);if(f.paid){f.receivedValue=f.value;f.paidAt=f.paidAt||today()}else if(!f.paidAt)f.paidAt='';if(x.id)Object.assign(x,f);else db.payments.push({id:uid(),...f,createdAt:today()});saveDB();closeModal();if(typeof afterSave==='function')afterSave();else renderPayments()}
}


function renderDocuments(){
  title('Documentos');
  $('#content').innerHTML=`<div class="toolbar"><div></div><button id="newDocument" class="btn">Enviar documento</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Arquivo</th><th>Projeto</th><th>Data</th><th></th></tr></thead><tbody>${db.documents.map(d=>`<tr><td>${esc(d.name)}</td><td>${esc(findProject(d.projectId)?.name||'—')}</td><td>${brDate(d.createdAt)}</td><td class="actions"><button class="btn small secondary" data-download-doc="${d.id}">Baixar</button>${isAdmin()?`<button class="btn icon danger" data-del-doc="${d.id}">×</button>`:''}</td></tr>`).join('')||'<tr><td colspan="4">Nenhum documento enviado.</td></tr>'}</tbody></table></div>`;
  $('#newDocument').onclick=documentModal;
  $$('[data-download-doc]').forEach(b=>b.onclick=async()=>{
    const d=db.documents.find(x=>x.id===b.dataset.downloadDoc);if(!d)return;
    const {data,error}=await sb.storage.from('documentos').createSignedUrl(d.path,60);
    if(error){alert(`Não foi possível abrir o documento: ${error.message}`);return;}
    window.open(data.signedUrl,'_blank','noopener');
  });
  $$('[data-del-doc]').forEach(b=>b.onclick=async()=>{
    const d=db.documents.find(x=>x.id===b.dataset.delDoc);if(!d||!confirm('Excluir documento?'))return;
    const sr=await sb.storage.from('documentos').remove([d.path]);if(sr.error){alert(sr.error.message);return;}
    const rr=await sb.from('documentos').delete().eq('id',d.id);if(rr.error){alert(rr.error.message);return;}
    db.documents=db.documents.filter(x=>x.id!==d.id);cacheDB();renderDocuments();
  });
}
function documentModal(){
  openModal('Enviar documento',`<form id="docForm" class="form-grid"><div class="field full"><label>Projeto</label><select name="projectId" required><option value="">Selecione</option>${db.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><div class="field full"><label>Arquivo (até 50 MB)</label><input id="docFile" type="file" required></div><div id="uploadStatus" class="field full muted"></div></form>`,()=>$('#docForm').requestSubmit());
  $('#docForm').onsubmit=async e=>{
    e.preventDefault();const fd=new FormData(e.target),file=$('#docFile').files[0],projectId=fd.get('projectId');if(!file||!projectId)return;
    if(file.size>52428800){alert('O arquivo excede 50 MB.');return;}
    const status=$('#uploadStatus');status.textContent='Enviando arquivo...';
    const safeName=file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${currentUser.id}/${projectId}/${uid()}-${safeName}`;
    const upload=await sb.storage.from('documentos').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(upload.error){status.textContent='';alert(`Falha no upload: ${upload.error.message}`);return;}
    const id=uid();
    const meta=await sb.from('documentos').insert({id,projeto_id:projectId,nome:file.name,caminho_storage:path,mime_type:file.type||null,tamanho_bytes:file.size,enviado_por:currentUser.id}).select().single();
    if(meta.error){await sb.storage.from('documentos').remove([path]);status.textContent='';alert(`Falha ao salvar o documento: ${meta.error.message}`);return;}
    db.documents.unshift({id,projectId,name:file.name,path,type:file.type,size:file.size,createdAt:today()});cacheDB();closeModal();renderDocuments();
  };
}

function renderPlans(){
  title('Planos de trabalho');
  const plans=db.plans.filter(canSeePlan);
  $('#content').innerHTML=`${canManageCore()?'<div class="toolbar"><div></div><button id="newPlan" class="btn">Criar plano de trabalho</button></div>':''}${plans.map(planCard).join('')||'<div class="empty">Nenhum plano de trabalho disponível para este usuário.</div>'}`;
  if(canManageCore())$('#newPlan').onclick=()=>planModal();
  $$('[data-edit-plan]').forEach(b=>b.onclick=()=>planModal(db.plans.find(x=>x.id===b.dataset.editPlan)));
  $$('[data-del-plan]').forEach(b=>b.onclick=()=>{if(confirm('Excluir plano?')){db.plans=db.plans.filter(x=>x.id!==b.dataset.delPlan);saveDB();renderPlans()}});
  $$('[data-add-step]').forEach(b=>b.onclick=()=>stepModal(db.plans.find(x=>x.id===b.dataset.addStep)));
  $$('[data-edit-step]').forEach(b=>{b.onclick=()=>{const p=db.plans.find(x=>x.id===b.dataset.plan);stepModal(p,p.steps.find(x=>x.id===b.dataset.editStep))}});
  $$('[data-del-step]').forEach(b=>b.onclick=()=>{const p=db.plans.find(x=>x.id===b.dataset.plan);if(confirm('Excluir etapa?')){p.steps=p.steps.filter(x=>x.id!==b.dataset.delStep);saveDB();renderPlans()}});
  $$('[data-step-status]').forEach(s=>s.onchange=()=>updateStepField(s.dataset.plan,s.dataset.step,'status',s.value));
  $$('[data-step-notes]').forEach(t=>t.onchange=()=>updateStepField(t.dataset.plan,t.dataset.step,'notes',t.value));
  $$('[data-deliverable]').forEach(c=>c.onchange=()=>{const p=db.plans.find(x=>x.id===c.dataset.plan),s=p.steps.find(x=>x.id===c.dataset.step),d=s.deliverables.find(x=>x.id===c.dataset.deliverable);if(canEditStep(s)){d.done=c.checked;saveDB();renderPlans()}});
}
function planCard(p){const project=findProject(p.projectId);const total=p.steps.reduce((a,s)=>a+s.deliverables.length,0),done=p.steps.reduce((a,s)=>a+s.deliverables.filter(d=>d.done).length,0),pct=total?Math.round(done/total*100):0;return `<section class="card plan-card"><div class="plan-head"><div><h3>${esc(p.title)}</h3><div class="plan-meta"><span class="badge">${esc(project?.name||'Sem projeto')}</span><span class="badge ${p.status==='Concluído'?'ok':''}">${esc(p.status)}</span><span class="badge">${pct}% dos entregáveis</span></div></div>${canManageCore()?`<div class="actions"><button class="btn icon secondary" data-edit-plan="${p.id}" title="Editar plano">✎</button><button class="btn icon danger" data-del-plan="${p.id}" title="Excluir plano">×</button></div>`:''}</div><div class="progress"><i style="width:${pct}%"></i></div>${p.steps.length?p.steps.map(s=>stepCard(p,s)).join(''):'<div class="notice">Este plano ainda não possui etapas.</div>'}${canManageCore()?`<div style="margin-top:12px"><button class="btn small secondary" data-add-step="${p.id}">+ Adicionar etapa</button></div>`:''}</section>`}
function stepCard(p,s){const editable=canEditStep(s);const names=s.responsibleIds.map(id=>findUser(id)?.name).filter(Boolean).join(', ')||'Sem responsáveis';const d=daysUntil(s.deadline);const deadlineBadge=s.deadline?(d<0&&s.status!=='Concluída'?'<span class="badge danger">Atrasada</span>':d<=7?'<span class="badge warn">Prazo próximo</span>':''):'';const pct=s.deliverables.length?Math.round(s.deliverables.filter(x=>x.done).length/s.deliverables.length*100):0;return `<div class="step ${editable?'':'readonly'}"><div class="step-top"><div><div class="step-title">${esc(s.title)} ${deadlineBadge}</div><span class="muted">${editable?'Você pode atualizar esta etapa':'Somente visualização'}</span></div>${canManageCore()?`<div class="actions"><button class="btn icon secondary" data-plan="${p.id}" data-edit-step="${s.id}">✎</button><button class="btn icon danger" data-plan="${p.id}" data-del-step="${s.id}">×</button></div>`:''}</div><div class="step-info"><div class="info-box"><b>Prazo</b>${brDate(s.deadline)}</div><div class="info-box"><b>Responsáveis</b>${esc(names)}</div><div class="info-box"><b>Progresso</b>${pct}%</div></div><div class="field"><label>Status</label>${editable?`<select data-step-status data-plan="${p.id}" data-step="${s.id}">${['Pendente','Em andamento','Aguardando','Concluída'].map(x=>`<option ${s.status===x?'selected':''}>${x}</option>`).join('')}</select>`:`<div class="badge">${esc(s.status)}</div>`}</div><div class="deliverables"><b>Entregáveis</b>${s.deliverables.length?s.deliverables.map(d=>`<label class="deliverable ${d.done?'done':''}"><input type="checkbox" data-deliverable="${d.id}" data-plan="${p.id}" data-step="${s.id}" ${d.done?'checked':''} ${editable?'':'disabled'}><span>${esc(d.text)}</span></label>`).join(''):'<div class="muted">Nenhum entregável cadastrado.</div>'}</div><div class="field"><label>Observações</label>${editable?`<textarea data-step-notes data-plan="${p.id}" data-step="${s.id}">${esc(s.notes)}</textarea>`:`<div class="info-box">${esc(s.notes||'Sem observações')}</div>`}</div></div>`}
function updateStepField(pid,sid,key,val){const p=db.plans.find(x=>x.id===pid),s=p?.steps.find(x=>x.id===sid);if(s&&canEditStep(s)){s[key]=val;if(key==='status')s.completedAt=val==='Concluída'?new Date().toISOString():'';saveDB();renderPlans()}}
function planModal(p={}){openModal(p.id?'Editar plano':'Novo plano de trabalho',`<form id="planForm" class="form-grid"><div class="field full"><label>Título</label><input name="title" required value="${esc(p.title||'')}"></div><div class="field"><label>Projeto</label><select name="projectId" required><option value="">Selecione</option>${db.projects.map(x=>`<option value="${x.id}" ${p.projectId===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label>Status</label><select name="status">${['Em andamento','Pausado','Concluído'].map(x=>`<option ${p.status===x?'selected':''}>${x}</option>`).join('')}</select></div></form>`,()=>$('#planForm').requestSubmit());$('#planForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));if(p.id)Object.assign(p,f);else db.plans.push({id:uid(),...f,createdAt:today(),steps:[]});saveDB();closeModal();renderPlans()}}
function stepModal(plan,s={}){let deliverables=(s.deliverables||[]).map(d=>({...d}));openModal(s.id?'Editar etapa':'Nova etapa',`<form id="stepForm" class="form-grid"><div class="field full"><label>Nome da etapa</label><input name="title" required value="${esc(s.title||'')}"></div><div class="field"><label>Prazo</label><input name="deadline" type="date" value="${s.deadline||''}"></div><div class="field"><label>Status</label><select name="status">${['Pendente','Em andamento','Aguardando','Concluída'].map(x=>`<option ${s.status===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field full"><label>Responsáveis (selecione um ou mais)</label><div class="check-grid">${db.users.filter(u=>u.active&&!['Administrador','Diretor Técnico'].includes(u.type)).map(u=>`<label class="check-item"><input type="checkbox" name="responsibleIds" value="${u.id}" ${(s.responsibleIds||[]).includes(u.id)?'checked':''}>${esc(u.name)} <span class="muted">(${esc(u.type)})</span></label>`).join('')||'<div class="notice">Cadastre usuários operacionais primeiro.</div>'}</div></div><div class="field full"><label>Entregáveis</label><div class="inline-add"><input id="newDeliverable" placeholder="Digite um entregável"><button id="addDeliverable" class="btn secondary" type="button">Adicionar</button></div><div id="deliverableTags" class="tag-list"></div></div><div class="field full"><label>Observações</label><textarea name="notes">${esc(s.notes||'')}</textarea></div></form>`,()=>$('#stepForm').requestSubmit());
  const draw=()=>{$('#deliverableTags').innerHTML=deliverables.map(d=>`<span class="tag">${esc(d.text)}<button type="button" data-remove-del="${d.id}">×</button></span>`).join('');$$('[data-remove-del]').forEach(b=>b.onclick=()=>{deliverables=deliverables.filter(x=>x.id!==b.dataset.removeDel);draw()})};draw();
  $('#addDeliverable').onclick=()=>{const input=$('#newDeliverable'),text=input.value.trim();if(text){deliverables.push({id:uid(),text,done:false});input.value='';draw()}};
  $('#stepForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),responsibleIds=fd.getAll('responsibleIds');if(!responsibleIds.length){alert('Selecione pelo menos um responsável.');return}const f={title:fd.get('title'),deadline:fd.get('deadline'),status:fd.get('status'),notes:fd.get('notes'),responsibleIds,deliverables};if(s.id)Object.assign(s,f);else plan.steps.push({id:uid(),...f});saveDB();closeModal();renderPlans()};
}

function renderMetas(){
  if(!canSeeMetas()){currentView='plans';renderPlans();return}
  if(metasScreen==='board')renderMetasBoard();
  else if(metasScreen==='ativas'&&isMetasManager())renderMetasAtivas();
  else{metasScreen='home';renderMetasHome();}
}
function metasKpiHtml(steps){
  const k=metasKpis(steps);
  return `<div class="grid cols-3" style="margin-bottom:18px"><div class="card metric"><h3>Metas ativas</h3><b>${k.ativas}</b></div><div class="card metric"><h3>Metas em aberto (atrasadas)</h3><b>${k.emAberto}</b></div><div class="card metric"><h3>Tempo médio de realização</h3><b>${fmtDuration(k.tempoMedio)}</b></div></div>`;
}
function metasCalendar(allSteps){
  const days=weekDays(metasWeekOffset);
  const steps=allSteps.filter(s=>s.deadline);
  const label=`${days[0].toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} – ${days[6].toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}`;
  return `<section class="card metas-calendar-card"><div class="metas-calendar-head"><button id="metasWeekPrev" type="button" class="btn icon secondary">‹</button><h4>${esc(label)}</h4><button id="metasWeekNext" type="button" class="btn icon secondary">›</button>${metasWeekOffset!==0?'<button id="metasWeekToday" type="button" class="btn small secondary">Hoje</button>':''}</div><div class="metas-calendar-grid">${days.map(d=>{
    const iso=toISODate(d),dayEvents=steps.filter(s=>s.deadline===iso),isToday=iso===today();
    return `<div class="metas-cal-day ${isToday?'today':''}"><div class="metas-cal-daylabel">${WEEKDAY_LABELS[d.getDay()]}<b>${d.getDate()}</b></div><div class="metas-cal-events">${dayEvents.map(s=>`<button type="button" class="metas-cal-event ${s.status==='Concluída'?'done':''}" data-cal-plan="${s.planId}" title="${esc(s.planTitle)} — ${esc(s.title)}">${esc(s.title)}</button>`).join('')}</div></div>`;
  }).join('')}</div></section>`;
}
function renderMetasHome(){
  title('Metas');
  const employees=isMetasManager()?metasScopeUsers():[db.users.find(u=>u.id===currentUser.id)||{id:currentUser.id,name:currentUser.name,type:currentUser.type}];
  const steps=employees.flatMap(u=>stepsForUser(u.id));
  $('#content').innerHTML=`<div class="toolbar"><div></div><div class="right"><button id="metasAtivasBtn" class="btn">Metas Ativas</button></div></div>${metasKpiHtml(steps)}${metasCalendar(steps)}<h3 class="section-title">Funcionários</h3><div class="metas-emp-grid">${employees.map(u=>{
    const k=metasKpis(stepsForUser(u.id));
    return `<button type="button" class="card metas-emp-card" data-open-board="${u.id}"><div class="metas-emp-head"><strong>${esc(u.name)}</strong><span class="badge">${esc(u.type)}</span></div><div class="metas-emp-stats"><div><b>${k.ativas}</b><span>Ativas</span></div><div><b>${k.emAberto}</b><span>Atrasadas</span></div><div><b>${fmtDuration(k.tempoMedio)}</b><span>Tempo médio</span></div></div></button>`;
  }).join('')||'<div class="empty compact">Nenhum funcionário nos setores de Metas.</div>'}</div>`;
  $('#metasAtivasBtn').onclick=()=>{if(isMetasManager()){metasScreen='ativas';metasSectorFilter=null;}else{metasBoardUser=currentUser.id;metasScreen='board';}renderMetas()};
  $('#metasWeekPrev').onclick=()=>{metasWeekOffset--;renderMetas()};
  $('#metasWeekNext').onclick=()=>{metasWeekOffset++;renderMetas()};
  $('#metasWeekToday')?.addEventListener('click',()=>{metasWeekOffset=0;renderMetas()});
  $$('[data-cal-plan]').forEach(b=>b.onclick=()=>{const plan=db.plans.find(x=>x.id===b.dataset.calPlan);if(plan)metasCardModal(plan,()=>renderMetas())});
  $$('[data-open-board]').forEach(b=>b.onclick=()=>{metasBoardUser=b.dataset.openBoard;metasScreen='board';renderMetas()});
}
function renderMetasAtivas(){
  title('Metas ativas');
  const sectorCounts=METAS_SECTORS.map(sec=>{
    const users=db.users.filter(u=>u.active&&u.type===sec);
    return {sector:sec,users,k:metasKpis(users.flatMap(u=>stepsForUser(u.id)))};
  });
  const allUsers=metasScopeUsers();
  $('#content').innerHTML=`<div class="toolbar"><button id="metasBack" class="btn ghost">← Voltar</button></div><div class="metas-ativas-groups"><section class="card"><h4>Setor</h4><div class="metas-group-list">${sectorCounts.map(sc=>`<button type="button" class="metas-group-item ${metasSectorFilter===sc.sector?'active':''}" data-sector="${esc(sc.sector)}"><strong>${esc(sc.sector)}</strong><span class="muted">${sc.users.length} funcionário(s) · ${sc.k.ativas} meta(s) ativa(s)</span></button>`).join('')}</div>${metasSectorFilter?`<div class="metas-group-sub"><h5>${esc(metasSectorFilter)}</h5>${db.users.filter(u=>u.active&&u.type===metasSectorFilter).map(u=>{const k=metasKpis(stepsForUser(u.id));return `<button type="button" class="metas-group-item" data-board="${u.id}"><strong>${esc(u.name)}</strong><span class="muted">${k.ativas} ativa(s) · ${k.emAberto} atrasada(s)</span></button>`;}).join('')||'<div class="empty compact">Nenhum funcionário ativo neste setor.</div>'}</div>`:''}</section><section class="card"><h4>Funcionários</h4><div class="metas-group-list">${allUsers.map(u=>{const k=metasKpis(stepsForUser(u.id));return `<button type="button" class="metas-group-item" data-board="${u.id}"><strong>${esc(u.name)}</strong><span class="muted">${esc(u.type)} · ${k.ativas} ativa(s)</span></button>`;}).join('')||'<div class="empty compact">Nenhum funcionário cadastrado.</div>'}</div></section></div>`;
  $('#metasBack').onclick=()=>{metasScreen='home';renderMetas()};
  $$('[data-sector]').forEach(b=>b.onclick=()=>{metasSectorFilter=metasSectorFilter===b.dataset.sector?null:b.dataset.sector;renderMetas()});
  $$('[data-board]').forEach(b=>b.onclick=()=>{metasBoardUser=b.dataset.board;metasScreen='board';renderMetas()});
}
function metasPlanCardHtml(p,userId){
  const project=findProject(p.projectId);
  const mySteps=p.steps.filter(s=>s.responsibleIds.includes(userId));
  const total=p.steps.length,done=p.steps.filter(s=>s.status==='Concluída').length,pct=total?Math.round(done/total*100):0;
  const nextDeadline=mySteps.map(s=>s.deadline).filter(Boolean).sort()[0];
  return `<button type="button" class="metas-plan-card" data-open-metas-plan="${p.id}"><strong>${esc(p.title)}</strong><span class="muted">${esc(project?.name||'Sem projeto')}</span><div class="progress"><i style="width:${pct}%"></i></div><div class="metas-plan-card-foot"><span>${done}/${total} etapas</span>${nextDeadline?`<span>Prazo ${brDate(nextDeadline)}</span>`:''}</div></button>`;
}
function renderMetasBoard(){
  const u=metasBoardUser===currentUser.id?currentUser:findUser(metasBoardUser);
  if(!u){metasScreen='home';renderMetas();return}
  title(`Metas — ${u.name}`);
  const plans=db.plans.filter(p=>p.steps.some(s=>s.responsibleIds.includes(u.id)));
  $('#content').innerHTML=`<div class="toolbar"><button id="metasBack" class="btn ghost">← Voltar</button><div class="right">${isMetasManager()?'<button id="metasNewStep" class="btn">+ Nova meta</button>':''}<span class="badge">${esc(u.type)}</span></div></div>${metasKpiHtml(stepsForUser(u.id))}<div class="metas-board">${PLAN_STATUS_COLUMNS.map(col=>{
    const colPlans=plans.filter(p=>p.status===col);
    return `<div class="metas-board-col"><div class="metas-board-col-head">${esc(col)}<span>${colPlans.length}</span></div>${colPlans.map(p=>metasPlanCardHtml(p,u.id)).join('')||'<div class="metas-board-empty">Nenhum plano</div>'}</div>`;
  }).join('')}</div>`;
  $('#metasBack').onclick=()=>{metasScreen=isMetasManager()?'ativas':'home';renderMetas()};
  $('#metasNewStep')?.addEventListener('click',()=>metasNewStepModal({defaultResponsibleId:u.id,onDone:()=>renderMetas()}));
  $$('[data-open-metas-plan]').forEach(b=>b.onclick=()=>{const plan=db.plans.find(x=>x.id===b.dataset.openMetasPlan);if(plan)metasCardModal(plan,()=>renderMetas())});
}
async function createMetaStep(planId,{title,deadline,responsibleIds}){
  const plan=db.plans.find(x=>x.id===planId);if(!plan)return null;
  const id=uid();
  const ordem=plan.steps.length;
  const r=await sb.from('etapas_plano').insert({id,plano_id:planId,titulo:title,prazo:deadline||null,status:'Pendente',ordem}).select().single();
  if(r.error){alert(`Não foi possível criar a meta: ${r.error.message}`);return null}
  if(responsibleIds.length){
    const rr=await sb.from('etapa_responsaveis').insert(responsibleIds.map(usuarioId=>({etapa_id:id,usuario_id:usuarioId})));
    if(rr.error)alert(`Meta criada, mas não foi possível atribuir responsáveis: ${rr.error.message}`);
  }
  const step={id,title,deadline:deadline||'',status:'Pendente',notes:'',createdAt:r.data?.created_at||new Date().toISOString(),completedAt:'',responsibleIds:[...responsibleIds],deliverables:[]};
  plan.steps.push(step);
  cacheDB();
  return step;
}
function metasNewStepModal({planId=null,defaultResponsibleId=null,onDone}={}){
  const lockedPlan=planId?db.plans.find(x=>x.id===planId):null;
  const assignable=db.users.filter(u=>u.active&&!['Administrador','Diretor Técnico'].includes(u.type));
  openModal('Nova meta',`<form id="metaStepForm" class="form-grid">
    <div class="field full"><label>Plano de trabalho</label>${lockedPlan?`<input value="${esc(lockedPlan.title)}" disabled><input type="hidden" name="planId" value="${lockedPlan.id}">`:`<select name="planId" required><option value="">Selecione</option>${db.plans.map(p=>`<option value="${p.id}">${esc(p.title)} — ${esc(findProject(p.projectId)?.name||'Sem projeto')}</option>`).join('')}</select>`}</div>
    <div class="field full"><label>Título da meta</label><input name="title" required placeholder="Ex.: Levantamento topográfico do lote 12"></div>
    <div class="field"><label>Prazo</label><input name="deadline" type="date"></div>
    <div class="field full"><label>Responsáveis</label><div class="check-grid">${assignable.map(u=>`<label class="check-item"><input type="checkbox" name="responsibleIds" value="${u.id}" ${defaultResponsibleId===u.id?'checked':''}>${esc(u.name)} <span class="muted">(${esc(u.type)})</span></label>`).join('')||'<div class="notice">Cadastre funcionários operacionais primeiro.</div>'}</div></div>
  </form>`,()=>$('#metaStepForm').requestSubmit());
  $('#metaStepForm').onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const targetPlanId=lockedPlan?lockedPlan.id:fd.get('planId');
    if(!targetPlanId){alert('Selecione um plano de trabalho.');return}
    const title=(fd.get('title')||'').trim();if(!title){alert('Informe um título para a meta.');return}
    const saveBtn=$('#modalSave');if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Salvando...';}
    const step=await createMetaStep(targetPlanId,{title,deadline:fd.get('deadline')||'',responsibleIds:fd.getAll('responsibleIds')});
    if(!step){if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Salvar';}return}
    closeModal();
    if(typeof onDone==='function')onDone();
  };
}
function setStepStatus(pid,sid,status){const p=db.plans.find(x=>x.id===pid),s=p?.steps.find(x=>x.id===sid);if(s&&canEditStep(s)){s.status=status;s.completedAt=status==='Concluída'?new Date().toISOString():'';saveDB();return true}return false}
function metasChecklistHtml(plan){
  const items=plan.steps.length?plan.steps.map(s=>{
    const editable=canEditStep(s);
    const names=s.responsibleIds.map(id=>findUser(id)?.name).filter(Boolean).join(', ')||'Sem responsáveis';
    return `<label class="deliverable metas-checklist-item ${s.status==='Concluída'?'done':''}"><input type="checkbox" data-metas-step-toggle="${s.id}" ${s.status==='Concluída'?'checked':''} ${editable?'':'disabled'}><span><strong>${esc(s.title)}</strong><small class="muted">${esc(names)}${s.deadline?` · Prazo ${brDate(s.deadline)}`:''}</small></span></label>`;
  }).join(''):'<div class="empty compact">Este plano ainda não possui etapas.</div>';
  const addRow=isMetasManager()?`<div class="metas-checklist-add"><input id="newMetaChecklistTitle" placeholder="Novo item do checklist"><input id="newMetaChecklistDeadline" type="date" title="Prazo (opcional)"><button type="button" id="addMetaChecklistItem" class="btn small secondary">+ Adicionar</button></div>`:'';
  return items+addRow;
}
function metasPrazosHtml(plan){
  if(!plan.steps.length)return '<div class="empty compact">Sem etapas cadastradas.</div>';
  const sorted=[...plan.steps].sort((a,b)=>(a.deadline||'9999-12-31')<(b.deadline||'9999-12-31')?-1:1);
  return `<div class="metas-prazos-list">${sorted.map(s=>{
    const d=daysUntil(s.deadline);const badge=s.deadline?(d<0&&s.status!=='Concluída'?'<span class="badge danger">Atrasada</span>':d<=7&&s.status!=='Concluída'?'<span class="badge warn">Prazo próximo</span>':''):'';
    return `<div class="metas-prazo-item"><div><strong>${esc(s.title)}</strong><span class="muted">${esc(s.status)}</span></div><div>${brDate(s.deadline)} ${badge}</div></div>`;
  }).join('')}</div>`;
}
function metasComentariosHtml(plan){
  const list=plan.comments.map(c=>{
    const author=findUser(c.authorId);const mine=c.authorId===currentUser.id;
    return `<div class="metas-comment"><div class="metas-comment-head"><strong>${esc(author?.name||(mine?currentUser.name:'Usuário'))}</strong><span class="muted">${new Date(c.createdAt).toLocaleString('pt-BR')}</span>${mine?`<button type="button" class="btn icon ghost" data-del-comment="${c.id}" title="Excluir">×</button>`:''}</div><p>${esc(c.text).replace(/\n/g,'<br>')}</p></div>`;
  }).join('')||'<div class="empty compact">Nenhum comentário ainda.</div>';
  return `<div class="metas-comment-list">${list}</div><div class="metas-comment-form"><textarea id="newMetasComment" placeholder="Escreva um comentário..."></textarea><button type="button" id="addMetasComment" class="btn secondary">Comentar</button></div>`;
}
async function addMetasComment(plan,onChange){
  const ta=$('#newMetasComment');const text=(ta?.value||'').trim();if(!text)return;
  const id=uid();
  const r=await sb.from('comentarios_plano').insert({id,plano_id:plan.id,autor_id:currentUser.id,texto:text});
  if(r.error){alert(`Não foi possível salvar o comentário: ${r.error.message}`);return}
  plan.comments.push({id,authorId:currentUser.id,text,createdAt:new Date().toISOString()});
  cacheDB();closeModal();onChange&&onChange();metasCardModal(plan,onChange);
}
async function deleteMetasComment(plan,commentId,onChange){
  if(!confirm('Excluir comentário?'))return;
  const r=await sb.from('comentarios_plano').delete().eq('id',commentId);
  if(r.error){alert(r.error.message);return}
  plan.comments=plan.comments.filter(c=>c.id!==commentId);
  cacheDB();closeModal();onChange&&onChange();metasCardModal(plan,onChange);
}
function wireMetasCardEvents(plan,onChange){
  $$('[data-metas-step-toggle]').forEach(cb=>cb.onchange=()=>{
    const s=plan.steps.find(x=>x.id===cb.dataset.metasStepToggle);
    if(s&&setStepStatus(plan.id,s.id,cb.checked?'Concluída':'Em andamento')){closeModal();onChange&&onChange();metasCardModal(plan,onChange);}
  });
  const addBtn=$('#addMetasComment');if(addBtn)addBtn.onclick=()=>addMetasComment(plan,onChange);
  $$('[data-del-comment]').forEach(b=>b.onclick=()=>deleteMetasComment(plan,b.dataset.delComment,onChange));
  const addChecklistBtn=$('#addMetaChecklistItem');
  if(addChecklistBtn)addChecklistBtn.onclick=async()=>{
    const title=($('#newMetaChecklistTitle')?.value||'').trim();if(!title)return;
    const deadline=$('#newMetaChecklistDeadline')?.value||'';
    addChecklistBtn.disabled=true;
    const step=await createMetaStep(plan.id,{title,deadline,responsibleIds:metasScreen==='board'&&metasBoardUser?[metasBoardUser]:[]});
    if(!step){addChecklistBtn.disabled=false;return}
    closeModal();onChange&&onChange();metasCardModal(plan,onChange);
  };
}
function metasCardModal(plan,onChange){
  const project=findProject(plan.projectId);
  const body=`<div class="metas-modal-meta"><span class="badge">${esc(project?.name||'Sem projeto')}</span><span class="badge ${plan.status==='Concluído'?'ok':''}">${esc(plan.status)}</span></div>
  <div class="metas-tabs"><button type="button" class="metas-tab active" data-metas-tab="checklist">Checklist</button><button type="button" class="metas-tab" data-metas-tab="prazos">Prazos</button><button type="button" class="metas-tab" data-metas-tab="comentarios">Comentários (${plan.comments.length})</button></div>
  <div class="metas-tab-panel" data-metas-panel="checklist">${metasChecklistHtml(plan)}</div>
  <div class="metas-tab-panel hidden" data-metas-panel="prazos">${metasPrazosHtml(plan)}</div>
  <div class="metas-tab-panel hidden" data-metas-panel="comentarios">${metasComentariosHtml(plan)}</div>`;
  openModal(plan.title,body,closeModal);
  $$('.metas-tab').forEach(t=>t.onclick=()=>{$$('.metas-tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');$$('.metas-tab-panel').forEach(p=>p.classList.toggle('hidden',p.dataset.metasPanel!==t.dataset.metasTab));});
  wireMetasCardEvents(plan,onChange);
}

function renderUsers(){
  title('Usuários');
  $('#content').innerHTML=`<div class="toolbar"><div><b>Equipe e acessos</b><div class="muted">Clique em um usuário para editar dados, acesso e consultar o histórico de metas.</div></div><button id="newUser" class="btn">Adicionar usuário</button></div><div class="user-card-grid">${db.users.map(u=>`<button type="button" class="card user-admin-card" data-user-card="${u.id}"><div class="user-admin-card-head"><div><strong>${esc(u.name)}</strong><div class="muted">${esc(u.email||'')}</div></div><span class="badge ${u.active?'ok':'danger'}">${u.active?'Ativo':'Inativo'}</span></div><div class="user-admin-card-meta"><span><b>Setor:</b> ${esc(u.sector||u.type||'—')}</span><span><b>Função:</b> ${esc(u.type||'—')}</span></div></button>`).join('')}</div>`;
  $('#newUser').onclick=()=>userModal();
  $$('[data-user-card]').forEach(b=>b.onclick=()=>userModal(findUser(b.dataset.userCard)));
}
async function userMetaHistoryHtml(userId){
  if(!userId)return '<div class="empty compact">O histórico ficará disponível após criar o usuário.</div>';
  const [h,r,m]=await Promise.all([sb.from('meta_historico').select('*').eq('entidade_tipo','colaborador').eq('entidade_id',userId).order('created_at',{ascending:false}),sb.from('meta_responsaveis').select('meta_id').eq('usuario_id',userId),sb.from('metas').select('id,titulo,status,prazo,updated_at').order('updated_at',{ascending:false})]);
  if(h.error||r.error||m.error)return '<div class="notice danger">Não foi possível carregar o histórico de metas.</div>';
  const ids=new Set((r.data||[]).map(x=>x.meta_id));const metas=(m.data||[]).filter(x=>ids.has(x.id));const hist=h.data||[];
  const rows=[...hist.map(x=>({when:x.created_at,title:x.meta_titulo||'Meta',status:x.acao,desc:x.descricao||''})),...metas.filter(x=>!hist.some(hh=>hh.meta_id===x.id)).map(x=>({when:x.updated_at,title:x.titulo,status:x.status,desc:x.prazo?`Prazo ${brDate(x.prazo)}`:''}))].sort((x,y)=>String(y.when||'').localeCompare(String(x.when||''))).slice(0,40);
  return rows.length?`<div class="user-history-list">${rows.map(x=>`<div class="user-history-item"><div><strong>${esc(x.title)}</strong> <span class="badge">${esc(x.status||'')}</span></div><p>${esc(x.desc||'')}</p><small>${x.when?new Date(x.when).toLocaleString('pt-BR'):'—'}</small></div>`).join('')}</div>`:'<div class="empty compact">Nenhuma meta registrada para este usuário.</div>';
}
function userModal(u={}){
  openModal(u.id?'Editar usuário':'Novo usuário',`<form id="userForm" class="form-grid"><div class="field full"><label>Nome</label><input name="name" required value="${esc(u.name||'')}"></div><div class="field"><label>CPF</label><input name="cpf" maxlength="14" value="${fmtCpf(u.cpf||'')}"></div><div class="field"><label>E-mail</label><input name="email" type="email" required value="${esc(u.email||'')}"></div><div class="field"><label>${u.id?'Nova senha (opcional)':'Senha inicial'}</label><input name="password" type="password" ${u.id?'':'required'} minlength="8"></div><div class="field"><label>Setor</label><select name="sector" required>${USER_SECTORS.map(t=>`<option ${String(u.sector||u.type)===t?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label>Função</label><select name="type" required>${USER_TYPES.map(t=>`<option ${u.type===t?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label>Status</label><select name="active"><option value="true" ${u.active!==false?'selected':''}>Ativo</option><option value="false" ${u.active===false?'selected':''}>Inativo</option></select></div><div id="userStatus" class="field full muted"></div>${u.id?'<div class="field full"><label>Histórico de metas</label><div id="userMetaHistory"><div class="muted">Carregando histórico...</div></div></div>':''}</form>`,()=>$('#userForm').requestSubmit());
  if(u.id)userMetaHistoryHtml(u.id).then(html=>{const el=$('#userMetaHistory');if(el)el.innerHTML=html});
  $('#userForm').onsubmit=async e=>{
    e.preventDefault();const fd=new FormData(e.target),cpf=cpfDigits(fd.get('cpf')),email=normEmail(fd.get('email')),status=$('#userStatus');
    if(cpf&&cpf.length!==11){alert('Informe um CPF com 11 dígitos ou deixe em branco.');return;}
    if(db.users.some(x=>x.id!==u.id&&normEmail(x.email)===email)){alert('E-mail já cadastrado.');return;}
    if(cpf&&db.users.some(x=>x.id!==u.id&&cpfDigits(x.cpf)===cpf)){alert('CPF já cadastrado.');return;}
    const profile={nome:fd.get('name').trim(),cpf:cpf||null,email,setor:fd.get('sector'),tipo:fd.get('type'),ativo:fd.get('active')==='true'};
    status.textContent='Salvando...';
    if(u.id){
      const password=String(fd.get('password')||'');
      if(email!==normEmail(u.email)||password){const {data:{session}}=await sb.auth.getSession();const ar=await fetch('/api/admin-user-password',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},body:JSON.stringify({userId:u.id,email:email!==normEmail(u.email)?email:undefined,password:password||undefined})});const aj=await ar.json();if(!ar.ok){status.textContent='';alert(`Não foi possível atualizar o acesso: ${aj.error||'erro desconhecido'}`);return;}}
      const r=await sb.from('profiles').update(profile).eq('id',u.id).select().single();
      if(r.error){status.textContent='';alert(r.error.message);return;}
      Object.assign(u,{name:profile.nome,cpf:profile.cpf||'',email:profile.email,sector:profile.setor,type:profile.tipo,active:profile.ativo});
    }else{
      const temp=window.supabase.createClient(SB_CONFIG.url,SB_CONFIG.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const signup=await temp.auth.signUp({email,password:fd.get('password'),options:{data:{nome:profile.nome,cpf:profile.cpf||'',tipo:profile.tipo,setor:profile.setor}}});
      if(signup.error){status.textContent='';alert(`Não foi possível criar o usuário: ${signup.error.message}`);return;}
      const newId=signup.data.user?.id;if(!newId){status.textContent='';alert('O Supabase não retornou o identificador do usuário.');return;}
      await new Promise(r=>setTimeout(r,500));
      const pr=await sb.from('profiles').update(profile).eq('id',newId).select().maybeSingle();
      if(pr.error){status.textContent='';alert(`Usuário criado, mas o perfil não pôde ser atualizado: ${pr.error.message}`);return;}
      db.users.push({id:newId,name:profile.nome,cpf:profile.cpf||'',email,type:profile.tipo,active:profile.ativo,createdAt:today()});
    }
    cacheDB();closeModal();renderUsers();
  };
}

function openModal(head,body,onSave){const el=document.createElement('div');el.id='modal';el.className='modal-backdrop';el.innerHTML=`<section class="modal"><header class="modal-head"><h3>${esc(head)}</h3><button id="modalClose" class="btn icon ghost">×</button></header><div class="modal-body">${body}</div><footer class="modal-foot"><button id="modalCancel" class="btn ghost">Cancelar</button><button id="modalSave" class="btn">Salvar</button></footer></section>`;document.body.appendChild(el);$('#modalClose').onclick=closeModal;$('#modalCancel').onclick=closeModal;$('#modalSave').onclick=onSave;el.onclick=e=>{if(e.target===el)closeModal()}}
function closeModal(){$('#modal')?.remove()}

window.addEventListener('error',e=>console.error('ERP Integral:',e.error||e.message));
init();
})();
