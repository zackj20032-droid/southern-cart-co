import {createClient} from '@supabase/supabase-js';
export function sb(){
 const {VITE_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY}=process.env;
 if(!VITE_SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)throw Error('Server Supabase configuration missing');
 return createClient(VITE_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function requireUser(req,admin=false){
 const jwt=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!jwt)throw Object.assign(Error('Please sign in first'),{status:401});
 const client=sb();const {data:{user},error}=await client.auth.getUser(jwt);
 if(error||!user)throw Object.assign(Error('Session expired. Sign in again'),{status:401});
 if(admin){const {data:role,error:err}=await client.from('staff_roles').select('role').eq('user_id',user.id).maybeSingle();
 if(err||role?.role!=='admin')throw Object.assign(Error('Administrator access required'),{status:403});}
 return {client,user};
}
export function fail(res,e){return res.status(e.status||502).json({error:String(e.message||'Supplier unavailable').slice(0,300)})}
