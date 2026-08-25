from pathlib import Path
import re

root=Path('ERP-INTEGRAL-4.0-SUPABASE-MIGRADO')
metas=root/'public/metas-v2.js'
css=root/'public/metas-v2.css'
app=root/'public/app.js'
api=root/'api/admin-user-password.js'
index=root/'public/index.html'

s=metas.read_text()
s=s.replace("const META_STATUS=['Planejamento','Em andamento','Concluído','Cancelado'];","const META_STATUS=['Em andamento','Concluído','Cancelado'];")
s=s.replace("const state={loaded:false,loading:false,error:null,screen:'home',weekOffset:0,selectedUser:null,sectors:[],orders:[],orderComments:[],metas:[],responsibles:[],history:[],files:[]};","const state={loaded:false,loading:false,error:null,screen:'home',weekOffset:0,selectedUser:null,sectors:[],orders:[],orderComments:[],metas:[],responsibles:[],history:[],files:[]};\nlet fetchPromise=null;")
marker="const canManageSectors=()=>canManageMeta();"
approval="""const canManageSectors=()=>canManageMeta();
const normRole=v=>String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();
const isMetaApprover=()=>['administrador','diretor tecnico','diretor de projetos'].includes(normRole(roleName()));
const isMetaResponsible=m=>metaResponsibles(m.id).includes(currentUser()?.id);
const isPendingApproval=m=>normRole(m?.status)==='aguardando aprovacao';
const canRequestConclusion=m=>!!m&&isMetaResponsible(m)&&!isMetaApprover()&&!['concluido','cancelado','aguardando aprovacao'].includes(normRole(m.status));
const canApproveConclusion=m=>!!m&&isMetaApprover()&&isPendingApproval(m);"""
if marker in s:s=s.replace(marker,approval,1)

fetch_fn="""async function fetchAll(){
  const client=sb();
  if(!client){state.error=new Error('Conexão com o Supabase ainda não está pronta.');return;}
  if(fetchPromise)return fetchPromise;
  state.loading=true;state.error=null;
  fetchPromise=(async()=>{
    try{
      const [s,o,oc,m,r,h,f]=await Promise.all([
        client.from('meta_setores').select('*').order('nome'),
        client.from('ordens_servico').select('*').order('created_at',{ascending:false}),
        client.from('ordem_servico_comentarios').select('*').order('created_at'),
        client.from('metas').select('*').order('semana_inicio',{ascending:false}),
        client.from('meta_responsaveis').select('*'),
        client.from('meta_historico').select('*').order('created_at',{ascending:false}),
        client.from('meta_arquivos').select('*').order('created_at',{ascending:false})
      ]);
      const first=[s,o,oc,m,r,h,f].find(x=>x.error);
      if(first?.error)throw first.error;
      state.sectors=s.data||[];state.orders=o.data||[];state.orderComments=oc.data||[];state.metas=m.data||[];state.responsibles=r.data||[];state.history=h.data||[];state.files=f.data||[];state.loaded=true;
    }catch(e){state.error=e;state.loaded=false;console.warn('Metas V2:',e)}
    finally{state.loading=false;fetchPromise=null;}
  })();
  return fetchPromise;
}

function metaResponsibles"""
s,n=re.subn(r"async function fetchAll\(\)\{.*?\n\}\n\nfunction metaResponsibles",fetch_fn,s,count=1,flags=re.S)
if n!=1: raise SystemExit('fetchAll nao localizado')
s=s.replace("function statusBadge(v){const c=v==='Concluído'?'ok':v==='Cancelado'?'danger':v==='Planejamento'?'warn':'';return `<span class=\"badge ${c}\">${esc(v)}</span>`}","function statusBadge(v){const c=v==='Concluído'?'ok':v==='Cancelado'?'danger':v==='Aguardando aprovação'?'warn':'';return `<span class=\"badge ${c}\">${esc(v)}</span>`}")

