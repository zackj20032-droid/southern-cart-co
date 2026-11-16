// Server-authoritative cart quote. NEVER trust browser prices, costs, SKUs or totals.
// Quotes are previews, not tax/payment authorization or guaranteed carrier charges.
import {requireUser,fail} from './_lib/admin.js';
import {cj,parseVariants,freight,money} from './_lib/cj.js';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 res.setHeader('Cache-Control','no-store');
 try{
  const {client}=await requireUser(req,false);
  const {items,zip,country='US'}=req.body||{};
  if(country!=='US'||!/^\d{5}$/.test(String(zip||'')))return res.status(400).json({error:'Currently quoting US five-digit ZIP codes only'});
  if(!Array.isArray(items)||items.length<1||items.length>20)return res.status(400).json({error:'Cart must contain 1–20 item lines'});
  if(items.some(i=>!i||typeof i.id!=='string'||!/^[0-9a-f-]{36}$/i.test(i.id)||!Number.isInteger(i.qty)||i.qty<1||i.qty>20))return res.status(400).json({error:'Invalid cart quantity or item'});
  const ids=[...new Set(items.map(i=>i.id))];
  if(ids.length!==items.length)return res.status(400).json({error:'Duplicate cart lines'});
  const {data:products,error:pe}=await client.from('products').select('id,name,price,active').in('id',ids);
  if(pe||!products||products.length!==ids.length||products.some(p=>!p.active))return res.status(409).json({error:'A product is unavailable. Refresh your cart.'});
  const {data:details,error:de}=await client.from('product_supplier_details').select('product_id,pid,vid,origin').in('product_id',ids);
  if(de||!details||details.length!==ids.length)return res.status(409).json({error:'A product lacks verified CJ variant mapping. Checkout unavailable.'});
  const verified=[];
  for(const i of items){
    const p=products.find(x=>x.id===i.id), d=details.find(x=>x.product_id===i.id);
    if(!d?.pid||!d?.vid||!['CN','US'].includes(d.origin))return res.status(409).json({error:`Missing verified variant/origin: ${p.name}`});
    const vs=parseVariants(await cj('/product/variant/query',{pid:d.pid}));
    const v=vs.find(v=>v.vid===d.vid);if(!v)throw Error(`CJ variant unavailable: ${p.name}`);
    verified.push({id:p.id,name:p.name,price:Number(p.price),qty:i.qty,vid:v.vid,supplier:v.cost,origin:d.origin});
  }
  const origins=[...new Set(verified.map(v=>v.origin))];let optionsByOrigin=[];
  for(const origin of origins){
    const group=verified.filter(v=>v.origin===origin);
    const methods=await freight(group.map(v=>({vid:v.vid,qty:v.qty})),String(zip),origin);
    optionsByOrigin.push({origin,methods});
  }
  const shipping=money(optionsByOrigin.reduce((sum,g)=>sum+g.methods[0].price,0));
  const subtotal=money(verified.reduce((s,v)=>s+v.qty*v.price,0));
  const supplier=money(verified.reduce((s,v)=>s+v.qty*v.supplier,0));
  const quote={items:verified.map(v=>({id:v.id,name:v.name,qty:v.qty,unitPrice:v.price})),subtotal,shipping,estimatedBeforeTax:money(subtotal+shipping),shippingGroups:optionsByOrigin.map(g=>({origin:g.origin,selected:g.methods[0],alternatives:g.methods})),quotedAt:new Date().toISOString(),zip,country,readyForPayment:false,taxStatus:'not_configured',message:'Pre-checkout estimate only. Payment disabled until destination-based tax, inventory and payment integrations are verified.'};
  // Supplier prices remain private, including on the public quotation response.
  return res.status(200).json(quote);
 }catch(e){return fail(res,e)}
}
