import {requireUser,fail} from './_lib/admin.js';
import {cj,parseVariants} from './_lib/cj.js';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 res.setHeader('Cache-Control','no-store');
 try{
  await requireUser(req,true);const pid=String(req.query.pid||'').trim();
  if(!/^[\w-]{8,200}$/.test(pid))return res.status(400).json({error:'Valid CJ product ID required'});
  const variants=parseVariants(await cj('/product/variant/query',{pid}));
  if(!variants.length)return res.status(422).json({error:'CJ returned no usable variants or prices. Do not publish this item.'});
  return res.status(200).json({variants});
 }catch(e){return fail(res,e)}
}