approval_functions="""async function requestMetaConclusion(m){
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

"""
idx=s.find("function renderLoading()")
if idx<0: raise SystemExit('renderLoading nao localizado')
s=s[:idx]+approval_functions+s[idx:]

old_card=re.search(r"function metaCardHtml\(m\)\{.*?\}\n\nfunction renderUserBoard",s,flags=re.S)
if not old_card: raise SystemExit('metaCardHtml nao localizado')
new_card="""function metaCardHtml(m){const resp=metaResponsibles(m.id).map(userName).join(', ')||'Sem responsável';const action=conclusionActionHtml(m);return `<button type="button" class="metas2-card" data-meta-card="${m.id}"><div class="metas2-card-top"><strong>${esc(m.titulo)}</strong>${statusBadge(m.status)}</div><span class="muted metas2-assoc">${esc(associationLabel(m))}</span><p>${esc(m.observacoes||'Sem observações.')}</p><div class="metas2-card-foot"><span>${esc(sectorLabel(m.setor_id))}</span><span>${m.prazo?'Prazo '+brDate(m.prazo):'Sem prazo'}</span></div><small>${esc(resp)}</small>${action?`<div class="meta-conclusion-row">${action}</div>`:''}</button>`}

function renderUserBoard"""
s=s[:old_card.start()]+new_card+s[old_card.end():]
s=s.replace("const columns=[['Planejamento',week.filter(m=>['Planejamento','Em andamento'].includes(m.status))],['Concluído',week.filter(m=>m.status==='Concluído')],['Cancelado',week.filter(m=>m.status==='Cancelado')]];","const columns=[['Em andamento',week.filter(m=>['Em andamento','Aguardando aprovação'].includes(m.status))],['Concluído',week.filter(m=>m.status==='Concluído')],['Cancelado',week.filter(m=>m.status==='Cancelado')]];")
s=s.replace("${META_STATUS.map(x=>`<option ${m?.status===x?'selected':''}>${x}</option>`).join('')}","${META_STATUS.map(x=>`<option ${(m?.status||'Em andamento')===x?'selected':''}>${x}</option>`).join('')}")
s=s.replace("status:fd.get('status')","status:fd.get('status')||'Em andamento'")
s=s.replace("qsa('[data-meta-card]').forEach(b=>b.onclick=()=>metaDetail(b.dataset.metaCard));","wireMetaCards();")

