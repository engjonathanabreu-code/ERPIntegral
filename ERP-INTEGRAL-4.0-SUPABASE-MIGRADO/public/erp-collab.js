(() => {
  'use strict';
  if (window.ERPCollaboration) return;
  const C=window.ERPCollabCore, B=()=>window.ERPIntegralBridge;
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const me=()=>window.ERPCoreNavigation?.currentUser, admin=()=>me()?.type==='Administrador';
  const manager=()=>admin()||['Diretor de Projetos','Diretor de Projeto'].includes(me()?.type);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const date=v=>v?new Date(`${v.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR'):'—';
  const stamp=v=>new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
  const labels={projeto:'Projeto',plano:'Plano de trabalho',meta:'Meta',processo:'Processo'};
  let state={userId:null,page:null,mode:'mensal',anchor:today(),filter:'todos',agenda:'',events:[],deadlines:[],agendas:[],users:[],links:[],colors:[],personal:[],notifications:[],chats:[],chat:null,tab:'direto',messages:[]};
  let loading=false, refreshBusy=false, modalReturn=null, chatPrimed=false;const chatSeen=new Set();
  const sb=()=>B().sb;
  async function rows(table,configure=q=>q) {
    const data=[];
    for(let offset=0;;offset+=1000){const r=await configure(sb().from(table).select('*')).range(offset,offset+999);if(r.error)throw r.error;data.push(...r.data);if(r.data.length<1000)return data;}
  }
  async function action(op,p){const r=await sb().rpc('erp_collab_action',{op,p});if(r.error)throw r.error;return r.data;}
  function errorMessage(e){return e?.message||'Não foi possível concluir. Tente novamente.';}
  function showError(e,root=$('.collab-dialog-body')||$('#content')){if(!root)return;let el=$('.collab-error',root);if(!el){el=document.createElement('div');el.className='collab-error';el.setAttribute('role','alert');root.prepend(el);}el.textContent=errorMessage(e);}
  async function run(fn,button){if(button?.disabled)return;if(button)button.disabled=true;try{await fn();}catch(e){showError(e);}finally{if(button?.isConnected)button.disabled=false;}}
  function bind(selector,fn,root=document){$$(selector,root).forEach(el=>el.onclick=e=>{e.preventDefault();e.stopPropagation();run(()=>fn(el,e),el);});}
  function closeDialog(){const el=$('#collabModal');if(!el)return;el.remove();modalReturn?.focus?.();}
  function dialog(title,body){
    closeDialog();modalReturn=document.activeElement;
    const el=document.createElement('div');el.id='collabModal';el.className='collab-modal';
    el.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="collabDialogTitle" class="collab-dialog"><header><h3 id="collabDialogTitle">${esc(title)}</h3><button class="btn secondary" id="collabClose" aria-label="Fechar">×</button></header><div class="collab-dialog-body">${body}</div></section>`;
    document.body.appendChild(el);$('#collabClose').onclick=closeDialog;
    el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeDialog();}if(e.key==='Tab'){const f=$$('button,input,textarea,select,a[href]',el).filter(x=>!x.disabled&&!x.hidden);if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0]?.focus();}}});
    $('#collabClose').focus();return $('.collab-dialog-body',el);
  }
  function formDialog(title,body,onSubmit){const root=dialog(title,`<form class="collab-form">${body}<button type="submit" class="btn">Salvar</button></form>`);const form=$('form',root);form.onsubmit=e=>{e.preventDefault();run(()=>onSubmit(new FormData(form)),$('button[type=submit]',form));};return root;}
  const userName=id=>state.users.find(x=>x.id===id)?.nome||'Colaborador';
  const userOptions=selected=>state.users.map(u=>`<option value="${u.id}" ${selected.includes(u.id)?'selected':''}>${esc(u.nome)}</option>`).join('');
  const linkOptions=(selected='',group=false)=>`<option value="">${group?'Selecione o vínculo':'Evento avulso'}</option>`+state.links.filter(x=>!group||x.type!=='meta').map(x=>`<option value="${x.type}:${x.id}" ${selected===`${x.type}:${x.id}`?'selected':''}>${labels[x.type]} — ${esc(x.name)}</option>`).join('');
  function splitLink(v){const [entidade_tipo,entidade_id]=String(v||'').split(':');return {entidade_tipo:entidade_tipo||null,entidade_id:entidade_id||null};}
  async function loadReference(){
    const result=await Promise.all([sb().rpc('erp_collab_directory'),rows('projetos'),rows('planos_trabalho'),rows('metas'),rows('processos_kanban',q=>q.eq('excluido_erp',false)),rows('erp_agendas')]);
    if(result[0].error)throw result[0].error;
    state.users=result[0].data||[];state.projects=result[1];state.plans=result[2];state.metas=result[3];state.processes=result[4];
    state.links=result.slice(1,5).flatMap((list,i)=>list.map(x=>({type:['projeto','plano','meta','processo'][i],id:x.id,name:x.nome||x.titulo||x.nucleo})));
    state.agendas=result[5];
  }
  async function loadCalendar(){
    const p=C.period(state.anchor,state.mode);
    const result=await Promise.all([rows('erp_eventos',q=>q.lt('inicio',`${C.move(p.end,'quinzenal',1)}T00:00:00-03:00`).gt('fim',`${p.start}T00:00:00-03:00`)),rows('erp_prazos'),rows('erp_cores_prazos'),rows('erp_agenda_pessoal')]);
    [state.events,state.deadlines,state.colors,state.personal]=result;
  }
  function activate(page){state.page=page;window.scrollTo(0,0);$('.main')?.scrollTo(0,0);$$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.collabPage===page));$('#pageTitle').textContent=page==='calendario'?'Calendário':'Chat';}
  async function openPage(page){activate(page);$('#content').innerHTML='<div class="card">Carregando...</div>';try{await loadReference();if(page==='calendario'){await loadCalendar();if(state.page===page)renderCalendar();}else{await loadChats();if(state.page===page)renderChat();}}catch(e){if(state.page===page){$('#content').innerHTML='<div class="card"><h3>Não foi possível carregar</h3><button class="btn" id="collabRetry">Tentar novamente</button></div>';showError(e);$('#collabRetry').onclick=()=>openPage(page);}}}
  function renderCalendar(){
    if(state.page!=='calendario')return;
    const p=C.period(state.anchor,state.mode), mine=new Set(state.personal.map(x=>x.chave));
    const events=state.events.filter(e=>(!state.agenda||e.agenda_id===state.agenda)&&(state.filter!=='pessoal'||mine.has(`evento:${e.id}`)));
    const deadlines=state.agenda?[]:state.deadlines.filter(e=>['meta','plano','processo'].includes(e.entidade_tipo)&&(state.filter!=='pessoal'||mine.has(e.chave)));
    const offset=new Date(`${p.start}T12:00:00`).getDay();
    $('#content').innerHTML=`<div class="collab-toolbar"><h3>${date(p.start)} a ${date(p.end)}</h3><button class="btn secondary" data-move="-1" aria-label="Período anterior">←</button><button class="btn secondary" id="collabToday">Hoje</button><button class="btn secondary" data-move="1" aria-label="Próximo período">→</button><select aria-label="Visualização" id="collabMode">${['quinzenal','mensal','trimestral'].map(x=>`<option value="${x}" ${state.mode===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></div>
      <div class="collab-toolbar"><select id="collabFilter" aria-label="Filtrar eventos"><option value="todos">Todos os eventos acessíveis</option><option value="pessoal" ${state.filter==='pessoal'?'selected':''}>Minha agenda</option></select><select id="collabAgenda" aria-label="Agenda de ativo"><option value="">Todas as agendas</option>${state.agendas.map(a=>`<option value="${a.id}" ${a.id===state.agenda?'selected':''}>${esc(a.nome)}</option>`).join('')}</select><button class="btn" id="collabNewEvent">+ Novo evento</button>${admin()?'<button class="btn secondary" id="collabNewAgenda">+ Agenda de ativo</button>':''}<button class="btn secondary" id="collabRefresh">Atualizar</button></div>
      <p class="collab-hint">Horários de Brasília. Aqui aparecem somente prazos de metas, planos de trabalho e processos. Cada prazo aparece diariamente até seu vencimento.</p>
      <div class="collab-calendar-wrap"><div class="collab-calendar">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(x=>`<div class="collab-weekday">${x}</div>`).join('')}${Array.from({length:offset},()=>'<div class="collab-day empty"></div>').join('')}${p.days.map(day=>`<section class="collab-day ${day===today()?'today':''}"><header>${date(day)}</header>${deadlines.filter(e=>C.deadlineOnDay(e,day)).map(e=>`<button class="collab-event" style="--event-color:${state.colors.find(x=>x.chave===e.chave)?.cor||C.color(e.chave)}" data-deadline="${esc(e.chave)}">${esc(e.titulo)}</button>`).join('')}${events.filter(e=>C.eventOnDay(e,day)).map(e=>`<button class="collab-event" style="--event-color:${e.cor}" data-event="${e.id}">${esc(e.titulo)}${e.agenda_id?' · '+esc(state.agendas.find(a=>a.id===e.agenda_id)?.nome||'Ativo'):''}</button>`).join('')}</section>`).join('')}</div></div>`;
    bind('[data-move]',async b=>{state.anchor=C.move(state.anchor,state.mode,Number(b.dataset.move));await loadCalendar();renderCalendar();});
    $('#collabToday').onclick=()=>run(async()=>{state.anchor=today();await loadCalendar();renderCalendar();});
    $('#collabMode').onchange=e=>run(async()=>{state.mode=e.target.value;await loadCalendar();renderCalendar();});
    $('#collabFilter').onchange=e=>{state.filter=e.target.value;renderCalendar();};$('#collabAgenda').onchange=e=>{state.agenda=e.target.value;renderCalendar();};
    bind('#collabRefresh',async()=>{await loadReference();await loadCalendar();renderCalendar();});
    bind('#collabNewEvent',()=>eventForm());bind('#collabNewAgenda',()=>agendaForm());
    bind('[data-event]',b=>eventDetail(b.dataset.event));bind('[data-deadline]',b=>deadlineDetail(state.deadlines.find(e=>e.chave===b.dataset.deadline)));
  }
  function agendaForm(){formDialog('Nova agenda de ativo','<label>Nome do ativo<input name="nome" required maxlength="120" placeholder="Ex.: Carro da empresa"></label>',async fd=>{await action('agenda',{nome:fd.get('nome')});closeDialog();await loadReference();if(state.page==='calendario')renderCalendar();});}
  async function eventForm(options={}){
    await loadReference();
    const root=formDialog('Novo evento',`<label>Título<input name="titulo" required maxlength="200"></label><label>Descrição<textarea name="descricao" maxlength="10000"></textarea></label><label>Início (Brasília)<input type="datetime-local" name="inicio" value="${today()}T09:00" required></label><label>Fim (Brasília)<input type="datetime-local" name="fim" value="${today()}T10:00" required></label><label>Associar a<select name="vinculo">${linkOptions(options.link)}</select></label><label>Agenda de ativo<select name="agenda_id"><option value="">Sem reserva de ativo</option>${state.agendas.map(a=>`<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select></label><label>Recorrência<select name="recorrencia"><option value="nenhuma">Não repetir</option><option value="diaria">Diária</option><option value="semanal">Semanal</option><option value="mensal">Mensal</option></select></label><label>Repetir até<input type="date" name="repetir_ate" min="${today()}" disabled></label><p class="collab-hint">Até 366 ocorrências, com término em até dois anos. Reservas conflitantes não são salvas.</p><label>Convidar usuários (Ctrl ou ⌘ para selecionar vários)<select name="participantes" multiple>${userOptions(options.members||[])}</select></label><label class="inline-check"><input type="checkbox" name="publico"> Visível a todos os usuários ativos</label><p class="collab-hint">Reservas de ativos são compartilhadas. Outros eventos ficam visíveis ao criador, convidados e administração.</p>`,async fd=>{
      if(fd.get('recorrencia')!=='nenhuma'&&!fd.get('repetir_ate'))throw new Error('Informe a data final da recorrência.');
      const participants=[...new Set([...fd.getAll('participantes'),...(options.members||[])])];
      const result=await action('evento',{titulo:fd.get('titulo'),descricao:fd.get('descricao'),inicio:fd.get('inicio')+'-03:00',fim:fd.get('fim')+'-03:00',...splitLink(fd.get('vinculo')),agenda_id:fd.get('agenda_id'),recorrencia:fd.get('recorrencia'),repetir_ate:fd.get('repetir_ate'),participantes:participants,publico:fd.has('publico')});
      // Calendar save is committed first; preserve the event ID if chat delivery needs retry.
      closeDialog();
      if(options.chat){try{await action('mensagem',{conversa_id:options.chat,texto:'Solicitação de evento',evento_id:result.id});}catch(e){dialog('Evento salvo',`<p>O evento foi criado, mas o convite no chat não foi enviado.</p><button class="btn" id="collabRetryInvite">Reenviar ao chat</button>`);showError(e);bind('#collabRetryInvite',async()=>{await action('mensagem',{conversa_id:options.chat,texto:'Solicitação de evento',evento_id:result.id});closeDialog();await updateMessages();});}}
      if(state.page==='calendario'){await loadCalendar();renderCalendar();}if(state.page==='chat')await updateMessages();await refreshNotifications();
    });
    $('[name=recorrencia]',root).onchange=e=>{const input=$('[name=repetir_ate]',root);input.disabled=e.target.value==='nenhuma';input.required=!input.disabled;};
  }
  async function eventDetail(id){
    const r=await sb().from('erp_eventos').select('*').eq('id',id).single();if(r.error)throw r.error;const ev=r.data;
    const responses=await rows('erp_evento_respostas',q=>q.eq('evento_id',id));
    const own=ev.created_by===me().id||admin();
    dialog(ev.titulo,`<p>${esc(ev.descricao)}</p><p><b>${stamp(ev.inicio)} → ${stamp(ev.fim)}</b></p><p>Status: ${esc(ev.status)} · Recorrência: ${esc(ev.recorrencia)}</p><p>Agenda: ${esc(state.agendas.find(a=>a.id===ev.agenda_id)?.nome||'Sem ativo')}</p><p>Participantes: ${ev.participantes.map(u=>`${esc(userName(u))} (${esc(responses.find(x=>x.usuario_id===u)?.resposta||(u===ev.created_by?'organizador':'aguardando'))})`).join(', ')}</p><div class="collab-actions">${ev.entidade_id?'<button id="collabOpenLinked" class="btn secondary">Abrir registro associado</button>':''}<button class="btn secondary" id="collabAddPersonal">Adicionar à minha agenda</button>${ev.participantes.includes(me().id)?'<button class="btn" data-rsvp="aceito">Aceitar convite</button><button class="btn secondary" data-rsvp="recusado">Recusar</button>':''}</div>${own?'<div class="collab-actions"><button class="btn secondary" data-event-status="concluido">Concluir ocorrência</button><button class="btn secondary" data-event-status="cancelado">Cancelar ocorrência</button>'+(ev.recorrencia!=='nenhuma'?'<button class="btn secondary" id="collabCancelSeries">Cancelar série</button>':'')+'</div>':''}${admin()?`<div class="collab-actions"><label>Cor <input type="color" id="collabColor" value="${ev.cor}"></label><button class="btn secondary" id="collabSaveColor">Salvar cor${ev.recorrencia!=='nenhuma'?' da série':''}</button></div>`:''}`);
    bind('#collabOpenLinked',()=>openEntity(ev.entidade_tipo,ev.entidade_id));bind('#collabAddPersonal',async b=>{const added=await togglePersonal(`evento:${id}`);b.textContent=added?'Remover da minha agenda':'Adicionar à minha agenda';});
    bind('[data-rsvp]',async b=>{await action('resposta',{id,resposta:b.dataset.rsvp});await eventDetail(id);});
    const changed=async()=>{closeDialog();await refreshNotifications();if(state.page==='calendario'){await loadCalendar();renderCalendar();}};
    bind('[data-event-status]',async b=>{await action('evento_status',{id,status:b.dataset.eventStatus});await changed();});
    bind('#collabCancelSeries',async()=>{if(!confirm('Cancelar todas as ocorrências desta série?'))return;await action('evento_status',{id,status:'cancelado',serie:true});await changed();});
    bind('#collabSaveColor',async()=>{await action('evento_cor',{id,cor:$('#collabColor').value,serie:ev.recorrencia!=='nenhuma'});await changed();});
  }
  async function togglePersonal(key){const own=state.personal.some(x=>x.chave===key);await action(own?'remover_pessoal':'pessoal',{chave:key});if(own)state.personal=state.personal.filter(x=>x.chave!==key);else state.personal.push({usuario_id:me().id,chave:key});return !own;}
  async function bindPersonalButton(button,key){if(!button||!me())return;try{const r=await sb().from('erp_agenda_pessoal').select('chave').eq('usuario_id',me().id).eq('chave',key).maybeSingle();if(r.error)throw r.error;button.textContent=r.data?'Remover do calendário':'Adicionar ao calendário';button.onclick=()=>run(async()=>{const added=await togglePersonal(key);button.textContent=added?'Remover do calendário':'Adicionar ao calendário';},button);}catch(e){console.warn('Agenda pessoal:',errorMessage(e));}}
  function deadlineDetail(ev){
    if(!ev)return;dialog(ev.titulo,`<p>${labels[ev.entidade_tipo]} · Prazo: ${date(ev.fim)}</p><div class="collab-actions"><button class="btn" id="collabOpenLinked">Abrir registro</button><button class="btn secondary" id="collabAddPersonal">Adicionar à minha agenda</button></div>${admin()?'<div class="collab-actions"><label>Cor <input type="color" id="collabColor" value="'+(state.colors.find(x=>x.chave===ev.chave)?.cor||'#2563eb')+'"></label><button class="btn secondary" id="collabSaveColor">Salvar cor</button></div>':''}`);
    bind('#collabOpenLinked',()=>openEntity(ev.entidade_tipo,ev.entidade_id));bind('#collabAddPersonal',async b=>{const added=await togglePersonal(ev.chave);b.textContent=added?'Remover da minha agenda':'Adicionar à minha agenda';});bind('#collabSaveColor',async()=>{await action('cor_prazo',{chave:ev.chave,cor:$('#collabColor').value});closeDialog();await loadCalendar();renderCalendar();});
  }
  async function openEntity(type,id){closeDialog();state.page=null;if(type==='meta'){await window.ERPMetasV2.openDetail(id);}else if(type==='processo'){await window.ERPProcessosKanban.openDetail(id);}else{window.ERPCoreNavigation.open(type,id);}reconcile();}
  async function refreshNotifications(){
    if(!me()||!$('.topbar'))return;const userId=me().id;
    const r=await sb().rpc('erp_collab_notifications');if(r.error)throw r.error;if(me()?.id!==userId)return;state.notifications=r.data||[];
    const count=state.notifications.filter(n=>!n.lida).length,el=$('#collabUnread');if(el){const value=count>99?'99+':String(count);if(el.textContent!==value)el.textContent=value;el.hidden=!count;}
  }
  async function notifications(){await loadReference();await refreshNotifications();dialog('Notificações',`<div class="collab-list">${state.notifications.sort((a,b)=>Number(a.lida)-Number(b.lida)).map((n,i)=>`<article class="collab-notice ${n.lida?'':'unread'}"><p>${esc(n.titulo)}</p>${n.prazo?`<small>Prazo: ${date(n.prazo)}</small>`:''}<div class="collab-actions"><button class="btn secondary" data-notice="${i}">Abrir</button>${n.evento_id||n.tipo==='prazo'||n.tipo==='vinculo'?`<button class="btn secondary" data-personal-notice="${i}">Adicionar à minha agenda</button>`:''}${!n.lida?`<button class="btn secondary" data-read-notice="${i}">Marcar como lida</button>`:''}</div></article>`).join('')||'<p>Você está em dia. Nenhuma notificação.</p>'}</div>`);
    bind('[data-notice]',async b=>{const n=state.notifications[Number(b.dataset.notice)];await action('lida',{chave:n.chave});if(n.tipo==='exclusao'){closeDialog();await deletionRequests();}else if(n.conversa_id){closeDialog();state.chat=n.conversa_id;await openPage('chat');}else if(n.evento_id)await eventDetail(n.evento_id);else await openEntity(n.entidade_tipo,n.entidade_id);await refreshNotifications();});
    bind('[data-read-notice]',async b=>{await action('lida',{chave:state.notifications[Number(b.dataset.readNotice)].chave});await notifications();});
    bind('[data-personal-notice]',async b=>{const n=state.notifications[Number(b.dataset.personalNotice)];const key=n.evento_id?`evento:${n.evento_id}`:n.chave.replace(/^vinculo:/,'').replace(/^prazo:/,'').replace(/:\d{4}-\d{2}-\d{2}$/,'');const added=await togglePersonal(key);b.textContent=added?'Remover da minha agenda':'Adicionar à minha agenda';});
  }
  const silenceKey=()=>`erp-chat-silence:${me()?.id||''}`;
  const silenced=()=>Number(localStorage.getItem(silenceKey())||0)>Date.now();
  function showChatPopup(message,chat){
    if(silenced()||message.autor_id===me().id)return;
    const existing=$('#collabChatPopup');existing?.remove();
    const name=chatTitle(chat),popup=document.createElement('aside');popup.id='collabChatPopup';popup.className='collab-chat-popup';
    popup.innerHTML=`<header><strong>Nova mensagem</strong><button type="button" aria-label="Fechar" data-popup-close>×</button></header><p><b>${esc(name)}</b></p><p class="collab-popup-text">${esc(message.texto||'Arquivo enviado')}</p><div class="collab-actions"><button class="btn" data-popup-open>Abrir Chat</button><button class="btn secondary" data-popup-min>Minimizar</button><select aria-label="Silenciar chat" data-popup-silence><option value="">Silenciar…</option><option value="3600000">1 hora</option><option value="14400000">4 horas</option><option value="86400000">1 dia</option></select></div>`;
    document.body.appendChild(popup);
    $('[data-popup-close]',popup).onclick=()=>popup.remove();
    $('[data-popup-min]',popup).onclick=()=>popup.classList.toggle('minimized');
    $('[data-popup-open]',popup).onclick=async()=>{popup.remove();state.chat=chat.id;await openPage('chat');};
    $('[data-popup-silence]',popup).onchange=e=>{if(e.target.value){localStorage.setItem(silenceKey(),String(Date.now()+Number(e.target.value)));popup.remove();}};
  }
  async function checkChatMessages(){
    await loadChats();const chats=state.chats;
    const latest=await Promise.all(chats.map(async chat=>{const r=await sb().from('erp_mensagens').select('*').eq('conversa_id',chat.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);if(r.error)throw r.error;return {chat,message:r.data?.[0]};}));
    for(const item of latest){if(!item.message)continue;const key=item.message.id;if(!chatPrimed){chatSeen.add(key);continue;}if(!chatSeen.has(key)){chatSeen.add(key);showChatPopup(item.message,item.chat);}}
    chatPrimed=true;
  }
  async function loadChats(){state.chats=await rows('erp_conversas',q=>q.order('created_at',{ascending:false}));if(state.chat&&!state.chats.some(c=>c.id===state.chat))state.chat=null;if(state.chat)state.tab=state.chats.find(c=>c.id===state.chat).tipo;}
  const chatTitle=c=>c.tipo==='direto'?c.participantes.filter(id=>id!==me().id).map(userName).join(', '):c.titulo;
  function renderChat(){
    if(state.page!=='chat')return;const selected=state.chats.find(c=>c.id===state.chat);
    $('#content').innerHTML=`<div class="collab-tabs"><button class="btn secondary ${state.tab==='direto'?'active':''}" data-chat-tab="direto">Chat</button><button class="btn secondary ${state.tab==='grupo'?'active':''}" data-chat-tab="grupo">Grupos de Trabalho</button>${admin()?'<button class="btn secondary" id="collabDeletionRequests">Solicitações de exclusão</button>':''}</div><div class="collab-toolbar">${state.tab==='direto'||manager()?`<button class="btn" id="collabNewChat">+ ${state.tab==='direto'?'Conversa':'Grupo de trabalho'}</button>`:''}<button class="btn secondary" id="collabChatRefresh">Atualizar</button></div><div class="collab-chat"><aside class="collab-chat-sidebar">${state.chats.filter(c=>c.tipo===state.tab).map(c=>`<button class="collab-conversation ${c.id===state.chat?'selected':''}" data-chat="${c.id}">${esc(chatTitle(c))}</button>`).join('')||'<p class="collab-hint">Nenhuma conversa neste submenu.</p>'}</aside><section class="collab-chat-body">${selected?`<div class="collab-toolbar"><h3>${esc(chatTitle(selected))}</h3><button class="btn secondary" id="collabRequestDelete">Solicitar exclusão</button></div><p class="collab-hint">${selected.participantes.map(userName).map(esc).join(', ')}</p>${selected.entidade_id?'<button class="btn secondary" id="collabChatLink">Abrir registro associado</button>':''}<div class="collab-messages" id="collabMessages" role="log" aria-label="Mensagens"></div><button class="btn secondary" id="collabOlder">Carregar mensagens anteriores</button><form class="collab-composer" id="collabComposer"><label for="collabText">Mensagem</label><textarea id="collabText" maxlength="10000" placeholder="Escreva uma mensagem"></textarea><div class="collab-actions">${['😊','👍','✅','📅','🎉','❤️'].map(e=>`<button type="button" class="btn secondary" data-emoji="${e}" aria-label="Inserir ${e}">${e}</button>`).join('')}</div><label>Arquivo (até 20 MB)<input type="file" id="collabFile"></label><div class="collab-actions"><button type="submit" class="btn">Enviar</button><button type="button" class="btn secondary" id="collabChatEvent">Solicitar evento</button></div></form>`:'<div class="card">Selecione uma conversa ou crie uma nova.</div>'}</section></div>`;
    bind('[data-chat-tab]',b=>{state.tab=b.dataset.chatTab;state.chat=null;renderChat();});bind('[data-chat]',b=>{state.chat=b.dataset.chat;state.messages=[];renderChat();});bind('#collabNewChat',()=>chatForm());bind('#collabDeletionRequests',()=>deletionRequests());bind('#collabChatRefresh',async()=>{await loadChats();renderChat();});
    if(!selected)return;
    bind('#collabChatLink',()=>openEntity(selected.entidade_tipo,selected.entidade_id));bind('#collabChatEvent',()=>eventForm({chat:selected.id,members:selected.participantes,link:selected.entidade_id?`${selected.entidade_tipo}:${selected.entidade_id}`:''}));
    bind('#collabRequestDelete',()=>formDialog('Solicitar exclusão','<label>Motivo<textarea name="motivo" required maxlength="1000"></textarea></label><p>A conversa só será removida após aprovação da administração.</p>',async fd=>{await action('exclusao',{conversa_id:selected.id,motivo:fd.get('motivo')});dialog('Solicitação enviada','<p>Aguardando decisão da administração.</p>');}));
    bind('[data-emoji]',b=>{const el=$('#collabText');el.setRangeText(b.dataset.emoji,el.selectionStart,el.selectionEnd,'end');el.focus();});
    $('#collabComposer').onsubmit=e=>{e.preventDefault();run(()=>sendMessage(selected.id),$('button[type=submit]',e.target));};
    bind('#collabOlder',()=>updateMessages(true));state.messages=[];run(()=>updateMessages());
  }
  async function chatForm(){await loadReference();const group=state.tab==='grupo';const root=formDialog(group?'Novo grupo de trabalho':'Nova conversa',`${group?'<label>Nome do grupo<input name="titulo" required maxlength="200"></label>':''}<label>${group?'Participantes (Ctrl ou ⌘ para selecionar vários)':'Usuário'}<select name="participantes" ${group?'multiple':''} required>${userOptions([])}</select></label>${group?'<label>Vincular o grupo a<select id="collabGroupLinkType"><option value="plano">Plano de Trabalho</option><option value="processo">Processo</option><option value="projeto">Projeto do ERP</option></select></label><div id="collabGroupLinkFields"></div>':''}`,async fd=>{const r=await action('conversa',{tipo:group?'grupo':'direto',titulo:fd.get('titulo')||'Conversa direta',participantes:fd.getAll('participantes'),...splitLink(fd.get('vinculo'))});closeDialog();state.chat=r.id;await loadChats();renderChat();});if(!group)return;const fields=$('#collabGroupLinkFields',root),draw=()=>{const type=$('#collabGroupLinkType',root).value;if(type==='processo'){const cities=[...new Set(state.processes.map(x=>x.municipio).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));fields.innerHTML=`<label>Município<select id="collabGroupCity" required><option value="">Selecione o município</option>${cities.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label><label id="collabGroupProcessWrap" hidden>Processo<select name="vinculo" id="collabGroupProcess" required></select></label>`;$('#collabGroupCity',root).onchange=e=>{const items=state.processes.filter(x=>x.municipio===e.target.value),wrap=$('#collabGroupProcessWrap',root),select=$('#collabGroupProcess',root);wrap.hidden=!e.target.value;select.innerHTML='<option value="">Selecione o processo</option>'+items.map(x=>`<option value="processo:${x.id}">${esc(x.nucleo)}${x.etapa_atual?' · '+esc(x.etapa_atual):''}</option>`).join('');};}else{const items=type==='plano'?state.plans:state.projects;fields.innerHTML=`<label>${type==='plano'?'Plano de Trabalho':'Projeto do ERP'}<select name="vinculo" required><option value="">Selecione</option>${items.map(x=>`<option value="${type}:${x.id}">${esc(x.titulo||x.nome)}</option>`).join('')}</select></label>`;}};draw();$('#collabGroupLinkType',root).onchange=draw;}
  async function updateMessages(older=false){
    const id=state.chat,el=$('#collabMessages');if(!id||!el)return;
    let query=sb().from('erp_mensagens').select('*').eq('conversa_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
    if(older&&state.messages.length){const first=state.messages[0];query=query.or(`created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`);}
    const r=!older&&state.messages.length?{data:await rows('erp_mensagens',q=>q.eq('conversa_id',id).gte('created_at',state.messages.at(-1).created_at).order('created_at').order('id')),error:null}:await query;
    if(r.error)throw r.error;if(state.chat!==id||!el.isConnected)return;
    const merged=new Map(state.messages.map(m=>[m.id,m]));r.data.forEach(m=>merged.set(m.id,m));
    const next=[...merged.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
    if(!older&&el.childElementCount&&next.length===state.messages.length&&next.every((m,i)=>m.id===state.messages[i].id))return;
    const nearBottom=el.scrollHeight-el.scrollTop-el.clientHeight<80,previousHeight=el.scrollHeight;state.messages=next;
    el.innerHTML=state.messages.map(m=>`<article class="collab-message ${m.autor_id===me().id?'mine':''}"><b>${esc(userName(m.autor_id))}</b><p>${esc(m.texto)}</p>${m.arquivo_path?`<button class="btn secondary" data-chat-file="${m.id}">📎 ${esc(m.arquivo_nome||'Arquivo')}</button>`:''}${m.evento_id?`<button class="btn secondary" data-event="${m.evento_id}">📅 Abrir convite de evento</button>`:''}<small>${stamp(m.created_at)}</small></article>`).join('')||'<p>Nenhuma mensagem ainda.</p>';
    bind('[data-event]',b=>eventDetail(b.dataset.event),el);bind('[data-chat-file]',async b=>{const m=state.messages.find(x=>x.id===b.dataset.chatFile);const r=await sb().storage.from('erp-chat').createSignedUrl(m.arquivo_path,60,{download:m.arquivo_nome});if(r.error)throw r.error;const a=document.createElement('a');a.href=r.data.signedUrl;a.target='_blank';a.rel='noopener';a.click();},el);
    if(older)el.scrollTop+=el.scrollHeight-previousHeight;else if(nearBottom||previousHeight===0)el.scrollTop=el.scrollHeight;
    const more=$('#collabOlder');if(more)more.hidden=r.data.length<100&&older;
  }
  let pendingUpload=null;
  async function sendMessage(id){
    const input=$('#collabText'),fileInput=$('#collabFile'),file=fileInput.files[0],texto=input.value.trim();
    if(!texto&&!file)return;if(file?.size>20*1024*1024)throw new Error('O arquivo excede 20 MB.');
    let path=null;
    if(file){
      if(pendingUpload?.file===file&&pendingUpload.chat===id)path=pendingUpload.path;
      else{path=`${id}/${me().id}/${crypto.randomUUID()}`;const r=await sb().storage.from('erp-chat').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(r.error)throw r.error;pendingUpload={file,chat:id,path};}
    }
    await action('mensagem',{conversa_id:id,texto,arquivo_path:path,arquivo_nome:file?.name});pendingUpload=null;
    input.value='';fileInput.value='';await updateMessages();$('#collabMessages')?.scrollTo(0,$('#collabMessages').scrollHeight);
  }
  async function deletionRequests(){
    const requests=await rows('erp_exclusoes_chat',q=>q.eq('status','pendente').order('created_at'));
    dialog('Solicitações de exclusão',`<div class="collab-list">${requests.map(r=>`<article class="collab-notice"><b>${esc(userName(r.solicitado_por))}</b><p>${esc(r.motivo)}</p><small>${stamp(r.created_at)} · Conversa ${esc(r.conversa_id)}</small><div class="collab-actions"><button class="btn secondary" data-request="${r.id}" data-decision="aprovado">Aprovar exclusão</button><button class="btn secondary" data-request="${r.id}" data-decision="rejeitado">Rejeitar</button></div></article>`).join('')||'<p>Nenhuma solicitação pendente.</p>'}</div>`);
    bind('[data-request]',async b=>{if(b.dataset.decision==='aprovado'&&!confirm('Aprovar a exclusão desta conversa para todos os participantes?'))return;await action('decidir_exclusao',{id:b.dataset.request,status:b.dataset.decision});await loadChats();if(state.page==='chat')renderChat();await deletionRequests();await refreshNotifications();});
  }
  async function history(type,id){
    await loadReference();const list=await rows('erp_colaboracao_historico',q=>q.eq('entidade_tipo',type).eq('entidade_id',id).order('created_at',{ascending:false}));
    dialog('Histórico de calendário e chat',`<div class="collab-actions"><button class="btn secondary" id="collabLinkedEvent">+ Evento associado</button></div><div class="collab-list">${list.map(h=>`<article class="collab-history-row"><p>${esc(h.descricao)}</p><small>${esc(userName(h.autor_id))} · ${stamp(h.created_at)}</small><div class="collab-actions">${h.evento_id?`<button class="btn secondary" data-event="${h.evento_id}">Abrir evento</button>`:''}${h.conversa_id?`<button class="btn secondary" data-history-chat="${h.conversa_id}">Abrir grupo</button>`:''}</div></article>`).join('')||'<p>Nenhum evento ou grupo registrado.</p>'}</div>`);
    bind('#collabLinkedEvent',()=>eventForm({link:`${type}:${id}`}));bind('[data-event]',b=>eventDetail(b.dataset.event));bind('[data-history-chat]',async b=>{closeDialog();state.chat=b.dataset.historyChat;await openPage('chat');if(!state.chat)showError(new Error('Grupo excluído ou acesso restrito aos participantes.'));});
  }
  function attachHistory(root,type,id){if(!root||!id||root.querySelector(`.collab-history-button[data-entity-id="${id}"]`))return;const b=document.createElement('button');b.type='button';b.className='btn secondary collab-history-button';b.dataset.entityId=id;b.textContent='Calendário e chat · Histórico';b.onclick=e=>{e.preventDefault();e.stopPropagation();run(()=>history(type,id),b);};root.appendChild(b);}
  function reconcile(){
    const nav=$('.nav'),user=me();if(!nav||!user){state.userId=null;state.page=null;state.notifications=[];state.messages=[];state.chats=[];chatSeen.clear();chatPrimed=false;$('#collabChatPopup')?.remove();pendingUpload=null;closeDialog();return;}
    if(!nav.querySelector('[data-collab-page]')){
      for(const [page,label] of [['calendario','Calendário'],['chat','Chat']]){const b=document.createElement('button');b.dataset.collabPage=page;b.textContent=label;b.onclick=()=>run(()=>openPage(page));if(page==='calendario')nav.insertBefore(b,nav.querySelector('[data-view="plans"]')||nav.firstChild);else nav.insertBefore(b,nav.querySelector('[data-view="users"]')||null);}
      nav.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('[data-collab-page]'))state.page=null;},true);
    }
    if(!$('#collabBell')){const b=document.createElement('button');b.id='collabBell';b.className='btn secondary collab-bell';b.setAttribute('aria-label','Notificações');b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span id="collabUnread" class="collab-count" hidden>0</span>';b.onclick=()=>run(notifications);$('.topbar').appendChild(b);}
    if(state.userId!==user.id&&!loading){state.userId=user.id;chatSeen.clear();chatPrimed=false;loading=true;checkChatMessages().catch(e=>console.warn('Chat:',errorMessage(e)));refreshNotifications().catch(e=>{console.warn('Notificações:',errorMessage(e));}).finally(()=>{loading=false;});}
    $$('[data-plan-card-id]').forEach(c=>attachHistory(c,'plano',c.dataset.planCardId));
    $$('[data-collab-entity-type]').forEach(c=>attachHistory(c,c.dataset.collabEntityType,c.dataset.collabEntityId));
    const core=window.ERPCoreNavigation;if(core?.currentView==='projects'&&core.currentProjectId&&!state.page)attachHistory($('#content'),'projeto',core.currentProjectId);
  }
  let queued=false;new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;reconcile();});}}).observe(document.documentElement,{childList:true,subtree:true});
  setInterval(async()=>{if(refreshBusy||!me()||!$('.topbar')||document.hidden)return;refreshBusy=true;try{await refreshNotifications();await checkChatMessages();if(state.page==='chat'){const previous=state.chat,oldIds=state.chats.map(c=>c.id).join();await loadChats();if(previous&&!state.chat)renderChat();else{if(oldIds!==state.chats.map(c=>c.id).join()){const sidebar=$('.collab-chat-sidebar');if(sidebar){sidebar.innerHTML=state.chats.filter(c=>c.tipo===state.tab).map(c=>`<button class="collab-conversation ${c.id===state.chat?'selected':''}" data-chat="${c.id}">${esc(chatTitle(c))}</button>`).join('');bind('[data-chat]',b=>{state.chat=b.dataset.chat;renderChat();},sidebar);}}await updateMessages();}}}catch(e){if(state.page==='chat')showError(e,$('.collab-chat-body'));}finally{refreshBusy=false;}},10000);
  window.addEventListener('erp-bridge-ready',reconcile);
  window.ERPCollaboration={open:openPage,history,eventDetail,togglePersonal,bindPersonalButton};reconcile();
})();

