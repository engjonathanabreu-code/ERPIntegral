(() => {
'use strict';
const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const B=()=>window.ERPIntegralBridge;
const esc=v=>B()?.esc?.(v)??String(v??'');
const uid=()=>B()?.uid?.()??crypto.randomUUID();
const sb=()=>B()?.sb;
const me=()=>B()?.currentUser;
const STAGES=['Topografia','Projetos','Protocolado Prefeitura','Protocolo ORI','Diligencia Documental','Diligencia Topografia','Diligencia Projetos','Diligencia Jurídico','Diligencia Pós Protocolo'];
const STATES=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const ALLOWED=['Projetos','Topografia','Pós-protocolo'];
let sectorSyncing=false,sectorSynced=false;

function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();}
function canonicalSector(v=''){
  const n=norm(v);
  if(n==='projetos'||n==='projeto')return 'Projetos';
  if(n==='topografia'||n==='topografico'||n==='topografico')return 'Topografia';
  if(n==='pos protocolo'||n==='posprotocolo')return 'Pós-protocolo';
  return null;
}
function erpUsers(){return (B()?.db?.users||[]).filter(u=>u&&u.active!==false);}
function eligibleUsers(){return erpUsers().filter(u=>canonicalSector(u.type));}
function usedSectors(){return [...new Set(eligibleUsers().map(u=>canonicalSector(u.type)).filter(Boolean))];}

async function syncMetaSectorsFromERP(force=false){
  if(sectorSyncing||(!force&&sectorSynced))return;
  const client=sb();if(!client)return;
  sectorSyncing=true;
  try{
    if(B()?.refreshCore)await B().refreshCore();
    const names=usedSectors();
    for(const nome of names){
      const r=await client.from('meta_setores').upsert({nome,ativo:true,updated_at:new Date().toISOString()},{onConflict:'nome'});
      if(r.error)throw r.error;
    }
    const all=await client.from('meta_setores').select('id,nome,ativo');
    if(all.error)throw all.error;
    const stale=(all.data||[]).filter(s=>!names.includes(canonicalSector(s.nome)||s.nome)&&s.ativo!==false);
    if(stale.length){
      const r=await client.from('meta_setores').update({ativo:false,updated_at:new Date().toISOString()}).in('id',stale.map(x=>x.id));
      if(r.error)throw r.error;
    }
    sectorSynced=true;
    await window.ERPMetasV2?.refresh?.();
  }catch(e){console.warn('Sincronização dos setores de Metas com ERP:',e);}finally{sectorSyncing=false;}
}

async function refineMetaModal(){
  const form=qs('#metaV2Form');
  if(!form||form.dataset.hotfix8)return;
  form.dataset.hotfix8='1';
  if(B()?.refreshCore)await B().refreshCore();

  const assoc=form.querySelector('#metaAssocType');
  if(assoc){
    const projectOpt=[...assoc.options].find(o=>o.value==='projeto');
    if(projectOpt){const wasProject=assoc.value==='projeto';projectOpt.remove();if(wasProject){assoc.value='avulsa';assoc.dispatchEvent(new Event('change',{bubbles:true}));}}
  }

  const sectorSelect=form.querySelector('select[name="setor"]');
  const responsibleWrap=[...form.querySelectorAll('.field.full')].find(x=>x.querySelector('label')?.textContent?.trim()==='Responsáveis');
  const grid=responsibleWrap?.querySelector('.check-grid');
  const labels=qsa('.check-item',grid||responsibleWrap||document);

  if(sectorSelect){
    const selectedId=sectorSelect.value;
    const sectorRows=await sb().from('meta_setores').select('id,nome,ativo').eq('ativo',true).order('nome');
    if(!sectorRows.error){
      const allowedRows=(sectorRows.data||[]).filter(s=>usedSectors().includes(canonicalSector(s.nome)));
      sectorSelect.innerHTML='<option value="">Selecione o setor</option>'+allowedRows.map(s=>`<option value="${s.id}" data-sector-name="${esc(canonicalSector(s.nome)||s.nome)}" ${s.id===selectedId?'selected':''}>${esc(canonicalSector(s.nome)||s.nome)}</option>`).join('');
    }
  }

  const filterResponsibles=()=>{
    const selectedName=canonicalSector(sectorSelect?.selectedOptions?.[0]?.dataset?.sectorName||sectorSelect?.selectedOptions?.[0]?.textContent||'');
    let visible=0;
    labels.forEach(label=>{
      const input=label.querySelector('input[name="responsavel"]');
      const role=(label.querySelector('.muted')?.textContent||'').replace(/[()]/g,'').trim();
      const roleCanonical=canonicalSector(role);
      const show=!!roleCanonical&&(!selectedName||roleCanonical===selectedName);
      label.style.display=show?'':'none';
      if(input){input.disabled=!show;if(!show&&!input.defaultChecked)input.checked=false;}
      if(show)visible++;
    });
    let note=responsibleWrap?.querySelector('.hotfix-resp-note');
    if(responsibleWrap&&!note){note=document.createElement('div');note.className='muted hotfix-resp-note';note.style.margin='0 0 10px';responsibleWrap.insertBefore(note,grid||responsibleWrap.lastChild);}
    if(note)note.textContent=selectedName
      ?(visible?`Mostrando ${visible} colaborador(es) do setor ${selectedName}.`:`Nenhum usuário ativo está cadastrado no setor ${selectedName}.`)
      :'Selecione um setor para mostrar os colaboradores vinculados a ele no cadastro de usuários do ERP.';
  };
  sectorSelect?.addEventListener('change',filterResponsibles);
  filterResponsibles();
}

function compactSectors(){
  qs('#metaNewSector')?.remove();
  qsa('.sector-manage-row').forEach(row=>{
    row.querySelector('.actions')?.remove();
    if(row.dataset.hotfix8)return;row.dataset.hotfix8='1';
    row.classList.add('sector-list-compact');
    const main=row.querySelector('[data-filter-sector]');if(main)main.classList.add('sector-list-main');
  });
  const section=qsa('.section-head').find(h=>h.querySelector('h3')?.textContent?.trim()==='Setores');
  const p=section?.querySelector('p');if(p)p.textContent='Setores sincronizados automaticamente a partir dos usuários cadastrados no ERP. Para alterar um setor, ajuste o cadastro do usuário.';
}

function filterEmployeeCards(){
  qsa('[data-meta-user]').forEach(card=>{
    const id=card.dataset.metaUser;
    const user=erpUsers().find(u=>String(u.id)===String(id));
    card.style.display=user&&canonicalSector(user.type)?'':'none';
  });
}

function injectActiveGoalsStyles(){
  if(qs('#metasActiveByEmployeeStyles'))return;
  const s=document.createElement('style');
  s.id='metasActiveByEmployeeStyles';
  s.textContent=`
    .metas-ativas-groups.hotfix-active-layout{display:flex!important;flex-direction:column!important;gap:16px!important}
    .metas-ativas-groups.hotfix-active-layout>.metas-open-section{order:1;width:100%}
    .metas-ativas-groups.hotfix-active-layout>.metas-sector-section{order:2;width:100%}
    .metas-open-by-employee{display:grid;gap:18px;margin-top:14px}
    .metas-open-employee-group{display:grid;gap:8px}
    .metas-open-employee-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 2px}
    .metas-open-employee-head strong{font-size:15px}
    .metas-open-employee-list{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}
    .metas-open-employee-list .metas2-card{width:100%!important;max-width:none!important;min-width:0!important;text-align:left}
    .metas-open-employee-list .metas2-card small{display:none}
  `;
  document.head.appendChild(s);
}

function arrangeActiveGoalsByEmployee(){
  const root=qs('.metas-ativas-groups');
  if(!root)return;
  const sections=[...root.children].filter(x=>x.matches?.('section.card'));
  const openSection=sections.find(s=>s.querySelector('h3')?.textContent?.trim()==='Metas em aberto');
  const sectorSection=sections.find(s=>s.querySelector('h3')?.textContent?.trim()==='Setores');
  if(!openSection||!sectorSection)return;

  injectActiveGoalsStyles();
  root.classList.add('hotfix-active-layout');
  openSection.classList.add('metas-open-section');
  sectorSection.classList.add('metas-sector-section');
  if(root.firstElementChild!==openSection)root.insertBefore(openSection,sectorSection);

  const existingGrouped=qs('.metas-open-by-employee',openSection);
  const sourceGrid=qs('.metas2-card-grid',openSection);
  if(existingGrouped||!sourceGrid)return;

  const cards=qsa('.metas2-card',sourceGrid);
  if(!cards.length)return;
  const groups=new Map();
  cards.forEach(card=>{
    const responsible=(card.querySelector('small')?.textContent||'Sem responsável').trim()||'Sem responsável';
    if(!groups.has(responsible))groups.set(responsible,[]);
    groups.get(responsible).push(card);
  });

  const wrap=document.createElement('div');
  wrap.className='metas-open-by-employee';
  [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR')).forEach(([name,items])=>{
    const group=document.createElement('div');
    group.className='metas-open-employee-group';
    const head=document.createElement('div');
    head.className='metas-open-employee-head';
    head.innerHTML=`<strong>${esc(name)}</strong><span class="muted">${items.length} meta(s) em aberto</span>`;
    const list=document.createElement('div');
    list.className='metas-open-employee-list';
    items.forEach(card=>list.appendChild(card));
    group.append(head,list);wrap.appendChild(group);
  });
  sourceGrid.replaceWith(wrap);
}