detail=re.search(r"function metaDetail\(id\)\{.*?\}\nfunction weekEndFromStart",s,flags=re.S)
if not detail: raise SystemExit('metaDetail nao localizado')
new_detail="""function metaDetail(id){const m=state.metas.find(x=>x.id===id);if(!m)return;const resp=metaResponsibles(id);const files=state.files.filter(f=>f.meta_id===id),hist=state.history.filter(h=>h.meta_id===id);const editable=canManageMeta();const conclusion=conclusionActionHtml(m);B().openModal(m.titulo,`<div class="metas-modal-meta"><span class="badge">${esc(associationLabel(m))}</span>${statusBadge(m.status)}<span class="badge">${esc(sectorLabel(m.setor_id))}</span></div><div class="card meta-detail-card"><div class="info-grid"><div class="info-box"><b>Semana</b>${brDate(m.semana_inicio)} a ${brDate(weekEndFromStart(m.semana_inicio))}</div><div class="info-box"><b>Prazo</b>${brDate(m.prazo)}</div><div class="info-box"><b>Responsáveis</b>${esc(resp.map(userName).join(', ')||'—')}</div></div><div class="field"><label>Observações</label><div class="info-box">${esc(m.observacoes||'Sem observações.')}</div></div>${conclusion?`<div class="meta-conclusion-row detail">${conclusion}</div>`:''}</div><div class="metas-tabs"><button class="metas-tab active" data-v2tab="files">Arquivos (${files.length})</button><button class="metas-tab" data-v2tab="history">Histórico (${hist.length})</button></div><div class="metas-tab-panel" data-v2panel="files"><div class="meta-file-list">${files.map(f=>`<button type="button" class="meta-file" data-open-meta-file="${f.id}"><strong>${esc(f.nome)}</strong><span class="muted">${new Date(f.created_at).toLocaleString('pt-BR')}</span></button>`).join('')||'<div class="empty compact">Nenhum arquivo enviado.</div>'}</div><div class="dropzone compact"><input id="metaFileInput" type="file"><button type="button" class="btn secondary" id="metaFileUpload">Enviar arquivo</button></div></div><div class="metas-tab-panel hidden" data-v2panel="history">${historyHtml(hist)}</div>${editable?`<div class="meta-admin-actions"><button class="btn secondary" id="metaEdit">Editar meta</button><button class="btn danger" id="metaDelete">Excluir meta</button></div>`:''}`,()=>B().closeModal());qsa('[data-v2tab]').forEach(t=>t.onclick=()=>{qsa('[data-v2tab]').forEach(x=>x.classList.remove('active'));t.classList.add('active');qsa('[data-v2panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.v2panel!==t.dataset.v2tab))});qs('[data-request-meta]')?.addEventListener('click',()=>requestMetaConclusion(m));qs('[data-approve-meta]')?.addEventListener('click',()=>approveMetaConclusion(m));qs('#metaEdit')?.addEventListener('click',()=>{B().closeModal();metaModal(m)});qs('#metaDelete')?.addEventListener('click',()=>deleteMeta(m));qs('#metaFileUpload').onclick=()=>uploadMetaFile(m);qsa('[data-open-meta-file]').forEach(b=>b.onclick=()=>openMetaFile(state.files.find(f=>f.id===b.dataset.openMetaFile)))}
function weekEndFromStart"""
s=s[:detail.start()]+new_detail+s[detail.end():]

render_re=r"async function render\(\)\{.*?\}\nwindow\.ERPMetasV2=\{.*?\};\nfetchAll\(\)\.then\(installEntityHistoryHooks\);"
new_render="""async function render(){renderLoading();if(B()?.refreshCore)await B().refreshCore();await fetchAll();if(B()?.currentView!=='metas')return;if(state.error){renderSetupError();return;}renderCurrentScreen();installEntityHistoryHooks();}
window.ERPMetasV2={render,refresh:render,historyModal};
window.addEventListener('erp-bridge-ready',()=>{if(B()?.currentView==='metas')render();});"""
s,n=re.subn(render_re,new_render,s,count=1,flags=re.S)
if n!=1: raise SystemExit('bloco final do Metas nao localizado')
metas.write_text(s)

c=css.read_text()
c=re.sub(r"\.metas2-card-grid\{[^}]+\}",".metas2-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:8px}",c,count=1)
c=re.sub(r"\.metas2-card\{[^}]+\}",".metas2-card{appearance:none;text-align:left;border:1px solid var(--line,#dfe7e6);border-radius:11px;background:#fff;padding:10px 11px;display:flex;flex-direction:column;gap:5px;cursor:pointer;transition:.16s ease;min-width:0;min-height:132px}",c,count=1)
c += """
.metas2-card-top strong{font-size:13px;line-height:1.25}.metas2-card .badge{font-size:10px;padding:3px 6px}.metas2-card p{font-size:12px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.metas2-card-foot,.metas2-card small,.metas2-assoc{font-size:10.5px}.meta-conclusion-row{display:flex;justify-content:flex-end;margin-top:auto;padding-top:6px;border-top:1px solid var(--line,#dfe7e6)}.meta-conclusion-row.detail{margin-top:12px}.meta-conclusion-action,.meta-conclusion-pending{display:inline-flex;align-items:center;border-radius:8px;padding:5px 8px;font-size:10.5px;font-weight:700}.meta-conclusion-action{cursor:pointer}.meta-conclusion-action.request{background:#0f6b65;color:#fff}.meta-conclusion-action.approve{background:#dff1ee;color:#075b55;border:1px solid #9acbc5}.meta-conclusion-pending{background:#fff6d9;color:#806116;border:1px solid #ead79c}
.user-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}.user-admin-card{cursor:pointer;text-align:left;min-height:126px}.user-admin-card:hover{border-color:#8fc4be;box-shadow:0 7px 18px rgba(15,80,77,.08)}.user-admin-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.user-admin-card-meta{display:grid;gap:4px;margin-top:10px;font-size:12px}.user-history-list{display:grid;gap:8px;margin-top:8px}.user-history-item{padding:9px 10px;border:1px solid var(--line,#dfe7e6);border-radius:9px;background:#f8fbfb}.user-history-item p{margin:3px 0;font-size:12px}.user-history-item small{color:var(--muted,#6b7b79)}
"""
css.write_text(c)

