(() => {
'use strict';
if (window.ERPProcessosKanban) return;

const STAGES=['Comercial','Coleta Documental','Análise Documental','Topografia','Projetos','Protocolo','Andamento','Concluído'];
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const brDate=v=>v?new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR'):'—';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
let bridge=null,sb=null,processos=[],andamentos=[],profiles=[],selectedMunicipio='todos',search='',loading=false;
let lastAutoSync=0;
const openMunicipios=new Set();

function title(t){bridge?.title?.(t);}
function getContent(){return document.querySelector('#content');}
function currentUser(){return bridge?.currentUser||null;}
function profileName(id){return profiles.find(p=>p.id===id)?.nome||'Não definido';}
function daysInStage(p){const d=new Date(p.etapa_iniciada_em||p.updated_at||p.created_at);return Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));}
function stageClass(s){return 'st-'+norm(s).replace(/[^a-z0-9]+/g,'-');}
function latestFor(id){return andamentos.filter(a=>a.processo_id===id).sort((a,b)=>String(b.data_atualizacao||b.crm_updated_at||'').localeCompare(String(a.data_atualizacao||a.crm_updated_at||'')))[0]||null;}
function hasDelay(p){return p.prazo && String(p.prazo)<new Date().toISOString().slice(0,10);}
function visibleProcesses(){return processos.filter(p=>p.ativo!==false&&p.excluido_erp!==true);}

async function syncCRM(silent=false){
  if(loading)return;
  loading=true;
  try{
    if(!silent)setSyncText('Sincronizando CRM…');
    const {data,error}=await sb.functions.invoke('sincronizar-processos-crm',{body:{source:'erp-processos'}});
    if(error)throw error;
    lastAutoSync=Date.now();localStorage.setItem('erp_processos_last_sync',String(lastAutoSync));
    await loadData(false);
    render();
    if(!silent)setSyncText(`CRM sincronizado · ${data?.projetos||0} núcleos · ${data?.andamentos||0} andamentos`);
  }catch(e){console.error('Sync CRM',e);if(!silent)setSyncText(`Falha na sincronização: ${e.message||e}`,'error');}
  finally{loading=false;}
}
function setSyncText(text,type=''){const el=document.querySelector('#processSyncStatus');if(el){el.textContent=text;el.className=`process-sync-status ${type}`;}}

async function loadData(renderNow=true){
  if(!sb)return;
  const [pr,ar,ur]=await Promise.all([
    sb.from('processos_kanban').select('*').order('municipio').order('nucleo'),
    sb.from('processos_kanban_andamentos').select('*').order('data_atualizacao',{ascending:false}),
    sb.from('profiles').select('id,nome,tipo,setor,ativo').eq('ativo',true).order('nome')
  ]);
  if(pr.error)throw pr.error;if(ar.error)throw ar.error;if(ur.error)throw ur.error;
  processos=pr.data||[];andamentos=ar.data||[];profiles=ur.data||[];
  if(renderNow)render();
}

