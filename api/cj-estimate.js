// Administrator: accurate CJ product variant + single-line freight quote to US.
import {requireUser,fail} from './_lib/admin.js';
import {cj,freight,parseVariants,money} from './_lib/cj.js';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 res.setHeader('Cache-Control','no-store');
 try{
  await requireUser(req,true);
  const {pid,vid,zip='40403',origin='CN'}=req.body||{};
  if(!/^[\w-]{8,200}$/.test(String(pid||''))||!/^[\w-]{8,200}$/.test(String(vid||'')))return res.status(400).json({error:'Choose a product variant'});
  if(!/^\d{5}$/.test(String(zip)))return res.status(400).json({error:'Enter a five-digit US ZIP'});
  if(!['CN','US'].includes(origin))return res.status(400).json({error:'Choose China or US warehouse origin'});
  const variants=parseVariants(await cj('/product/variant/query',{pid}));
  const v=variants.find(v=>v.vid===vid);if(!v)throw Error('Selected variant is unavailable or has no verified price');
  const methods=await freight([{vid,qty:1}],String(zip),origin);
  const supplier=v.cost,shipping=methods[0].price,landed=money(supplier+shipping);
  return res.status(200).json({variant:v,methods,supplier,shipping,landed,suggested:money(landed*2.5),origin,zip,quotedAt:new Date().toISOString(),note:'Suggested retail price is 2.5× landed supplier cost; shipping is separately charged to customers at checkout. This may make the final customer price uncompetitive.'});
 }catch(e){return fail(res,e)}
}