a=app.read_text()
a=a.replace("const USER_TYPES=['Administrador','Comercial','Projetos','Topografia','Marketing','Pós-protocolo','Atendimentos','Diretor Técnico'];","const USER_TYPES=['Administrador','Comercial','Projetos','Topografia','Marketing','Pós-protocolo','Atendimentos','Diretor Técnico'];\nconst USER_SECTORS=['Administrativo','Comercial','Projetos','Topografia','Marketing','Pós-protocolo','Atendimentos'];")
a=a.replace("users:profiles.map(x=>({id:x.id,name:x.nome,cpf:x.cpf||'',email:x.email||'',type:x.tipo,active:x.ativo!==false,createdAt:(x.created_at||'').slice(0,10)}))","users:profiles.map(x=>({id:x.id,name:x.nome,cpf:x.cpf||'',email:x.email||'',type:x.tipo,sector:x.setor||x.tipo,active:x.ativo!==false,createdAt:(x.created_at||'').slice(0,10)}))")
a=a.replace("return {id:data.id,name:data.nome,cpf:data.cpf||'',email:data.email||authUser.email||'',type:data.tipo,active:data.ativo};","return {id:data.id,name:data.nome,cpf:data.cpf||'',email:data.email||authUser.email||'',type:data.tipo,sector:data.setor||data.tipo,active:data.ativo};")
a=a.replace("tipo:u.type,ativo:u.active!==false","tipo:u.type,setor:u.sector||u.type,ativo:u.active!==false")
users_match=re.search(r"function renderUsers\(\)\{.*?\n\}\nfunction userModal",a,flags=re.S)
if not users_match: raise SystemExit('renderUsers nao localizado')
users_new="""function renderUsers(){
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
function userModal"""
a=a[:users_match.start()]+users_new+a[users_match.end():]
a=a.replace("<div class=\"field\"><label>E-mail</label><input name=\"email\" type=\"email\" required value=\"${esc(u.email||'')}\" ${u.id?'readonly':''}></div>${u.id?'':`<div class=\"field\"><label>Senha inicial</label><input name=\"password\" type=\"password\" required minlength=\"6\"></div>`}<div class=\"field\"><label>Tipo</label><select name=\"type\" required>${USER_TYPES.map(t=>`<option ${u.type===t?'selected':''}>${t}</option>`).join('')}</select></div>","<div class=\"field\"><label>E-mail</label><input name=\"email\" type=\"email\" required value=\"${esc(u.email||'')}\"></div><div class=\"field\"><label>${u.id?'Nova senha (opcional)':'Senha inicial'}</label><input name=\"password\" type=\"password\" ${u.id?'':'required'} minlength=\"8\"></div><div class=\"field\"><label>Setor</label><select name=\"sector\" required>${USER_SECTORS.map(t=>`<option ${String(u.sector||u.type)===t?'selected':''}>${t}</option>`).join('')}</select></div><div class=\"field\"><label>Função</label><select name=\"type\" required>${USER_TYPES.map(t=>`<option ${u.type===t?'selected':''}>${t}</option>`).join('')}</select></div>")
a=a.replace("<div id=\"userStatus\" class=\"field full muted\"></div></form>","<div id=\"userStatus\" class=\"field full muted\"></div>${u.id?'<div class=\"field full\"><label>Histórico de metas</label><div id=\"userMetaHistory\"><div class=\"muted\">Carregando histórico...</div></div></div>':''}</form>",1)
a=a.replace("const profile={nome:fd.get('name').trim(),cpf:cpf||null,tipo:fd.get('type'),ativo:fd.get('active')==='true'};","const profile={nome:fd.get('name').trim(),cpf:cpf||null,email,setor:fd.get('sector'),tipo:fd.get('type'),ativo:fd.get('active')==='true'};")
a=a.replace("if(u.id){\n      const r=await sb.from('profiles').update(profile).eq('id',u.id).select().single();","if(u.id){\n      const password=String(fd.get('password')||'');\n      if(email!==normEmail(u.email)||password){const {data:{session}}=await sb.auth.getSession();const ar=await fetch('/api/admin-user-password',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},body:JSON.stringify({userId:u.id,email:email!==normEmail(u.email)?email:undefined,password:password||undefined})});const aj=await ar.json();if(!ar.ok){status.textContent='';alert(`Não foi possível atualizar o acesso: ${aj.error||'erro desconhecido'}`);return;}}\n      const r=await sb.from('profiles').update(profile).eq('id',u.id).select().single();")
a=a.replace("Object.assign(u,{name:profile.nome,cpf:profile.cpf||'',type:profile.tipo,active:profile.ativo});","Object.assign(u,{name:profile.nome,cpf:profile.cpf||'',email:profile.email,sector:profile.setor,type:profile.tipo,active:profile.ativo});")
a=a.replace("options:{data:{nome:profile.nome,cpf:profile.cpf||'',tipo:profile.tipo}}","options:{data:{nome:profile.nome,cpf:profile.cpf||'',tipo:profile.tipo,setor:profile.setor}}")
a=a.replace("$('#userForm').onsubmit=async e=>{","if(u.id)userMetaHistoryHtml(u.id).then(html=>{const el=$('#userMetaHistory');if(el)el.innerHTML=html});\n  $('#userForm').onsubmit=async e=>{",1)
app.write_text(a)

