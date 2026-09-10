const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const jwt=role=>'header.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';

async function server(env={},profile={tipo:'Administrador',ativo:true},userError=null){
  const clients=[],updates=[];
  const context=vm.createContext({Buffer,process:{env},console:{error(){}}});
  const sdk=new vm.SyntheticModule(['createClient'],function(){
    this.setExport('createClient',(url,key,options)=>{
      clients.push({url,key,options});
      return {
        auth:{
          getUser:async()=>({data:{user:{id:'admin-id'}},error:userError}),
          admin:{updateUserById:async(id,changes)=>{updates.push({id,changes});return {data:{user:{id}},error:null};}}
        },
        from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile,error:null})})})})
      };
    });
  },{context});
  const helper=new vm.SourceTextModule(fs.readFileSync(path.join(root,'api/_supabase-admin.js'),'utf8'),{context});
  await helper.link(()=>sdk);
  await helper.evaluate();
  const handler=new vm.SourceTextModule(fs.readFileSync(path.join(root,'api/admin-user-password.js'),'utf8'),{context});
  await handler.link(()=>helper);
  await handler.evaluate();
  return {
    clients,updates,getContext:()=>helper.namespace.getAdminContext(),
    async request(body={},authorization='Bearer test-session',method='POST'){
      const response={status(code){this.code=code;return this;},json(data){this.body=data;return this;}};
      await handler.namespace.default({method,headers:{authorization},body},response);
      return response;
    }
  };
}
const validEnv={ERP_SUPABASE_URL:'https://example.supabase.co',ERP_SUPABASE_SERVICE_ROLE_KEY:jwt('service_role')};

test('rejects public, anonymous, malformed and missing admin keys',async()=>{
  for(const key of ['sb_publishable_test',jwt('anon'),'invalid','']){
    const s=await server({...validEnv,ERP_SUPABASE_SERVICE_ROLE_KEY:key});
    assert.equal(s.getContext(),null);
    const r=await s.request({userId:'target',password:'NewPassword8'});
    assert.equal(r.code,500);
    assert.equal(r.body.error,'SUPABASE_ADMIN_NOT_CONFIGURED');
    assert.equal(s.updates.length,0);
  }
});
test('valid server key is not shadowed by a public key in another variable',async()=>{
  const s=await server({...validEnv,ERP_SUPABASE_SECRET_KEY:'sb_publishable_wrong'});
  assert.ok(s.getContext());
  assert.equal(s.clients[0].key,validEnv.ERP_SUPABASE_SERVICE_ROLE_KEY);
});
test('supports secret keys and trims configuration whitespace',async()=>{
  const s=await server({ERP_SUPABASE_URL:' https://example.supabase.co ',ERP_SUPABASE_SECRET_KEY:' sb_secret_test '});
  assert.ok(s.getContext());
  assert.equal(s.clients[0].key,'sb_secret_test');
  assert.equal(s.clients[0].url,'https://example.supabase.co');
});
test('missing or invalid sessions cannot change passwords',async()=>{
  const s=await server(validEnv);
  assert.equal((await s.request({userId:'target',password:'NewPassword8'},'')).code,401);
  assert.equal(s.updates.length,0);
  const invalid=await server(validEnv,undefined,{message:'expired'});
  assert.equal((await invalid.request({userId:'target',password:'NewPassword8'})).code,401);
  assert.equal(invalid.updates.length,0);
});
test('inactive admins and non-admin profiles are denied',async()=>{
  for(const profile of [{tipo:'Administrador',ativo:false},{tipo:'Comercial',ativo:true},null]){
    const s=await server(validEnv,profile);
    assert.equal((await s.request({userId:'target',password:'NewPassword8'})).code,403);
    assert.equal(s.updates.length,0);
  }
});
test('active administrator updates only the requested account and preserves password whitespace',async()=>{
  const s=await server(validEnv);
  const r=await s.request({userId:'target-id',password:' NewPassword8 '});
  assert.equal(r.code,200);
  assert.equal(r.body.ok,true);
  assert.equal(s.updates.length,1);
  assert.equal(s.updates[0].id,'target-id');
  assert.deepEqual(Object.keys(s.updates[0].changes),['password']);
  assert.equal(s.updates[0].changes.password,' NewPassword8 ');
});
test('short passwords and empty changes never reach Auth',async()=>{
  const s=await server(validEnv);
  assert.equal((await s.request({userId:'target',password:'short'})).code,400);
  assert.equal((await s.request({userId:'target'})).code,400);
  assert.equal(s.updates.length,0);
});

function frontend({session={access_token:'session'},reply,networkError}={}){
  const source=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
  const modalSource=source.slice(source.indexOf('function userModal('),source.indexOf('\nfunction openModal('));
  const status={textContent:''},button={disabled:false},form={},requests=[],profileWrites=[];
  const user={id:'target-id',email:'target@example.com'};
  const fields={cpf:'',email:user.email,name:'Test User',sector:'Projetos',type:'Projetos',active:'true',password:'NewPassword8'};
  const context=vm.createContext({
    $:s=>({'#userStatus':status,'#modalSave':button,'#userForm':form}[s]||null),
    openModal(){},userMetaHistoryHtml:async()=>'',
    esc:s=>s,fmtCpf:s=>s,cpfDigits:s=>s,normEmail:s=>s.toLowerCase(),
    USER_TYPES:['Projetos'],USER_SECTORS:['Projetos'],db:{users:[user]},
    FormData:class{get(key){return fields[key];}},
    sb:{auth:{getSession:async()=>({data:{session},error:null})},
      from:()=>({update:profile=>{profileWrites.push(profile);return {eq:()=>({select:()=>({single:async()=>({error:null})})})};}})},
    fetch:async(url,options)=>{requests.push({url,options});if(networkError)throw networkError;return reply;},
    alert:message=>{throw new Error(message);},cacheDB(){},closeModal(){},renderUsers(){}
  });
  vm.runInContext(modalSource,context);
  context.userModal(user);
  return {status,button,requests,profileWrites,submit:()=>form.onsubmit({preventDefault(){},target:form})};
}
test('server configuration failure stays visible and does not write the profile',async()=>{
  const ui=frontend({reply:{ok:false,json:async()=>({ok:false,error:'SUPABASE_ADMIN_NOT_CONFIGURED'})}});
  await ui.submit();
  assert.match(ui.status.textContent,/chave administrativa/);
  assert.equal(ui.button.disabled,false);
  assert.equal(ui.profileWrites.length,0);
});
test('network and non-JSON responses do not leave the form stuck saving',async()=>{
  for(const options of [{networkError:new Error('Network error')},{reply:{ok:false,json:async()=>{throw new Error('Unexpected HTML');}}}]){
    const ui=frontend(options);
    await ui.submit();
    assert.match(ui.status.textContent,/Não foi possível/);
    assert.equal(ui.button.disabled,false);
    assert.equal(ui.profileWrites.length,0);
  }
});
test('expired session is reported before making any request',async()=>{
  const ui=frontend({session:null});
  await ui.submit();
  assert.match(ui.status.textContent,/sessão expirou/);
  assert.equal(ui.requests.length,0);
});
test('successful password update sends target ID and then saves the profile',async()=>{
  const ui=frontend({reply:{ok:true,json:async()=>({ok:true,userId:'target-id'})}});
  await ui.submit();
  assert.equal(ui.requests.length,1);
  assert.equal(JSON.parse(ui.requests[0].options.body).userId,'target-id');
  assert.equal(ui.profileWrites.length,1);
});
