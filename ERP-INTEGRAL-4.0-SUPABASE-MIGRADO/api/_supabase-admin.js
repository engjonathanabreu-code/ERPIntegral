import { createClient } from '@supabase/supabase-js';

function normalizeRole(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
}

export function getAdminContext(){
  const url=process.env.ERP_SUPABASE_URL||process.env.SUPABASE_URL;
  const secret=process.env.ERP_SUPABASE_SECRET_KEY||process.env.SUPABASE_SECRET_KEY||process.env.ERP_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishable=process.env.ERP_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  if(!url||!secret) return null;
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const publicClient=createClient(url,publishable||secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  return {url,secret,publishable,admin,publicClient};
}

export async function requireAdmin(req,ctx){
  const auth=String(req.headers.authorization||'');
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token)return {ok:false,status:401,error:'UNAUTHORIZED'};

  const {data:userData,error:userError}=await ctx.publicClient.auth.getUser(token);
  if(userError||!userData?.user)return {ok:false,status:401,error:'INVALID_SESSION'};

  const {data:profile,error:profileError}=await ctx.admin
    .from('profiles')
    .select('tipo,ativo')
    .eq('id',userData.user.id)
    .maybeSingle();
  if(profileError){
    console.error('admin profile check',profileError);
    return {ok:false,status:500,error:'ADMIN_PROFILE_CHECK_FAILED'};
  }

  const role=normalizeRole(profile?.tipo);
  if(!profile||profile.ativo===false||!['administrador','admin'].includes(role)){
    return {ok:false,status:403,error:'ADMIN_REQUIRED'};
  }
  return {ok:true,user:userData.user,profile};
}