ap=api.read_text()
ap=ap.replace("const {userId,password}=req.body||{};\n    if(!userId||typeof password!=='string'||password.length<8)return res.status(400).json({ok:false,error:'INVALID_DATA'});\n    const update=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,{method:'PUT',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({password})});","const {userId,password,email}=req.body||{};\n    if(!userId)return res.status(400).json({ok:false,error:'INVALID_DATA'});\n    if(password!=null&&(typeof password!=='string'||password.length<8))return res.status(400).json({ok:false,error:'INVALID_PASSWORD'});\n    if(email!=null&&!/^\\S+@\\S+\\.\\S+$/.test(String(email)))return res.status(400).json({ok:false,error:'INVALID_EMAIL'});\n    const changes={};if(password)changes.password=password;if(email)changes.email=String(email).trim().toLowerCase();\n    if(!Object.keys(changes).length)return res.status(400).json({ok:false,error:'NO_CHANGES'});\n    const update=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,{method:'PUT',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify(changes)});")
api.write_text(ap)

i=index.read_text()
for line in ['  <script src="metas-hotfix-v8.js?v=14"></script>\n','  <script src="metas-conclusion-approval.js?v=14"></script>\n','  <script src="metas-init-fix.js?v=14"></script>\n']:
    i=i.replace(line,'')
i=i.replace('metas-v2.css?v=14','metas-v2.css?v=15').replace('app.js?v=14','app.js?v=15').replace('metas-v2.js?v=14','metas-v2.js?v=15')
index.write_text(i)
