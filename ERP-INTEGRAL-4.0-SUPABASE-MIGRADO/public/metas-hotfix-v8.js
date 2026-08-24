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
const allowedResp=/^(projetos|topografia|p[oó]s[- ]?protocolo)$/i;

function refineMetaModal(){
  const form=qs('#metaV2Form');
  if(!form||form.dataset.hotfix8)return;
  form.dataset.hotfix8='1';
  const assoc=form.querySelector('#metaAssocType');
  if(assoc){
    const projectOpt=[...assoc.options].find(o=>o.value==='projeto');
    if(projectOpt){
      const wasProject=assoc.value==='projeto';
      projectOpt.remove();
      if(wasProject){assoc.value='avulsa';assoc.dispatchEvent(new Event('change',{bubbles:true}));}
    }
  }
  const responsibleWrap=[...form.querySelectorAll('.field.full')].find(x=>x.querySelector('label')?.textContent?.trim()==='Responsáveis');
  if(responsibleWrap){
    const grid=responsibleWrap.querySelector('.check-grid');
    const labels=qsa('.check-item',grid||responsibleWrap);
    let visible=0;
    labels.forEach(label=>{
      const role=(label.querySelector('.muted')?.textContent||'').replace(/[()]/g,'').trim();
      const show=allowedResp.test(role);
      label.style.display=show?'':'none';
      label.querySelector('input')?.toggleAttribute('disabled',!show);
      if(show)visible++;
    });
    let note=responsibleWrap.querySelector('.hotfix-resp-note');
    if(!note){note=document.createElement('div');note.className='muted hotfix-resp-note';note.style.margin='0 0 10px';responsibleWrap.insertBefore(note,grid||responsibleWrap.lastChild);}
    note.textContent=visible?`Selecione colaboradores de Projetos, Topografia ou Pós-Protocolo (${visible} disponível${visible===1?'':'is'}).`:'Nenhum usuário ativo dos setores Projetos, Topografia ou Pós-Protocolo foi encontrado.';
  }
}

function compactSectors(){
  const rows=qsa('.sector-manage-row');
  rows.forEach(row=>{
    if(row.dataset.hotfix8)return;row.dataset.hotfix8='1';
    const main=row.querySelector('[data-filter-sector]');
    const actions=row.querySelector('.actions');
    if(!main||!actions)return;
    row.classList.add('sector-list-compact');
    main.classList.add('sector-list-main');
    const strong=main.querySelector('strong');
    if(strong){
      const name=document.createElement('div');name.className='sector-list-name';
      strong.replaceWith(name);name.appendChild(strong);
      name.appendChild(actions);
    }
  });
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
    e.preventDefault();
    const err=qs('#osHotfixError');err.textContent='';
    const fd=new FormData(form);
    const nome=String(fd.get('nome')||'').trim();
    const municipio=String(fd.get('municipio')||'').trim();
    const estado=String(fd.get('estado')||'').trim();
    if(!nome||!municipio||!estado){err.textContent='Preencha nome, município e estado.';return;}
    const row={id:o.id||uid(),nome,nucleo_referente:String(fd.get('nucleo')||'').trim()||null,etapa_atual:String(fd.get('etapa')||''),municipio,estado,observacoes:String(fd.get('observacoes')||'').trim()||null,created_by:o.created_by||me()?.id||null,updated_at:new Date().toISOString()};
    const saveBtn=qs('#modalSave');if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Salvando...';}
    try{
      const r=await sb().from('ordens_servico').upsert(row,{onConflict:'id'}).select().single();
      if(r.error)throw r.error;
      B().closeModal();
      await window.ERPMetasV2?.refresh?.();
      setTimeout(()=>qs('#metaOrders')?.click(),40);
    }catch(x){console.error('Salvar Ordem de Serviço:',x);err.textContent=`Não foi possível salvar: ${x.message||x}`;if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Salvar';}}
  };
}

async function getOrder(id){
  const r=await sb().from('ordens_servico').select('*').eq('id',id).maybeSingle();
  if(r.error){alert(r.error.message);return null;}return r.data;
}

function interceptOsButtons(){
  const newBtn=qs('#osNew');
  if(newBtn&&!newBtn.dataset.hotfix8){newBtn.dataset.hotfix8='1';newBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openOsModal();},{capture:true});}
  qsa('[data-edit-os]').forEach(btn=>{if(btn.dataset.hotfix8)return;btn.dataset.hotfix8='1';btn.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();const o=await getOrder(btn.dataset.editOs);if(o)openOsModal(o);},{capture:true});});
  const detailEdit=qs('#osDetailEdit');
  if(detailEdit&&!detailEdit.dataset.hotfix8){detailEdit.dataset.hotfix8='1';detailEdit.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();const back=qs('#osDetailBack');const title=qs('.os-hero h3')?.textContent?.trim();let o=null;if(title){const r=await sb().from('ordens_servico').select('*').eq('nome',title).limit(1).maybeSingle();if(!r.error)o=r.data;}if(o)openOsModal(o);},{capture:true});}
}

function reconcile(){refineMetaModal();compactSectors();interceptOsButtons();}
let scheduled=false;const obs=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;reconcile();});});obs.observe(document.documentElement,{childList:true,subtree:true});
reconcile();
})();