function installNav(){
  const nav=document.querySelector('.nav');if(!nav||nav.querySelector('[data-processos-kanban]'))return;
  const b=document.createElement('button');b.dataset.processosKanban='1';b.textContent='Processos';
  b.onclick=async()=>{nav.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');title('Processos');await openModule();};
  const users=nav.querySelector('[data-view="users"]');users?nav.insertBefore(b,users):nav.appendChild(b);
}

async function openModule(){
  const content=getContent();if(!content)return;content.innerHTML='<div class="process-loading">Carregando processos…</div>';
  try{
    await loadData(false);
    const last=Number(localStorage.getItem('erp_processos_last_sync')||0);
    if(!processos.length||Date.now()-last>15*60*1000){await syncCRM(true);return;}
    render();
  }catch(e){content.innerHTML=`<div class="notice danger">Não foi possível carregar os processos: ${esc(e.message||e)}</div>`;}
}

function filtered(){
  return visibleProcesses().filter(p=>selectedMunicipio==='todos'||p.municipio===selectedMunicipio).filter(p=>{
    if(!search)return true;const q=norm(search);return norm(p.nucleo).includes(q)||norm(p.municipio).includes(q)||norm(p.etapa_atual).includes(q)||norm(profileName(p.responsavel_id)).includes(q);
  });
}

function render(){
  const content=getContent();if(!content)return;title('Processos');
  const allVisible=visibleProcesses(),active=filtered();
  const municipios=[...new Set(allVisible.map(p=>p.municipio))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(selectedMunicipio!=='todos'&&!municipios.includes(selectedMunicipio))selectedMunicipio='todos';
  const counts=Object.fromEntries(STAGES.map(s=>[s,active.filter(p=>p.etapa_atual===s).length]));
  const delayed=active.filter(hasDelay).length;
  const groups=selectedMunicipio==='todos'?municipios:municipios.filter(m=>m===selectedMunicipio);
  content.innerHTML=`
    <section class="process-toolbar"><div class="process-title-block"><strong>Gestão de Processos</strong><span>Município → Núcleo → Etapa operacional</span></div><div class="process-actions"><input id="processSearch" class="process-search" placeholder="Buscar município, núcleo ou responsável" value="${esc(search)}"><button id="syncCRMProcess" class="btn secondary">Sincronizar CRM</button></div></section>
    <div id="processSyncStatus" class="process-sync-status"></div>
    <section class="process-kpis"><article><span>Processos ativos</span><strong>${active.length}</strong></article><article><span>Municípios</span><strong>${groups.length}</strong></article><article><span>Em andamento externo</span><strong>${counts['Andamento']||0}</strong></article><article class="${delayed?'warn':''}"><span>Prazo vencido</span><strong>${delayed}</strong></article></section>
    <div class="process-municipio-filter"><button class="${selectedMunicipio==='todos'?'active':''}" data-municipio="todos">Todos <b>${allVisible.length}</b></button>${municipios.map(m=>`<button class="${selectedMunicipio===m?'active':''}" data-municipio="${esc(m)}">${esc(m)} <b>${allVisible.filter(p=>p.municipio===m).length}</b></button>`).join('')}</div>
    <div class="process-groups">${groups.map(m=>municipioSection(m,active.filter(p=>p.municipio===m))).join('')||'<div class="empty">Nenhum processo encontrado.</div>'}</div>`;
  document.querySelector('#processSearch').oninput=e=>{search=e.target.value;clearTimeout(e.target._t);e.target._t=setTimeout(render,180)};
  document.querySelector('#syncCRMProcess').onclick=()=>syncCRM(false);
  document.querySelectorAll('[data-municipio]').forEach(b=>b.onclick=()=>{selectedMunicipio=b.dataset.municipio;render()});
  document.querySelectorAll('[data-toggle-city]').forEach(b=>b.onclick=e=>{if(e.target.closest('[data-delete-city]'))return;const city=b.dataset.toggleCity;openMunicipios.has(city)?openMunicipios.delete(city):openMunicipios.add(city);render();});
  document.querySelectorAll('[data-delete-city]').forEach(b=>b.onclick=e=>{e.stopPropagation();excludeMunicipio(b.dataset.deleteCity)});
  wireCards();
}

function municipioSection(municipio,items){
  const opened=openMunicipios.has(municipio),late=items.filter(hasDelay).length,pend=items.filter(p=>p.pendencia).length;
  const stageParts=STAGES.filter(s=>items.some(p=>p.etapa_atual===s)).map(s=>`<span>${esc(s)} <b>${items.filter(p=>p.etapa_atual===s).length}</b></span>`).join('');
  return `<section class="municipio-process-group ${opened?'open':'collapsed'}">
    <header class="municipio-collapsed-head" data-toggle-city="${esc(municipio)}">
      <div class="municipio-main"><span class="municipio-chevron">${opened?'⌄':'›'}</span><div><h3>${esc(municipio)}</h3><span>${items.length} núcleo${items.length===1?'':'s'}</span></div></div>
      <div class="municipio-mini-kpis"><span><b>${items.length}</b> núcleos</span><span class="${late?'danger':''}"><b>${late}</b> atrasado${late===1?'':'s'}</span><span class="${pend?'warn':''}"><b>${pend}</b> pendência${pend===1?'':'s'}</span></div>
      <div class="municipio-stage-summary">${stageParts}</div>
      <button class="btn icon danger municipio-delete" data-delete-city="${esc(municipio)}" title="Excluir município apenas do ERP">×</button>
    </header>
    <div class="municipio-panel" ${opened?'':'hidden'}><div class="process-kanban">${STAGES.map(stage=>column(stage,items.filter(p=>p.etapa_atual===stage))).join('')}</div></div>
  </section>`;
}
function column(stage,items){return `<div class="process-column ${stageClass(stage)}" data-drop-stage="${esc(stage)}"><div class="process-column-head"><span>${esc(stage)}</span><b>${items.length}</b></div><div class="process-column-body">${items.map(card).join('')||'<div class="process-column-empty">—</div>'}</div></div>`;}
function card(p){const a=latestFor(p.id),days=daysInStage(p),late=hasDelay(p);return `<article class="process-card ${late?'late':''}" draggable="true" data-process-id="${p.id}"><div class="process-card-top"><strong>${esc(p.nucleo)}</strong>${p.prioridade&&p.prioridade!=='Normal'?`<span class="priority ${norm(p.prioridade)}">${esc(p.prioridade)}</span>`:''}</div><div class="process-card-meta"><span>${days} dia${days===1?'':'s'} na etapa</span>${p.prazo?`<span class="${late?'late-text':''}">Prazo ${brDate(p.prazo)}</span>`:''}</div>${p.responsavel_id?`<div class="process-owner">${esc(profileName(p.responsavel_id))}</div>`:''}${p.pendencia?`<div class="process-pendency">⚠ ${esc(p.pendencia)}</div>`:''}${a?`<div class="process-latest"><span>${esc(a.status||'Andamento')}</span><small>${esc(a.status_operacional||'')} ${a.data_atualizacao?'· '+brDate(a.data_atualizacao):''}</small></div>`:''}</article>`;}

async function excludeMunicipio(municipio){
  const total=visibleProcesses().filter(p=>p.municipio===municipio).length;
  if(!confirm(`Excluir ${municipio} do ERP?\n\nOs ${total} núcleo(s) continuarão intactos no CRM e não voltarão a aparecer após sincronizações.`))return;
  const {error}=await sb.from('processos_kanban').update({excluido_erp:true,updated_at:new Date().toISOString()}).eq('municipio',municipio);
  if(error){alert(`Não foi possível excluir o município do ERP: ${error.message}`);return;}
  processos.forEach(p=>{if(p.municipio===municipio)p.excluido_erp=true;});openMunicipios.delete(municipio);if(selectedMunicipio===municipio)selectedMunicipio='todos';render();
}

function wireCards(){
  let dragged=null;
  document.querySelectorAll('.process-card').forEach(c=>{c.ondragstart=e=>{dragged=c.dataset.processId;e.dataTransfer.effectAllowed='move';c.classList.add('dragging')};c.ondragend=()=>{dragged=null;c.classList.remove('dragging');document.querySelectorAll('.process-column').forEach(x=>x.classList.remove('drop-active'))};c.onclick=()=>openDetail(c.dataset.processId);});
  document.querySelectorAll('[data-drop-stage]').forEach(col=>{col.ondragover=e=>{e.preventDefault();col.classList.add('drop-active')};col.ondragleave=()=>col.classList.remove('drop-active');col.ondrop=async e=>{e.preventDefault();col.classList.remove('drop-active');if(dragged)await moveStage(dragged,col.dataset.dropStage)}});
}
async function moveStage(id,newStage){const p=processos.find(x=>x.id===id);if(!p||p.etapa_atual===newStage)return;const old=p.etapa_atual,now=new Date().toISOString(),user=currentUser();const {error}=await sb.from('processos_kanban').update({etapa_atual:newStage,etapa_iniciada_em:now,updated_at:now}).eq('id',id);if(error){alert(`Não foi possível mover o processo: ${error.message}`);return;}await sb.from('processos_kanban_historico').insert({processo_id:id,etapa_anterior:old,etapa_nova:newStage,alterado_por:user?.id||null,observacao:'Movimentação pelo Kanban'});p.etapa_atual=newStage;p.etapa_iniciada_em=now;render();}

async function openDetail(id){
  const p=processos.find(x=>x.id===id);if(!p)return;
  const histR=await sb.from('processos_kanban_historico').select('*').eq('processo_id',id).order('created_at',{ascending:false});
  const history=histR.data||[],arr=andamentos.filter(a=>a.processo_id===id).sort((a,b)=>String(b.data_atualizacao||'').localeCompare(String(a.data_atualizacao||'')));
  document.querySelector('#processModal')?.remove();const el=document.createElement('div');el.id='processModal';el.className='modal-backdrop';
  el.innerHTML=`<section class="modal process-modal"><header class="modal-head"><div><h3>${esc(p.nucleo)}</h3><small>${esc(p.municipio)} / ${esc(p.estado)}</small></div><button class="btn icon ghost" data-close>×</button></header><div class="modal-body"><div class="process-detail-grid"><label>Etapa<select id="pdStage">${STAGES.map(s=>`<option ${s===p.etapa_atual?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label>Responsável<select id="pdOwner"><option value="">Não definido</option>${profiles.map(u=>`<option value="${u.id}" ${u.id===p.responsavel_id?'selected':''}>${esc(u.nome)}</option>`).join('')}</select></label><label>Prazo<input id="pdDeadline" type="date" value="${p.prazo||''}">${p.prazo?'<button type="button" class="btn small secondary" id="processAddCalendar">Adicionar ao calendário</button>':''}</label><label>Prioridade<select id="pdPriority">${['Baixa','Normal','Alta','Urgente'].map(x=>`<option ${x===p.prioridade?'selected':''}>${x}</option>`).join('')}</select></label><label class="full">Pendência<textarea id="pdPendency" rows="2">${esc(p.pendencia||'')}</textarea></label></div><div class="process-detail-actions"><button id="pdSave" class="btn">Salvar alterações</button></div><h4>Andamentos importados do CRM</h4><div class="process-timeline">${arr.map(a=>`<article><b>${esc(a.status)}</b><span>${esc(a.status_operacional||'')}</span><small>${brDate(a.data_atualizacao)}${a.previsao?' · previsão '+brDate(a.previsao):''}</small>${a.descricao_cliente?`<p>${esc(a.descricao_cliente)}</p>`:''}${a.observacao_interna?`<p class="internal">Interno: ${esc(a.observacao_interna)}</p>`:''}</article>`).join('')||'<div class="empty">Nenhum andamento registrado no CRM.</div>'}</div><h4>Histórico de etapas no ERP</h4><div class="process-timeline compact">${history.map(h=>`<article><b>${esc(h.etapa_anterior||'Início')} → ${esc(h.etapa_nova)}</b><small>${new Date(h.created_at).toLocaleString('pt-BR')}</small>${h.observacao?`<p>${esc(h.observacao)}</p>`:''}</article>`).join('')||'<div class="empty">Nenhuma movimentação manual registrada.</div>'}</div></div></section>`;
  el.querySelector('.modal-body').dataset.collabEntityType='processo';el.querySelector('.modal-body').dataset.collabEntityId=id;document.body.appendChild(el);window.ERPCollaboration?.bindPersonalButton(el.querySelector('#processAddCalendar'),'processo:'+id);el.querySelector('[data-close]').onclick=()=>el.remove();el.onclick=e=>{if(e.target===el)el.remove()};
  el.querySelector('#pdSave').onclick=async()=>{const stage=el.querySelector('#pdStage').value,owner=el.querySelector('#pdOwner').value||null,deadline=el.querySelector('#pdDeadline').value||null,priority=el.querySelector('#pdPriority').value,pendency=el.querySelector('#pdPendency').value.trim()||null;const payload={responsavel_id:owner,prazo:deadline,prioridade:priority,pendencia:pendency,updated_at:new Date().toISOString()};if(stage!==p.etapa_atual){payload.etapa_atual=stage;payload.etapa_iniciada_em=new Date().toISOString();}const {error}=await sb.from('processos_kanban').update(payload).eq('id',id);if(error){alert(error.message);return;}if(stage!==p.etapa_atual)await sb.from('processos_kanban_historico').insert({processo_id:id,etapa_anterior:p.etapa_atual,etapa_nova:stage,alterado_por:currentUser()?.id||null,observacao:'Alteração no detalhe do processo'});Object.assign(p,payload);el.remove();render();};
}

function start(){bridge=window.ERPIntegralBridge;if(!bridge)return;sb=bridge.sb;installNav();const obs=new MutationObserver(()=>installNav());obs.observe(document.documentElement,{childList:true,subtree:true});}
window.addEventListener('erp-bridge-ready',start,{once:true});if(window.ERPIntegralBridge)start();
window.ERPProcessosKanban={render:openModule,sync:syncCRM,async openDetail(id){await openModule();await openDetail(id);}};
})();

