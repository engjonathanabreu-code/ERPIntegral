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
    const profile=Array.isArray(profiles)?profiles[0]:null;
    if(!profile||profile.ativo===false||profile.tipo!=='Administrador')return res.status(403).json({ok:false,error:'ADMIN_REQUIRED'});
    const {userId,password,email}=req.body||{};
    if(!userId)return res.status(400).json({ok:false,error:'INVALID_DATA'});
    if(password!=null&&(typeof password!=='string'||password.length<8))return res.status(400).json({ok:false,error:'INVALID_PASSWORD'});
    if(email!=null&&!/^\S+@\S+\.\S+$/.test(String(email)))return res.status(400).json({ok:false,error:'INVALID_EMAIL'});
    const changes={};if(password)changes.password=password;if(email)changes.email=String(email).trim().toLowerCase();
    if(!Object.keys(changes).length)return res.status(400).json({ok:false,error:'NO_CHANGES'});
    const update=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,{method:'PUT',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify(changes)});
    const data=await update.json().catch(()=>({}));
    if(!update.ok)return res.status(update.status).json({ok:false,error:data?.msg||data?.message||'AUTH_UPDATE_FAILED'});
    return res.status(200).json({ok:true,userId});
  }catch(e){console.error('admin-user-password',e);return res.status(500).json({ok:false,error:'INTERNAL_ERROR'});}
}
