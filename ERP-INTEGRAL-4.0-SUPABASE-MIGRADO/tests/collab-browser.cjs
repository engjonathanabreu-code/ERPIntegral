const {chromium}=require('playwright');
const fs=require('fs');const path=require('path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../public');
async function main(){
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',pid='33333333-3333-4333-8333-333333333333';
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const data={profiles:[{id,nome:'Admin de teste',tipo:'Administrador',ativo:true},{id:other,nome:'Ana de teste',tipo:'Projetos',ativo:true}],projetos:[{id:pid,nome:'Projeto de teste',tipo_servico:'OUTROS',status:'Em andamento',created_at:day}],planos_trabalho:[],erp_agendas:[],erp_eventos:[],erp_prazos:[{chave:'projeto:'+pid,entidade_tipo:'projeto',entidade_id:pid,titulo:'Projeto de teste',inicio:day.slice(0,8)+'01',fim:day.slice(0,8)+'28',participantes:[id]}],erp_cores_prazos:[],erp_agenda_pessoal:[],erp_evento_respostas:[],erp_conversas:[],erp_mensagens:[],erp_exclusoes_chat:[],erp_colaboracao_historico:[]};
  window.__fixture=data;window.__calls=[];
  function query(table){let filters=[],single=false,start=0,end=Infinity,order=null;const q={select(){return q},eq(k,v){filters.push(x=>x[k]===v);return q},gt(){return q},gte(){return q},lt(){return q},or(){return q},order(k,o){order={k,o};return q},range(a,b){start=a;end=b;return q},limit(n){end=n-1;return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve){let values=(data[table]||[]).filter(x=>filters.every(f=>f(x))).slice(start,end+1);if(order)values.sort((a,b)=>String(a[order.k]||'').localeCompare(String(b[order.k]||''))*(order.o?.ascending===false?-1:1));resolve({data:single?values[0]||null:values,error:null});}};return q;}
  const client={from:query,auth:{getSession:async()=>({data:{session:{user:{id,email:'test@example.invalid'}}}}),getUser:async()=>({data:{user:{id}}}),signOut:async()=>({})},storage:{from:()=>({upload:async()=>({data:{},error:null}),createSignedUrl:async()=>({data:{signedUrl:'https://erp.test/file'},error:null})})},rpc:async(name,args)=>{
   if(name==='erp_collab_directory')return {data:data.profiles,error:null};
   if(name==='erp_collab_notifications')return {data:[{chave:'vinculo:projeto:'+pid,titulo:'Você está vinculado: Projeto de teste',tipo:'vinculo',entidade_tipo:'projeto',entidade_id:pid,prazo:day,lida:false}],error:null};
   const {op,p}=args;window.__calls.push({op,p});const nid=crypto.randomUUID();
   if(op==='agenda')data.erp_agendas.push({id:nid,nome:p.nome});
   if(op==='evento'){data.erp_eventos.push({...p,id:nid,serie_id:nid,status:'ativo',created_by:id,participantes:[...new Set([id,...p.participantes])],cor:'#197864'});return {data:{id:nid,ids:[nid]},error:null};}
   if(op==='conversa')data.erp_conversas.push({...p,id:nid,created_by:id,created_at:new Date().toISOString(),participantes:[id,...p.participantes]});
   if(op==='mensagem')data.erp_mensagens.push({...p,id:nid,autor_id:id,created_at:new Date().toISOString()});
   if(op==='pessoal')data.erp_agenda_pessoal.push({usuario_id:id,chave:p.chave});
   return {data:{id:nid},error:null};
  }};
  window.supabase={createClient:()=>client};
 });
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='erp.test')return route.fulfill({body:'',contentType:'application/javascript'});
  let file=path.join(root,u.pathname==='/'?'index.html':u.pathname.slice(1));
  if(!file.startsWith(root))return route.abort();
  if(!fs.existsSync(file))return route.fulfill({body:'',contentType:'image/png'});
  await route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html'});
 });
 await page.goto('https://erp.test/');
 await page.locator('[data-collab-page=calendario]').waitFor();
 const nav=await page.locator('.nav button').allTextContents();assert(nav.indexOf('Calendário')<nav.indexOf('Planos de trabalho'));
 await page.locator('[data-collab-page=calendario]').click();await page.locator('.collab-calendar').waitFor();
 assert.equal(await page.locator('.collab-day:not(.empty)').count(),new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate());
 await page.locator('#collabMode').selectOption('quinzenal');await page.waitForFunction(()=>document.querySelectorAll('.collab-day:not(.empty)').length<=16);
 await page.locator('#collabMode').selectOption('trimestral');await page.waitForFunction(()=>document.querySelectorAll('.collab-day:not(.empty)').length>=90);
 await page.locator('#collabMode').selectOption('mensal');
 await page.locator('#collabNewAgenda').click();await page.locator('[name=nome]').fill('Carro de teste');await page.locator('#collabModal button[type=submit]').click();await page.locator('#collabModal').waitFor({state:'detached'});
 await page.locator('#collabNewEvent').click();await page.locator('[name=titulo]').fill('Visita técnica');await page.locator('[name=participantes]').selectOption('22222222-2222-4222-8222-222222222222');await page.locator('#collabModal button[type=submit]').click();await page.locator('#collabModal').waitFor({state:'detached'});
 await page.locator('[data-event]').first().waitFor();
 await page.screenshot({path:path.resolve(__dirname,'../../../../outputs/calendario-preview.png'),fullPage:false});
 await page.locator('#collabBell').click();await page.locator('[data-personal-notice]').click();assert.equal(await page.locator('[data-personal-notice]').textContent(),'Adicionado');await page.locator('#collabClose').click();
 await page.locator('[data-collab-page=chat]').click();await page.locator('#collabNewChat').click();await page.locator('[name=participantes]').selectOption('22222222-2222-4222-8222-222222222222');await page.locator('#collabModal button[type=submit]').click();await page.locator('#collabComposer').waitFor();
 await page.locator('#collabText').fill('<script>não executar</script>');await page.locator('[data-emoji]').first().click();await page.locator('#collabComposer button[type=submit]').click();await page.locator('.collab-message').waitFor();assert((await page.locator('.collab-message p').textContent()).includes('<script>não executar</script>😊'));assert.equal(await page.locator('.collab-message script').count(),0);
 await page.locator('#collabFile').setInputFiles({name:'teste.txt',mimeType:'text/plain',buffer:Buffer.from('Arquivo de teste')});await page.locator('#collabComposer button[type=submit]').click();await page.locator('[data-chat-file]').waitFor();
 await page.locator('#collabChatEvent').click();await page.locator('[name=titulo]').fill('Reunião pelo chat');await page.locator('#collabModal button[type=submit]').click();await page.locator('.collab-messages [data-event]').waitFor();
 await page.screenshot({path:path.resolve(__dirname,'../../../../outputs/chat-preview.png'),fullPage:false});
 await page.locator('[data-chat-tab=grupo]').click();await page.locator('#collabNewChat').click();await page.locator('[name=titulo]').fill('Equipe do projeto');await page.locator('[name=participantes]').selectOption('22222222-2222-4222-8222-222222222222');await page.locator('[name=vinculo]').selectOption('projeto:33333333-3333-4333-8333-333333333333');await page.locator('#collabModal button[type=submit]').click();await page.locator('#collabChatLink').waitFor();
 await page.locator('[data-view=projects]').click();await page.locator('[data-open-project]').first().click();await page.locator('.collab-history-button').waitFor();
 assert.equal(await page.locator('#pageTitle').textContent(),'Detalhes do projeto');
 await page.setViewportSize({width:390,height:844});await page.locator('[data-collab-page=chat]').click();await page.locator('.collab-chat').waitFor();
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: calendário, períodos, ativo, evento, notificação, chat, emoji, arquivo, convite, navegação legada, histórico e viewport móvel.');
 await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1)});

