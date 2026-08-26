export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
  const url=process.env.ERP_SUPABASE_URL||process.env.SUPABASE_URL;
  const service=process.env.ERP_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishable=process.env.ERP_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  if(!url||!service)return res.status(500).json({ok:false,error:'SUPABASE_ADMIN_NOT_CONFIGURED'});
  const auth=String(req.headers.authorization||'');
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token)return res.status(401).json({ok:false,error:'UNAUTHORIZED'});
  try{
    const userR=await fetch(`${url}/auth/v1/user`,{headers:{apikey:publishable||service,Authorization:`Bearer ${token}`}});
    if(!userR.ok)return res.status(401).json({ok:false,error:'INVALID_SESSION'});
    const caller=await userR.json();
    const profileR=await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(caller.id)}&select=tipo,ativo`,{headers:{apikey:service,Authorization:`Bearer ${service}`}});
    const profiles=await profileR.json();
    const callerProfile=Array.isArray(profiles)?profiles[0]:null;
    if(!callerProfile||callerProfile.ativo===false||callerProfile.tipo!=='Administrador')return res.status(403).json({ok:false,error:'ADMIN_REQUIRED'});

    const {email,password,nome,cpf,tipo,setor}=req.body||{};
    const cleanEmail=String(email||'').trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(cleanEmail))return res.status(400).json({ok:false,error:'INVALID_EMAIL'});
    if(typeof password!=='string'||password.length<8)return res.status(400).json({ok:false,error:'INVALID_PASSWORD'});
    if(!String(nome||'').trim()||!String(tipo||'').trim())return res.status(400).json({ok:false,error:'INVALID_DATA'});

    const create=await fetch(`${url}/auth/v1/admin/users`,{
      method:'POST',
      headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        email:cleanEmail,
        password,
        email_confirm:true,
        user_metadata:{nome:String(nome).trim(),cpf:String(cpf||'').trim(),tipo:String(tipo).trim(),setor:String(setor||tipo).trim()}
      })
    });
    const data=await create.json().catch(()=>({}));
    if(!create.ok)return res.status(create.status).json({ok:false,error:data?.msg||data?.message||'AUTH_CREATE_FAILED'});
    const userId=data?.id||data?.user?.id;
    if(!userId)return res.status(500).json({ok:false,error:'AUTH_USER_ID_MISSING'});

    const profilePayload={id:userId,nome:String(nome).trim(),cpf:String(cpf||'').trim()||null,email:cleanEmail,tipo:String(tipo).trim(),setor:String(setor||tipo).trim(),ativo:true};
    const upsert=await fetch(`${url}/rest/v1/profiles?on_conflict=id`,{
      method:'POST',
      headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},
      body:JSON.stringify(profilePayload)
    });
    const profileData=await upsert.json().catch(()=>[]);
    if(!upsert.ok)return res.status(upsert.status).json({ok:false,error:profileData?.message||'PROFILE_CREATE_FAILED'});
    return res.status(200).json({ok:true,userId,profile:Array.isArray(profileData)?profileData[0]:profileData});
  }catch(e){console.error('admin-user-create',e);return res.status(500).json({ok:false,error:'INTERNAL_ERROR'});}
}