function roleName(){return String(me()?.type||me()?.role||qs('.topbar .badge')?.textContent||qs('.user-mini')?.textContent||'').toLowerCase();}
function canManageOS(){const r=roleName();return r.includes('administrador')||r.includes('diretor de projetos')||r.includes('pós-protocolo')||r.includes('pos-protocolo')||r.includes('pós protocolo')||r.includes('pos protocolo');}

function openOsModal(existing=null){
  if(!canManageOS())return;
  const o=existing||{};
  B().openModal(o.id?'Editar Ordem de Serviço':'Nova Ordem de Serviço',`<form id="osHotfixForm" class="form-grid">
    <div class="field full"><label>Nome</label><input name="nome" required placeholder="OS ..." value="${esc(o.nome||'')}"></div>
    <div class="field full"><label>Núcleo referente</label><input name="nucleo" value="${esc(o.nucleo_referente||'')}"></div>
    <div class="field full"><label>Etapa atual</label><select name="etapa" required>${STAGES.map(x=>`<option value="${esc(x)}" ${o.etapa_atual===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="field"><label>Município</label><input name="municipio" required value="${esc(o.municipio||'')}"></div>
    <div class="field"><label>Estado</label><select name="estado" required><option value="">Selecione</option>${STATES.map(x=>`<option value="${x}" ${o.estado===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="field full"><label>Observações</label><textarea name="observacoes">${esc(o.observacoes||'')}</textarea></div>
    <div id="osHotfixError" class="login-error full"></div>
  </form>`,()=>qs('#osHotfixForm')?.requestSubmit());
  const form=qs('#osHotfixForm');
  form.onsubmit=async e=>{
    e.preventDefault();const err=qs('#osHotfixError');err.textContent='';const fd=new FormData(form);
    const nome=String(fd.get('nome')||'').trim(),municipio=String(fd.get('municipio')||'').trim(),estado=String(fd.get('estado')||'').trim();
    if(!nome||!municipio||!estado){err.textContent='Preencha nome, município e estado.';return;}
    const row={id:o.id||uid(),nome,nucleo_referente:String(fd.get('nucleo')||'').trim()||null,etapa_atual:String(fd.get('etapa')||''),municipio,estado,observacoes:String(fd.get('observacoes')||'').trim()||null,created_by:o.created_by||me()?.id||null,updated_at:new Date().toISOString()};
    const saveBtn=qs('#modalSave');if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Salvando...';}
    try{const r=await sb().from('ordens_servico').upsert(row,{onConflict:'id'}).select().single();if(r.error)throw r.error;B().closeModal();await window.ERPMetasV2?.refresh?.();setTimeout(()=>qs('#metaOrders')?.click(),40);}
    catch(x){console.error('Salvar Ordem de Serviço:',x);err.textContent=`Não foi possível salvar: ${x.message||x}`;if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Salvar';}}
  };
}

async function getOrder(id){const r=await sb().from('ordens_servico').select('*').eq('id',id).maybeSingle();if(r.error){alert(r.error.message);return null;}return r.data;}
function interceptOsButtons(){
  const newBtn=qs('#osNew');if(newBtn&&!newBtn.dataset.hotfix8){newBtn.dataset.hotfix8='1';newBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openOsModal();},{capture:true});}
  qsa('[data-edit-os]').forEach(btn=>{if(btn.dataset.hotfix8)return;btn.dataset.hotfix8='1';btn.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();const o=await getOrder(btn.dataset.editOs);if(o)openOsModal(o);},{capture:true});});
  const detailEdit=qs('#osDetailEdit');if(detailEdit&&!detailEdit.dataset.hotfix8){detailEdit.dataset.hotfix8='1';detailEdit.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();const title=qs('.os-hero h3')?.textContent?.trim();let o=null;if(title){const r=await sb().from('ordens_servico').select('*').eq('nome',title).limit(1).maybeSingle();if(!r.error)o=r.data;}if(o)openOsModal(o);},{capture:true});}
}

async function reconcile(){await refineMetaModal();compactSectors();filterEmployeeCards();arrangeActiveGoalsByEmployee();interceptOsButtons();}
let scheduled=false;const obs=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(async()=>{scheduled=false;await reconcile();});});obs.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('erp-bridge-ready',()=>syncMetaSectorsFromERP(true),{once:false});
setTimeout(()=>syncMetaSectorsFromERP(true),800);
reconcile();
})();