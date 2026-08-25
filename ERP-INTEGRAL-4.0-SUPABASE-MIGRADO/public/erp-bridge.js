(() => {
'use strict';
if(window.ERPIntegralBridge)return;
const cfg=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const core={users:[],projects:[],plans:[]};
let me=null,lastProjectId=sessionStorage.getItem('erp_last_project_id')||null;
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid=()=>crypto.randomUUID();
const today=()=>new Date().toISOString().slice(0,10);
const brDate=v=>v?new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR'):'—';
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const title=t=>{const el=document.querySelector('#pageTitle');if(el)el.textContent=t};
function closeModal(){document.querySelector('#modal')?.remove()}
function openModal(head,body,onSave){closeModal();const el=document.createElement('div');el.id='modal';el.className='modal-backdrop';el.innerHTML=`<section class="modal"><header class="modal-head"><h3>${esc(head)}</h3><button id="modalClose" class="btn icon ghost">×</button></header><div class="modal-body">${body}</div><footer class="modal-foot"><button id="modalCancel" class="btn ghost">Cancelar</button><button id="modalSave" class="btn">Salvar</button></footer></section>`;document.body.appendChild(el);el.querySelector('#modalClose').onclick=closeModal;el.querySelector('#modalCancel').onclick=closeModal;el.querySelector('#modalSave').onclick=onSave||closeModal;el.onclick=e=>{if(e.target===el)closeModal()}}
async function loadCore(){if(!sb)return;try{const {data:{user}}=await sb.auth.getUser();if(!user)return;const [pr,ur,pp,st,rr]=await Promise.all([sb.from('profiles').select('*').order('nome'),sb.from('projetos').select('*').order('created_at'),sb.from('planos_trabalho').select('*').order('created_at'),sb.from('etapas_plano').select('*').order('ordem'),sb.from('etapa_responsaveis').select('*')]);if(pr.error||ur.error||pp.error)return;core.users=(pr.data||[]).map(x=>({id:x.id,name:x.nome,email:x.email||'',type:x.tipo,active:x.ativo!==false}));core.projects=(ur.data||[]).map(x=>({id:x.id,name:x.nome,type:x.tipo_servico,clientId:x.cliente_id||''}));const steps=st.data||[],resp=rr.data||[];core.plans=(pp.data||[]).map(x=>({id:x.id,title:x.titulo,projectId:x.projeto_id||'',status:x.status,steps:steps.filter(s=>s.plano_id===x.id).map(s=>({id:s.id,title:s.titulo,responsibleIds:resp.filter(r=>r.etapa_id===s.id).map(r=>r.usuario_id)}))}));me=core.users.find(x=>x.id===user.id)||{id:user.id,name:user.email,type:'',active:true};window.dispatchEvent(new CustomEvent('erp-bridge-ready'));installMetasNav();tagPlanCards()}catch(e){console.warn('ERP bridge',e)}}
function activeView(){return document.querySelector('.nav button.active')?.dataset?.view||document.querySelector('.nav button.active')?.dataset?.standaloneMetas||''}
function installTypeOption(){const s=document.querySelector('#userForm select[name="type"]');if(s&&!Array.from(s.options).some(o=>o.value==='Diretor de Projetos')){const o=document.createElement('option');o.value=o.textContent='Diretor de Projetos';s.appendChild(o)}}
function installMetasNav(){if(!me)return;const nav=document.querySelector('.nav');if(!nav||nav.querySelector('[data-standalone-metas]')||nav.querySelector('[data-view="metas"]'))return;const b=document.createElement('button');b.dataset.standaloneMetas='metas';b.textContent='Metas';b.onclick=()=>{nav.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');window.ERPMetasV2?.render?.()};nav.appendChild(b)}
function hookMetasButton(){if(window.ERP_METAS_IN_CORE)return;document.querySelectorAll('.nav [data-view="metas"]').forEach(b=>{if(b.dataset.v2hook)return;b.dataset.v2hook='1';b.addEventListener('click',()=>setTimeout(()=>window.ERPMetasV2?.render?.(),20))})}
function hookProjects(){document.querySelectorAll('[data-open-project]').forEach(b=>{if(b.dataset.bridgeHook)return;b.dataset.bridgeHook='1';b.addEventListener('click',()=>{lastProjectId=b.dataset.openProject;sessionStorage.setItem('erp_last_project_id',lastProjectId)},{capture:true})})}
function tagPlanCards(){document.querySelectorAll('.plan-card:not([data-plan-card-id])').forEach(card=>{const heading=card.querySelector('.plan-head h3')?.textContent?.trim();if(!heading)return;const plan=core.plans.find(p=>p.title===heading);if(plan)card.dataset.planCardId=plan.id})}
let scheduled=false;
function reconcile(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;installTypeOption();installMetasNav();hookMetasButton();hookProjects();tagPlanCards()})}
const observer=new MutationObserver(reconcile);observer.observe(document.documentElement,{childList:true,subtree:true});
window.ERPIntegralBridge={get db(){return core},get currentUser(){return me},get currentView(){return activeView()},get currentProjectId(){return lastProjectId},sb,esc,uid,today,brDate,money,title,openModal,closeModal,findUser:id=>core.users.find(x=>x.id===id),findProject:id=>core.projects.find(x=>x.id===id),findClient:()=>null,cacheDB:()=>{},saveDB:()=>{},refreshCore:loadCore};
loadCore();reconcile();
})();
