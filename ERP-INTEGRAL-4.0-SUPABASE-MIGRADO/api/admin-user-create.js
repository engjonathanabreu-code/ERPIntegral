import { getAdminContext, requireAdmin } from './_supabase-admin.js';

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
  const ctx=getAdminContext();
  if(!ctx)return res.status(500).json({ok:false,error:'SUPABASE_ADMIN_NOT_CONFIGURED'});
  try{
    const access=await requireAdmin(req,ctx);
    if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});

    const {email,password,nome,cpf,tipo,setor}=req.body||{};
    const cleanEmail=String(email||'').trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(cleanEmail))return res.status(400).json({ok:false,error:'INVALID_EMAIL'});
    if(typeof password!=='string'||password.length<8)return res.status(400).json({ok:false,error:'INVALID_PASSWORD'});
    if(!String(nome||'').trim()||!String(tipo||'').trim())return res.status(400).json({ok:false,error:'INVALID_DATA'});

    const {data:createData,error:createError}=await ctx.admin.auth.admin.createUser({
      email:cleanEmail,
      password,
      email_confirm:true,
      user_metadata:{nome:String(nome).trim(),cpf:String(cpf||'').trim(),tipo:String(tipo).trim(),setor:String(setor||tipo).trim()}
    });
    if(createError)return res.status(createError.status||400).json({ok:false,error:createError.message||'AUTH_CREATE_FAILED'});
    const userId=createData?.user?.id;
    if(!userId)return res.status(500).json({ok:false,error:'AUTH_USER_ID_MISSING'});

    const profilePayload={id:userId,nome:String(nome).trim(),cpf:String(cpf||'').trim()||null,email:cleanEmail,tipo:String(tipo).trim(),setor:String(setor||tipo).trim(),ativo:true};
    const {data:profile,error:profileError}=await ctx.admin.from('profiles').upsert(profilePayload,{onConflict:'id'}).select().single();
    if(profileError){
      await ctx.admin.auth.admin.deleteUser(userId).catch(()=>{});
      return res.status(400).json({ok:false,error:profileError.message||'PROFILE_CREATE_FAILED'});
    }
    return res.status(200).json({ok:true,userId,profile});
  }catch(e){
    console.error('admin-user-create',e);
    return res.status(500).json({ok:false,error:'INTERNAL_ERROR'});
  }
}
