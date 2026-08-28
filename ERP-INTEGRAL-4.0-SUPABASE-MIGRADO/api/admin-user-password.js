import { getAdminContext, requireAdmin } from './_supabase-admin.js';

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
  const ctx=getAdminContext();
  if(!ctx)return res.status(500).json({ok:false,error:'SUPABASE_ADMIN_NOT_CONFIGURED'});
  try{
    const access=await requireAdmin(req,ctx);
    if(!access.ok)return res.status(access.status).json({ok:false,error:access.error});

    const {userId,password,email}=req.body||{};
    if(!userId)return res.status(400).json({ok:false,error:'INVALID_DATA'});
    if(password!=null&&(typeof password!=='string'||password.length<8))return res.status(400).json({ok:false,error:'INVALID_PASSWORD'});
    if(email!=null&&!/^\S+@\S+\.\S+$/.test(String(email)))return res.status(400).json({ok:false,error:'INVALID_EMAIL'});

    const changes={};
    if(password)changes.password=password;
    if(email)changes.email=String(email).trim().toLowerCase();
    if(!Object.keys(changes).length)return res.status(400).json({ok:false,error:'NO_CHANGES'});

    const {data,error}=await ctx.admin.auth.admin.updateUserById(userId,changes);
    if(error)return res.status(error.status||400).json({ok:false,error:error.message||'AUTH_UPDATE_FAILED'});
    return res.status(200).json({ok:true,userId:data?.user?.id||userId});
  }catch(e){
    console.error('admin-user-password',e);
    return res.status(500).json({ok:false,error:'INTERNAL_ERROR'});
  }
}
