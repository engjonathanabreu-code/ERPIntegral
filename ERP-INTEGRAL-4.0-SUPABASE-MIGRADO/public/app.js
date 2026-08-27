(() => {
'use strict';
window.ERP_METAS_IN_CORE=true;

const APP_KEY='erp_integral_v2_db';
const SESSION_KEY='erp_integral_v2_session';
const SERVICE_TYPES=['REURB PRIVADO','REURB LICITADO','ETSA','ETSA + ORTOFOTO','OUTROS'];
const USER_TYPES=['Administrador','Comercial','Financeiro','Diretor Financeiro','Diretor de Projetos','Projetos','Topografia','Jurídico','Marketing','Pós-protocolo','Atendimentos','Diretor Técnico'];
const USER_SECTORS=['Administrativo','Comercial','Financeiro','Projetos','Topografia','Jurídico','Marketing','Pós-protocolo','Atendimentos'];
const METAS_SECTORS=['Projetos','Topografia','Pós-protocolo','Jurídico'];
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
let currentPlanDetailId=null;
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
function accessNorm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function userMatchesAccess(...names){const keys=names.map(accessNorm);return keys.includes(accessNorm(currentUser?.type))||keys.includes(accessNorm(currentUser?.sector));}
function isProjectDirector(){return userMatchesAccess('Diretor de Projetos','Diretor de Projeto');}
function isFinanceAccess(){return userMatchesAccess('Financeiro','Diretor Financeiro');}
function isRestrictedOperational(){return userMatchesAccess('Topografia','Projetos','Pós-protocolo','Pós Protocolo','Jurídico','Juridico');}
function canViewProjects(){return isAdmin()||isComercial()||isProjectDirector()||isFinanceAccess();}
function isMetasManager(){return isAdmin()||isTechDirector()||isProjectDirector();}
function canSeePlan(plan){return canManageCore()||isTechDirector()||isProjectDirector()||isFinanceAccess()||plan.steps.some(s=>s.responsibleIds.includes(currentUser.id));}
function canEditStep(step){return isAdmin()||isTechDirector()||isProjectDirector()||step.responsibleIds.includes(currentUser.id);}
function isMetasSector(){return isRestrictedOperational();}
function canSeeMetas(){return isMetasManager()||isFinanceAccess()||isMetasSector();}
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
function navItems(){
  if(isAdmin())return ADMIN_NAV;
  if(isProjectDirector()||isFinanceAccess())return [['projects','Projetos'],['plans','Planos de trabalho'],['metas','Metas']];
  if(isRestrictedOperational())return [['plans','Planos de trabalho'],['metas','Metas']];
  if(isComercial())return COMERCIAL_NAV;
  if(isTechDirector())return [['metas','Metas']];
  return [['plans','Planos de trabalho']];
}

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
  $('#content').innerHTML=`<div class="toolbar"><div class="left"><input id="searchProjects" class="search" placeholder="Pesquisar projeto, cliente, tipo ou responsável" value="${esc(searchTerm)}"></div><div class="right">${canManageCore()?'<button id="newProject" class="btn">Adicionar projeto</button>':''}</div></div>${SERVICE_TYPES.map(t=>groups[t]?.length?`<section class="project-group ${collapsedProjectGroups[t]?'collapsed':''}" data-project-group="${esc(t)}"><div class="group-title"><button type="button" class="project-group-toggle" data-toggle-project-group="${esc(t)}" aria-expanded="${collapsedProjectGroups[t]?'false':'true'}"><span class="chev">⌄</span><span>${t}</span><span>${groups[t].length}</span></button></div><div class="table-wrap"><table class="table project-table"><thead><tr><th>Projeto</th><th>Cliente</th><th>Responsável</th><th>Prazo</th><th>Andamento</th><th>Status</th><th></th></tr></thead><tbody>${groups[t].map(p=>`<tr><td><button class="project-link" data-open-project="${p.id}">${esc(p.name)}</button><small class="project-sub">Início: ${brDate(p.start)}</small></td><td>${esc(findClient(p.clientId)?.name||'—')}</td><td>${esc(p.manager||'—')}</td><td>${brDate(p.deadline)}</td><td><div class="progress"><i style="width:${projectProgress(p)}%"></i></div><span class="muted">${projectProgress(p)}%</span></td><td>${statusBadge(p.status)}</td><td class="actions">${canManageCore()?`<button class="btn icon secondary" data-edit-project="${p.id}" title="Editar">✎</button><button class="btn icon danger" data-del-project="${p.id}" title="Excluir">×</button>`:''}</td></tr>`).join('')}</tbody></table></div></section>`:'').join('')||'<div class="empty">Nenhum projeto encontrado.</div>'}`;
  $('#searchProjects').oninput=e=>{searchTerm=e.target.value;renderProjects()};
  if(canManageCore())$('#newProject')?.addEventListener('click',()=>projectModal());
  $$('[data-open-project]').forEach(b=>b.onclick=()=>{currentProjectId=b.dataset.openProject;renderProjects()});
  if(canManageCore()){
    $$('[data-edit-project]').forEach(b=>b.onclick=()=>projectModal(findProject(b.dataset.editProject)));
    $$('[data-del-project]').forEach(b=>b.onclick=()=>deleteProject(b.dataset.delProject));
  }
  $$('[data-toggle-project-group]').forEach(b=>b.onclick=()=>{const key=b.dataset.toggleProjectGroup;setProjectGroupCollapsed(key,!collapsedProjectGroups[key]);renderProjects()});
}
function renderProjectDetail(){
  const p=findProject(currentProjectId);if(!p){currentProjectId=null;renderProjects();return}
  const plan=db.plans.find(x=>x.projectId===p.id),pays=db.payments.filter(x=>x.projectId===p.id),docs=db.documents.filter(x=>x.projectId===p.id);
  $('#content').innerHTML=`<div class="toolbar project-detail-toolbar"><button id="backProjects" class="btn ghost">← Voltar</button><div class="right">${canManageCore()?'<button id="editProjectDetail" class="btn icon secondary" title="Editar projeto">✎</button><button id="delProjectDetail" class="btn icon danger" title="Excluir projeto">×</button>':''}</div></div>
  <section class="card project-hero"><div><div class="project-kicker">${esc(p.type)}</div><h3>${esc(p.name)}</h3><p>${esc(p.notes||'Sem observações cadastradas.')}</p></div>${statusBadge(p.status)}</section>
  <div class="project-summary-grid"><div class="card summary-box"><span>Cliente</span><strong>${esc(findClient(p.clientId)?.name||'—')}</strong></div><div class="card summary-box"><span>Responsável</span><strong>${esc(p.manager||'—')}</strong></div><div class="card summary-box"><span>Prazo final</span><strong>${brDate(p.deadline)}</strong></div><div class="card summary-box"><span>Andamento</span><strong>${projectProgress(p)}%</strong><div class="progress"><i style="width:${projectProgress(p)}%"></i></div></div><div class="card summary-box"><span>Valor do contrato</span><strong>${money(p.contractValue)}</strong></div><div class="card summary-box"><span>Plano / documentos</span><strong>${plan?'1 plano':'Sem plano'} · ${docs.length} doc.</strong></div></div>
  <div class="project-columns"><section class="card"><div class="section-head"><div><h4>Etapas do projeto</h4><span class="muted">${p.stages.length} etapa(s)</span></div>${canManageCore()?'<button id="addProjectStage" class="btn icon secondary" title="Adicionar etapa">＋</button>':''}</div><div class="project-stage-list">${p.stages.map(s=>`<article class="project-stage"><div class="stage-main"><div><strong>${esc(s.name)}</strong><div class="meta-line"><span>${esc(s.owner||'Sem responsável')}</span><span>Prazo ${brDate(s.deadline)}</span><span>Peso ${Number(s.weight||0)}%</span></div></div>${statusBadge(s.status)}</div><div class="stage-progress-line"><div class="progress"><i style="width:${Math.max(0,Math.min(100,Number(s.progress||0)))}%"></i></div><b>${Number(s.progress||0)}%</b></div>${canManageCore()?`<div class="actions stage-buttons"><button class="btn icon secondary" data-edit-stage="${s.id}" title="Editar">✎</button><button class="btn icon danger" data-del-stage="${s.id}" title="Excluir">×</button></div>`:''}</article>`).join('')||'<div class="empty compact">Nenhuma etapa cadastrada.</div>'}</div></section>
  ${isAdmin()?`<section class="card"><div class="section-head"><div><h4>Resumo financeiro</h4><span class="muted">${pays.length} etapa(s) de pagamento</span></div><div class="actions"><button id="genProjectPayments" class="btn small secondary" title="Gerar parcelas">Gerar parcelas</button><button id="addProjectPayment" class="btn icon secondary" title="Adicionar etapa de pagamento">＋</button></div></div><div class="finance-summary three"><div><span>Valor previsto</span><strong>${money(pays.reduce((a,b)=>a+Number(b.value||0),0))}</strong></div><div><span>Recebido</span><strong>${money(pays.reduce((a,b)=>a+paymentReceived(b),0))}</strong></div><div><span>Saldo</span><strong>${money(pays.reduce((a,b)=>a+paymentBalance(b),0))}</strong></div></div>${sortPayments(pays).slice(0,8).map(x=>`<div class="mini-payment detailed"><div><strong>${esc(x.name)}</strong><small>Vencimento ${brDate(x.dueDate)} · Recebido ${money(paymentReceived(x))}</small></div><div class="payment-mini-actions">${statusBadge(paymentStatus(x))}<button class="btn icon secondary" data-edit-project-pay="${x.id}" title="Registrar recebimento">✎</button></div></div>`).join('')||'<div class="empty compact">Nenhuma etapa de pagamento.</div>'}</section>`:''}</div>
  <section class="card project-documents-card"><div class="section-head"><div><h4>Documentos do projeto</h4><span class="muted">${docs.length} arquivo(s) vinculado(s)</span></div></div><div class="project-document-list">${docs.map(d=>`<article class="project-document-item"><div class="document-icon">↧</div><div class="document-info"><strong>${esc(d.name)}</strong><span>${brDate(d.createdAt)}${d.size?` · ${Math.max(1,Math.round(d.size/1024))} KB`:''}</span></div><button class="btn small secondary" data-project-download-doc="${d.id}">Baixar</button></article>`).join('')||'<div class="empty compact">Nenhum documento vinculado a este projeto.</div>'}</div></section>`;
  $('#backProjects').onclick=()=>{currentProjectId=null;renderProjects()};
  if(canManageCore()){
    $('#editProjectDetail')?.addEventListener('click',()=>projectModal(p));
    $('#delProjectDetail')?.addEventListener('click',()=>deleteProject(p.id));
    $('#addProjectStage')?.addEventListener('click',()=>stageModal(p));
  }
  if(isAdmin()){
    $('#addProjectPayment').onclick=()=>paymentModal({projectId:p.id},renderProjectDetail);
    $('#genProjectPayments').onclick=()=>installmentGeneratorModal(p.id,renderProjectDetail);
    $$('[data-edit-project-pay]').forEach(b=>b.onclick=()=>paymentModal(db.payments.find(x=>x.id===b.dataset.editProjectPay),renderProjectDetail));
  }
  if(canManageCore()){
    $$('[data-edit-stage]').forEach(b=>b.onclick=()=>stageModal(p,p.stages.find(x=>x.id===b.dataset.editStage)));
    $$('[data-del-stage]').forEach(b=>b.onclick=()=>{if(confirm('Excluir etapa do projeto?')){p.stages=p.stages.filter(x=>x.id!==b.dataset.delStage);saveDB();renderProjectDetail()}});
  }
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
  let active=currentPlanDetailId?plans.find(p=>p.id===currentPlanDetailId):null;
  if(currentPlanDetailId&&!active)currentPlanDetailId=null;
  if(active){
    $('#content').innerHTML=`<div class="toolbar plan-detail-toolbar"><button id="backPlans" class="btn secondary">← Voltar aos planos</button><div class="right"><span class="muted">Visualização completa do plano</span></div></div>${planCard(active)}`;
    $('#backPlans').onclick=()=>{currentPlanDetailId=null;renderPlans()};
    wirePlanEvents();
    return;
  }
  $('#content').innerHTML=`${canManageCore()?'<div class="toolbar"><div><b>Planos de trabalho</b><div class="muted">Clique em um plano para abrir todas as etapas e alimentar o trabalho.</div></div><button id="newPlan" class="btn">Criar plano de trabalho</button></div>':'<div class="toolbar"><div><b>Planos de trabalho</b><div class="muted">Clique em um plano para abrir todas as etapas.</div></div></div>'}<div class="plan-index-list">${plans.map(planSummaryRow).join('')||'<div class="empty">Nenhum plano de trabalho disponível para este usuário.</div>'}</div>`;
  if(canManageCore())$('#newPlan').onclick=()=>planModal();
  $$('[data-open-plan]').forEach(row=>row.onclick=e=>{if(e.target.closest('[data-edit-plan],[data-del-plan]'))return;currentPlanDetailId=row.dataset.openPlan;renderPlans()});
  $$('[data-edit-plan]').forEach(b=>b.onclick=e=>{e.stopPropagation();planModal(db.plans.find(x=>x.id===b.dataset.editPlan))});
  $$('[data-del-plan]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(confirm('Excluir plano?')){db.plans=db.plans.filter(x=>x.id!==b.dataset.delPlan);saveDB();renderPlans()}});
}
function planSummaryRow(p){
  const project=findProject(p.projectId);
  const total=p.steps.reduce((a,s)=>a+s.deliverables.length,0);
  const done=p.steps.reduce((a,s)=>a+s.deliverables.filter(d=>d.done).length,0);
  const pct=total?Math.round(done/total*100):0;
  const openSteps=p.steps.filter(s=>s.status!=='Concluída');
  const current=openSteps.length?openSteps[openSteps.length-1]:null;
  const d=current?.deadline?daysUntil(current.deadline):null;
  const deadlineClass=current?.deadline&&d<0?'danger':current?.deadline&&d<=7?'warn':'';
  return `<section class="card plan-index-row" data-open-plan="${p.id}" tabindex="0" role="button"><div class="plan-index-primary"><h3>${esc(p.title)}</h3><span class="muted">${esc(project?.name||'Sem projeto')}</span></div><div class="plan-index-stage"><small>Última etapa em aberto</small>${current?`<strong>${esc(current.title)}</strong><span><span class="badge">${esc(current.status||'Pendente')}</span>${current.deadline?` <span class="badge ${deadlineClass}">Prazo ${brDate(current.deadline)}</span>`:''}</span>`:'<strong>Nenhuma etapa em aberto</strong><span class="muted">Sem pendências cadastradas</span>'}</div><div class="plan-index-progress"><small>Progresso dos entregáveis</small><strong>${pct}%</strong><div class="progress"><i style="width:${pct}%"></i></div></div><div class="plan-index-status"><span class="badge ${p.status==='Concluído'?'ok':''}">${esc(p.status)}</span><span class="plan-index-open">Abrir plano →</span></div>${canManageCore()?`<div class="actions plan-index-actions"><button class="btn icon secondary" data-edit-plan="${p.id}" title="Editar plano">✎</button><button class="btn icon danger" data-del-plan="${p.id}" title="Excluir plano">×</button></div>`:''}</section>`;
}
function wirePlanEvents(){
  $$('[data-edit-plan]').forEach(b=>b.onclick=()=>planModal(db.plans.find(x=>x.id===b.dataset.editPlan)));
  $$('[data-del-plan]').forEach(b=>b.onclick=()=>{if(confirm('Excluir plano?')){const deleted=b.dataset.delPlan;db.plans=db.plans.filter(x=>x.id!==deleted);if(currentPlanDetailId===deleted)currentPlanDetailId=null;saveDB();renderPlans()}});
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
function stepModal(plan,s={}){let deliverables=(s.deliverables||[]).map(d=>({...d}));openModal(s.id?'Editar etapa':'Nova etapa',`<form id="stepForm" class="form-grid"><div class="field full"><label>Nome da etapa</label><input name="title" required value="${esc(s.title||'')}"></div><div class="field"><label>Prazo</label><input name="deadline" type="date" value="${s.deadline||''}"></div><div class="field"><label>Status</label><select name="status">${['Pendente','Em andamento','Aguardando','Concluída'].map(x=>`<option ${s.status===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field full"><label>Responsáveis (selecione um ou mais)</label><div class="check-grid">${db.users.filter(u=>u.active&&!['Administrador','Diretor Técnico','Diretor de Projetos','Diretor Financeiro'].includes(u.type)).map(u=>`<label class="check-item"><input type="checkbox" name="responsibleIds" value="${u.id}" ${(s.responsibleIds||[]).includes(u.id)?'checked':''}>${esc(u.name)} <span class="muted">(${esc(u.type)})</span></label>`).join('')||'<div class="notice">Cadastre usuários operacionais primeiro.</div>'}</div></div><div class="field full"><label>Entregáveis</label><div class="inline-add"><input id="newDeliverable" placeholder="Digite um entregável"><button id="addDeliverable" class="btn secondary" type="button">Adicionar</button></div><div id="deliverableTags" class="tag-list"></div></div><div class="field full"><label>Observações</label><textarea name="notes">${esc(s.notes||'')}</textarea></div></form>`,()=>$('#stepForm').requestSubmit());
  const draw=()=>{$('#deliverableTags').innerHTML=deliverables.map(d=>`<span class="tag">${esc(d.text)}<button type="button" data-remove-del="${d.id}">×</button></span>`).join('');$$('[data-remove-del]').forEach(b=>b.onclick=()=>{deliverables=deliverables.filter(x=>x.id!==b.dataset.removeDel);draw()})};draw();
  $('#addDeliverable').onclick=()=>{const input=$('#newDeliverable'),text=input.value.trim();if(text){deliverables.push({id:uid(),text,done:false});input.value='';draw()}};
  $('#stepForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),responsibleIds=fd.getAll('responsibleIds');if(!responsibleIds.length){alert('Selecione pelo menos um responsável.');return}const f={title:fd.get('title'),deadline:fd.get('deadline'),status:fd.get('status'),notes:fd.get('notes'),responsibleIds,deliverables};if(s.id)Object.assign(s,f);else plan.steps.push({id:uid(),...f});saveDB();closeModal();renderPlans()};
}

function renderMetas(){
  title('Metas');
  if(window.ERPMetasV2?.render){window.ERPMetasV2.render();return;}
  $('#content').innerHTML='<div class="card"><div class="notice">Carregando Metas...</div></div>';
  setTimeout(()=>{if(currentView==='metas'&&window.ERPMetasV2?.render)window.ERPMetasV2.render();},0);
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
      const {data:{session}}=await sb.auth.getSession();
      if(!session?.access_token){status.textContent='';alert('Sua sessão expirou. Entre novamente no ERP.');return;}
      const createR=await fetch('/api/admin-user-create',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({email,password:fd.get('password'),nome:profile.nome,cpf:profile.cpf||'',tipo:profile.tipo,setor:profile.setor})});
      const createData=await createR.json().catch(()=>({}));
      if(!createR.ok){status.textContent='';alert(`Não foi possível criar o usuário: ${createData.error||'erro desconhecido'}`);return;}
      const newId=createData.userId;if(!newId){status.textContent='';alert('O servidor não retornou o identificador do usuário.');return;}
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

/* METAS_V2_INTEGRADA_AO_CORE */
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
  qs('#content').innerHTML=`${toolbar()}<div class="grid cols-3"><div class="card metric"><h3>Metas da semana</h3><b>${week.length}</b></div><div class="card metric"><h3>Metas ativas</h3><b>${active.length}</b></div><div class="card metric"><h3>Em atraso</h3><b>${late.length}</b></div></div><section class="card metas2-week-list"><div class="section-head"><div><h3>Semana selecionada</h3><p class="muted">Controle semanal de metas. Os prazos individuais continuam visíveis dentro de cada card.</p></div></div>${week.length?`<div class="metas2-card-grid">${week.map(metaCardHtml).join('')}</div>`:'<div class="empty">Nenhuma meta programada para esta semana.</div>'}</section><section class="card metas2-active-home"><div class="section-head"><div><h3>Metas ativas</h3><p class="muted">Até 15 metas em aberto para acompanhamento rápido.</p></div><button type="button" class="btn small secondary" id="metaActiveAll">Ver todas</button></div>${active.length?`<div class="metas2-card-grid">${active.slice(0,15).map(metaCardHtml).join('')}</div>`:'<div class="empty compact">Nenhuma meta ativa.</div>'}</section><section class="card metas2-late-home"><div class="section-head"><div><h3>Metas atrasadas</h3><p class="muted">Metas com prazo vencido que ainda precisam de atenção.</p></div><button type="button" class="btn small secondary" id="metaLateAll">Ver todas</button></div>${late.length?`<div class="metas2-card-grid">${late.slice(0,15).map(metaLateCardHtml).join('')}</div>`:'<div class="empty compact">Nenhuma meta atrasada.</div>'}</section><h3 class="section-title">Colaboradores</h3><div class="metas-emp-grid">${employees.map(u=>{const ms=metasForUser(u.id);const act=ms.filter(m=>!['Concluído','Cancelado'].includes(m.status));const done=ms.filter(m=>m.status==='Concluído');return `<button type="button" class="card metas-emp-card" data-meta-user="${u.id}"><div class="metas-emp-head"><strong>${esc(u.name)}</strong><span class="badge">${esc(u.type)}</span></div><div class="metas-emp-stats"><div><b>${act.length}</b><span>Ativas</span></div><div><b>${done.length}</b><span>Concluídas</span></div><div><b>${ms.length}</b><span>Histórico</span></div></div></button>`}).join('')}</div>`;
  wireToolbar();qs('#metaActiveAll')?.addEventListener('click',()=>{state.screen='active';renderActive()});qs('#metaLateAll')?.addEventListener('click',()=>{state.screen='active';renderActive('late')});wireMetaCards();qsa('[data-meta-user]').forEach(b=>b.onclick=()=>{state.selectedUser=b.dataset.metaUser;state.screen='user';renderUserBoard()});
}
function metaCardHtml(m){const resp=metaResponsibles(m.id).map(userName).join(', ')||'Sem responsável';const action=conclusionActionHtml(m);return `<button type="button" class="metas2-card" data-meta-card="${m.id}"><div class="metas2-card-top"><strong>${esc(m.titulo)}</strong>${statusBadge(m.status)}</div><span class="muted metas2-assoc">${esc(associationLabel(m))}</span><p>${esc(m.observacoes||'Sem observações.')}</p><div class="metas2-card-foot"><span>${esc(sectorLabel(m.setor_id))}</span><span>${m.prazo?'Prazo '+brDate(m.prazo):'Sem prazo'}</span></div><small>${esc(resp)}</small>${action?`<div class="meta-conclusion-row">${action}</div>`:''}</button>`}
function metaLateCardHtml(m){const resp=metaResponsibles(m.id).map(userName).join(', ')||'Sem responsável';const action=conclusionActionHtml(m);return `<button type="button" class="metas2-card metas2-card-late" data-meta-card="${m.id}"><div class="metas2-card-top"><strong>${esc(m.titulo)}</strong><span class="badge danger">Atrasado</span></div><span class="muted metas2-assoc">${esc(associationLabel(m))}</span><p>${esc(m.observacoes||'Sem observações.')}</p><div class="metas2-card-foot"><span>${esc(sectorLabel(m.setor_id))}</span><span class="meta-late-deadline">${m.prazo?'Prazo '+brDate(m.prazo):'Sem prazo'}</span></div><small>${esc(resp)}</small>${action?`<div class="meta-conclusion-row">${action}</div>`:''}</button>`}

function renderUserBoard(){
  const u=db().users.find(x=>x.id===state.selectedUser)||currentUser();if(!u){renderHome();return}B().title(`Metas — ${u.name}`);
  const all=metasForUser(u.id);const week=all.filter(m=>m.semana_inicio===weekStartISO());
  const columns=[['Em andamento',week.filter(m=>['Em andamento','Aguardando aprovação'].includes(m.status))],['Concluído',week.filter(m=>m.status==='Concluído')],['Cancelado',week.filter(m=>m.status==='Cancelado')]];
  qs('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="metaUserBack">← Voltar</button><div class="right"><button class="btn secondary" id="metaUserHistory">Histórico de metas</button>${canManageMeta()?'<button class="btn" id="metaUserNew">+ Nova Meta</button>':''}<span class="badge">${esc(u.type)}</span></div></div><div class="week-pill standalone"><span>Semana</span><b>${esc(weekLabel())}</b></div><div class="metas-board metas2-board">${columns.map(([label,list])=>`<div class="metas-board-col"><div class="metas-board-col-head">${label}<span>${list.length}</span></div>${list.map(metaCardHtml).join('')||'<div class="metas-board-empty">Nenhuma meta</div>'}</div>`).join('')}</div>`;
  qs('#metaUserBack').onclick=renderHome;qs('#metaUserHistory').onclick=()=>historyModal('colaborador',u.id,`Histórico de metas — ${u.name}`);qs('#metaUserNew')?.addEventListener('click',()=>metaModal(null,u.id));wireMetaCards();
}

function renderActive(mode='all'){
  state.screen='active';const allActive=visibleMetas().filter(m=>!['Concluído','Cancelado'].includes(m.status));const active=mode==='late'?allActive.filter(m=>m.prazo&&m.prazo<today()):allActive;B().title(mode==='late'?'Metas Atrasadas':'Metas Ativas');
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
