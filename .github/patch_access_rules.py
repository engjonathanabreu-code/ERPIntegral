from pathlib import Path

app = Path('ERP-INTEGRAL-4.0-SUPABASE-MIGRADO/public/app.js')
s = app.read_text()

def replace(old, new, label):
    global s
    assert old in s, f'trecho nao encontrado: {label}'
    s = s.replace(old, new, 1)

replace(
"const USER_TYPES=['Administrador','Comercial','Financeiro','Projetos','Topografia','Marketing','Pós-protocolo','Atendimentos','Diretor Técnico'];",
"const USER_TYPES=['Administrador','Comercial','Financeiro','Projetos','Topografia','Jurídico','Marketing','Pós-protocolo','Atendimentos','Diretor Técnico','Diretor de Projetos'];",
'USER_TYPES')

replace(
"const USER_SECTORS=['Administrativo','Comercial','Financeiro','Projetos','Topografia','Marketing','Pós-protocolo','Atendimentos'];",
"const USER_SECTORS=['Administrativo','Comercial','Financeiro','Projetos','Topografia','Jurídico','Marketing','Pós-protocolo','Atendimentos'];",
'USER_SECTORS')

replace(
"const METAS_SECTORS=['Projetos','Topografia','Pós-protocolo','Atendimentos'];",
"const METAS_SECTORS=['Projetos','Topografia','Pós-protocolo','Jurídico','Atendimentos'];",
'METAS_SECTORS')

replace(
"function isTechDirector(){return currentUser?.type==='Diretor Técnico';}\nfunction isMetasManager(){return isAdmin()||isTechDirector();}\nfunction canSeePlan(plan){return canManageCore()||isTechDirector()||plan.steps.some(s=>s.responsibleIds.includes(currentUser.id));}\nfunction canEditStep(step){return isAdmin()||isTechDirector()||step.responsibleIds.includes(currentUser.id);}\nfunction isMetasSector(){return METAS_SECTORS.includes(currentUser?.type);}\nfunction canSeeMetas(){return isMetasManager()||isMetasSector();}\nfunction metasScopeUsers(){return db.users.filter(u=>u.active&&METAS_SECTORS.includes(u.type));}",
"function isTechDirector(){return currentUser?.type==='Diretor Técnico';}\nfunction isProjectDirector(){return ['Diretor de Projetos','Diretor de Projeto'].includes(currentUser?.type);}\nfunction isFinanceAccess(){return currentUser?.type==='Financeiro'||currentUser?.sector==='Financeiro';}\nfunction isProjectAccessManager(){return isProjectDirector()||isFinanceAccess();}\nfunction isMetasManager(){return isAdmin()||isTechDirector()||isProjectDirector();}\nfunction canSeePlan(plan){return canManageCore()||isTechDirector()||isProjectAccessManager()||plan.steps.some(s=>s.responsibleIds.includes(currentUser.id));}\nfunction canEditStep(step){return isAdmin()||isTechDirector()||step.responsibleIds.includes(currentUser.id);}\nfunction isMetasSector(){return METAS_SECTORS.includes(currentUser?.type)||METAS_SECTORS.includes(currentUser?.sector);}\nfunction canSeeMetas(){return isMetasManager()||isProjectAccessManager()||isMetasSector();}\nfunction metasScopeUsers(){return db.users.filter(u=>u.active&&(METAS_SECTORS.includes(u.type)||METAS_SECTORS.includes(u.sector)));}",
'acesso por setor e funcao')

replace(
"function navItems(){if(isAdmin())return ADMIN_NAV;if(isComercial())return COMERCIAL_NAV;if(isTechDirector())return [['metas','Metas']];if(isMetasSector())return [['plans','Planos de trabalho'],['metas','Metas']];return [['plans','Planos de trabalho']];}",
"function navItems(){if(isAdmin())return ADMIN_NAV;if(isComercial())return COMERCIAL_NAV;if(isProjectAccessManager())return [['projects','Projetos'],['plans','Planos de trabalho'],['metas','Metas']];if(isTechDirector())return [['metas','Metas']];if(isMetasSector())return [['plans','Planos de trabalho'],['metas','Metas']];return [['plans','Planos de trabalho']];}",
'navItems')

replace(
"function allowedProfessional(u){const t=normRole(u?.type||u?.role||'');return t.includes('projet')||t.includes('topografia')||t.includes('pos protocolo');}",
"function allowedProfessional(u){const t=normRole(u?.type||u?.role||''),s=normRole(u?.sector||'');return t.includes('projet')||t.includes('topografia')||t.includes('pos protocolo')||t.includes('juridico')||s.includes('projet')||s.includes('topografia')||s.includes('pos protocolo')||s.includes('juridico');}",
'allowedProfessional')

app.write_text(s)

bridge = Path('ERP-INTEGRAL-4.0-SUPABASE-MIGRADO/public/erp-bridge.js')
b = bridge.read_text()

def breplace(old, new, label):
    global b
    assert old in b, f'trecho bridge nao encontrado: {label}'
    b = b.replace(old, new, 1)

breplace(
"core.users=(pr.data||[]).map(x=>({id:x.id,name:x.nome,email:x.email||'',type:x.tipo,active:x.ativo!==false}));",
"core.users=(pr.data||[]).map(x=>({id:x.id,name:x.nome,email:x.email||'',type:x.tipo,sector:x.setor||x.tipo,active:x.ativo!==false}));",
'bridge users sector')

breplace(
"me=core.users.find(x=>x.id===user.id)||{id:user.id,name:user.email,type:'',active:true};",
"me=core.users.find(x=>x.id===user.id)||{id:user.id,name:user.email,type:'',sector:'',active:true};",
'bridge me sector')

breplace(
"function installMetasNav(){if(!me)return;const nav=document.querySelector('.nav');if(!nav||nav.querySelector('[data-standalone-metas]')||nav.querySelector('[data-view=\"metas\"]'))return;const b=document.createElement('button');b.dataset.standaloneMetas='metas';b.textContent='Metas';b.onclick=()=>{nav.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');window.ERPMetasV2?.render?.()};nav.appendChild(b)}",
"function bridgeNorm(v){return String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim()}\nfunction bridgeCanHaveMetas(){const t=bridgeNorm(me?.type),s=bridgeNorm(me?.sector);return ['administrador','diretor tecnico','diretor de projetos','diretor de projeto','financeiro','projetos','topografia','pos-protocolo','pos protocolo','juridico','atendimentos'].includes(t)||['financeiro','projetos','topografia','pos-protocolo','pos protocolo','juridico','atendimentos'].includes(s)}\nfunction installMetasNav(){if(!me||!bridgeCanHaveMetas())return;const nav=document.querySelector('.nav');if(!nav||nav.querySelector('[data-standalone-metas]')||nav.querySelector('[data-view=\"metas\"]'))return;const b=document.createElement('button');b.dataset.standaloneMetas='metas';b.textContent='Metas';b.onclick=()=>{nav.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');window.ERPMetasV2?.render?.()};nav.appendChild(b)}",
'bridge metas nav')

bridge.write_text(b)
