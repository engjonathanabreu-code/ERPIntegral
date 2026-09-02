(() => {
'use strict';
if(window.ERPProcessObservations)return;window.ERPProcessObservations=true;
let bridge=null,sb=null,currentProcessId=null,currentProfile=null,processCache=new Map();
const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const brDateTime=v=>v?new Date(v).toLocaleString('pt-BR'):'—';

async function loadCurrentProfile(){
  const user=bridge?.currentUser;
  if(!user?.id||!sb)return null;
  const {data}=await sb.from('profiles').select('id,nome,setor').eq('id',user.id).maybeSingle();
  currentProfile=data||{id:user.id,nome:user.email||'Usuário',setor:null};
  return currentProfile;
}

async function loadProcess(id){
  if(processCache.has(id))return processCache.get(id);
  const {data,error}=await sb.from('processos_kanban').select('id,responsavel_setor,observacao_interna').eq('id',id).maybeSingle();
  if(error)throw error;
  processCache.set(id,data||{});
  return data||{};
}

async function loadSectors(){
  const {data,error}=await sb.from('profiles').select('setor').eq('ativo',true).not('setor','is',null);
  if(error)throw error;
  return [...new Set((data||[]).map(x=>String(x.setor||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}

async function loadComments(id){
  const {data,error}=await sb.from('processos_kanban_observacoes').select('id,autor_id,autor_nome,autor_setor,texto,created_at').eq('processo_id',id).order('created_at',{ascending:false});
  if(error)throw error;
  return data||[];
}

function renderComments(list){
  const root=document.querySelector('#pdObservationHistory');if(!root)return;
  root.innerHTML=list.length?list.map(item=>`<article class="process-observation-item"><div><strong>${esc(item.autor_nome||'Usuário')}</strong>${item.autor_setor?`<span>${esc(item.autor_setor)}</span>`:''}<time>${esc(brDateTime(item.created_at))}</time></div><p>${esc(item.texto)}</p></article>`).join(''):'<div class="process-observation-empty">Nenhuma observação enviada ainda.</div>';
}

async function sendObservation(id){
  const field=document.querySelector('#pdInternalObservation');
  const button=document.querySelector('#pdSendObservation');
  if(!field||!button)return;
  const text=field.value.trim();
  if(!text){field.focus();return;}
  const profile=currentProfile||await loadCurrentProfile();
  const old=button.textContent;
  try{
    button.disabled=true;button.textContent='Enviando…';
    const {error}=await sb.from('processos_kanban_observacoes').insert({
      processo_id:id,
      autor_id:profile?.id||bridge?.currentUser?.id,
      autor_nome:profile?.nome||bridge?.currentUser?.email||'Usuário',
      autor_setor:profile?.setor||null,
      texto:text
    });
    if(error)throw error;
    field.value='';
    // Mantém o resumo da observação também disponível no cadastro do projeto sincronizado com o CRM.
    const sync=await sb.functions.invoke('salvar-observacao-processo',{body:{processo_id:id,observacao:text}});
    if(sync.error)console.warn('Falha ao sincronizar observação com CRM',sync.error);
    const comments=await loadComments(id);renderComments(comments);
    button.textContent='Enviado';setTimeout(()=>{button.textContent=old;button.disabled=false;},700);
  }catch(err){
    console.error('Enviar observação',err);button.disabled=false;button.textContent=old;alert('Não foi possível enviar a observação: '+(err?.message||err));
  }
}

async function saveSector(id){
  const select=document.querySelector('#pdSector');if(!select||!sb)return;
  const setor=select.value||null;
  const {error}=await sb.from('processos_kanban').update({responsavel_setor:setor,responsavel_id:null,updated_at:new Date().toISOString()}).eq('id',id);
  if(error){console.error('Responsável por setor',error);alert('As demais alterações foram salvas, mas não foi possível atualizar o setor responsável: '+error.message);return;}
  const cached=processCache.get(id)||{};cached.responsavel_setor=setor;processCache.set(id,cached);
}

function decorateCards(){
  document.querySelectorAll('.process-card[data-process-id]').forEach(async card=>{
    if(card.dataset.sectorDecorated)return;
    card.dataset.sectorDecorated='1';
    try{
      const p=await loadProcess(card.dataset.processId);
      if(!p?.responsavel_setor)return;
      let owner=card.querySelector('.process-owner');
      if(!owner){owner=document.createElement('div');owner.className='process-owner';const meta=card.querySelector('.process-card-meta');meta?.after(owner);}
      owner.textContent=p.responsavel_setor;
    }catch(e){console.warn('Setor do processo',e);}
  });
}

async function inject(){
  const modal=document.querySelector('#processModal');
  if(!modal||modal.dataset.processEnhancements||!currentProcessId||!sb)return;
  const pendency=document.querySelector('#pdPendency');const oldOwner=document.querySelector('#pdOwner');
  if(!pendency||!oldOwner)return;
  modal.dataset.processEnhancements='1';
  try{
    const [process,sectors,comments]=await Promise.all([loadProcess(currentProcessId),loadSectors(),loadComments(currentProcessId)]);

    // O responsável do processo é um SETOR. O select legado de usuário fica oculto e vazio
    // apenas para compatibilidade com o salvamento original do módulo.
    const ownerLabel=oldOwner.closest('label');
    oldOwner.value='';oldOwner.style.display='none';oldOwner.setAttribute('aria-hidden','true');
    const sectorSelect=document.createElement('select');sectorSelect.id='pdSector';
    sectorSelect.innerHTML='<option value="">Não definido</option>'+sectors.map(s=>`<option value="${esc(s)}" ${s===process.responsavel_setor?'selected':''}>${esc(s)}</option>`).join('');
    ownerLabel.childNodes[0].textContent='Setor responsável';ownerLabel.appendChild(sectorSelect);

    const label=pendency.closest('label');
    const obs=document.createElement('section');obs.className='full process-internal-observation';
    obs.innerHTML=`<div class="process-observation-head"><div><strong>Observações internas</strong><small>Registro interno com autor, setor, data e hora.</small></div></div><textarea id="pdInternalObservation" rows="3" placeholder="Digite uma observação sobre este projeto/núcleo..."></textarea><div class="process-observation-actions"><button type="button" id="pdSendObservation" class="btn">Enviar observação</button></div><div id="pdObservationHistory" class="process-observation-history"></div>`;
    label.before(obs);
    renderComments(comments);
    obs.querySelector('#pdSendObservation').onclick=()=>sendObservation(currentProcessId);
  }catch(err){console.error('Ajustes do processo',err);}
}

function capture(e){
  const card=e.target.closest?.('.process-card[data-process-id]');if(card)currentProcessId=card.dataset.processId;
  const save=e.target.closest?.('#pdSave');if(save&&currentProcessId){const id=currentProcessId;setTimeout(()=>saveSector(id),0);}
}

function observe(){
  new MutationObserver(()=>{if(document.querySelector('#processModal'))inject();decorateCards();}).observe(document.documentElement,{childList:true,subtree:true});
  decorateCards();
}

async function start(){
  bridge=window.ERPIntegralBridge;if(!bridge)return;sb=bridge.sb;
  await loadCurrentProfile();document.addEventListener('click',capture,true);observe();
}
window.addEventListener('erp-bridge-ready',start,{once:true});if(window.ERPIntegralBridge)start();
})();