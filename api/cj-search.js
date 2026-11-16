import {requireUser,fail} from './_lib/admin.js';
import {cj} from './_lib/cj.js';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 res.setHeader('Cache-Control','no-store');
 try{
  await requireUser(req,true);
  const keyword=String(req.query.keyword||'').trim().slice(0,75);
  if(keyword.length<2)return res.status(400).json({error:'Enter 2 or more characters'});
  const data=await cj('/product/listV2',{page:'1',size:'15',keyWord:keyword});
  const groups=Array.isArray(data?.content)?data.content:[];
  const list=groups.flatMap(g=>Array.isArray(g.productList)?g.productList:[]);
  const items=list.map(p=>({pid:String(p.id||p.pid||''),sku:String(p.sku||p.productSku||''),name:p.nameEn||p.productNameEn||'Unnamed item',image:p.bigImage||p.productImage||'',supplierPrice:p.sellPrice||'',category:p.threeCategoryName||''})).filter(x=>x.pid);
  return res.status(200).json({items,warning:'These are catalog prices. Select a variant and request verified freight before publishing.'});
 }catch(e){return fail(res,e)}
}
