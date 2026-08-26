from pathlib import Path
p=Path('ERP-INTEGRAL-4.0-SUPABASE-MIGRADO/public/app.js')
s=p.read_text()
old="""      const temp=window.supabase.createClient(SB_CONFIG.url,SB_CONFIG.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const signup=await temp.auth.signUp({email,password:fd.get('password'),options:{data:{nome:profile.nome,cpf:profile.cpf||'',tipo:profile.tipo,setor:profile.setor}}});
      if(signup.error){status.textContent='';alert(`Não foi possível criar o usuário: ${signup.error.message}`);return;}
      const newId=signup.data.user?.id;if(!newId){status.textContent='';alert('O Supabase não retornou o identificador do usuário.');return;}
      await new Promise(r=>setTimeout(r,500));
      const pr=await sb.from('profiles').update(profile).eq('id',newId).select().maybeSingle();
      if(pr.error){status.textContent='';alert(`Usuário criado, mas o perfil não pôde ser atualizado: ${pr.error.message}`);return;}"""
new="""      const {data:{session}}=await sb.auth.getSession();
      if(!session?.access_token){status.textContent='';alert('Sua sessão expirou. Entre novamente no ERP.');return;}
      const createR=await fetch('/api/admin-user-create',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({email,password:fd.get('password'),nome:profile.nome,cpf:profile.cpf||'',tipo:profile.tipo,setor:profile.setor})});
      const createData=await createR.json().catch(()=>({}));
      if(!createR.ok){status.textContent='';alert(`Não foi possível criar o usuário: ${createData.error||'erro desconhecido'}`);return;}
      const newId=createData.userId;if(!newId){status.textContent='';alert('O servidor não retornou o identificador do usuário.');return;}"""
assert old in s, 'trecho de cadastro via signUp nao encontrado'
s=s.replace(old,new,1)
p.write_text(s)
