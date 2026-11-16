// Admin-only CJ catalog search. Never expose CJ API keys or wholesale prices publicly.
import {createClient} from '@supabase/supabase-js';
const BASE='https://developers.cjdropshipping.com/api2.0/v1';
let tokenCache={value:'',expires:0};
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!process.env.CJ_API_KEY||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.VITE_SUPABASE_URL)return res.status(503).json({error:'Admin CJ integration is not configured'});
 try{
  const jwt=(req.headers.authorization||'').replace(/^Bearer /i,'');
  if(!jwt)return res.status(401).json({error:'Sign in required'});
  const sb=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const {data:{user},error}=await sb.auth.getUser(jwt);
  if(error||!user)return res.status(401).json({error:'Invalid user'});
  const {data:role}=await sb.from('staff_roles').select('role').eq('user_id',user.id).maybeSingle();
  if(role?.role!=='admin')return res.status(403).json({error:'Admins only'});
  const term=String(req.query.keyword||'').trim().slice(0,100);
  if(term.length<2)return res.status(400).json({error:'Search term must have at least 2 characters'});
  if(Date.now()>tokenCache.expires){
   const t=await fetch(BASE+'/authentication/getAccessToken',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:process.env.CJ_API_KEY})});
   const j=await t.json();if(!t.ok||!j.data?.accessToken)throw Error('CJ authorization failed: '+(j.message||t.status));
   tokenCache={value:j.data.accessToken,expires:Date.now()+24*60*60*1000};
  }
  const url=new URL(BASE+'/product/listV2');url.searchParams.set('page','1');url.searchParams.set('size','15');url.searchParams.set('keyWord',term);
  const response=await fetch(url,{headers:{'CJ-Access-Token':tokenCache.value}});
  const j=await response.json();if(!response.ok||j.result===false)throw Error(j.message||'CJ search failed');
  const items=(j.data?.list||[]).map(p=>({pid:p.pid,sku:p.productSku,name:p.productNameEn,image:p.productImage,supplierPrice:p.sellPrice,category:p.categoryName}));
  return res.status(200).json({items,warning:'Supplier price is not total delivered cost. Check variants, US freight, compliance and packaging before publishing.'});
 }catch(e){return res.status(502).json({error:e.message||'Supplier unavailable'})}
}
