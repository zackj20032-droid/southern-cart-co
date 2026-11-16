// Secure CJ API client. Never import this module in src/browser code.
const BASE='https://developers.cjdropshipping.com/api2.0/v1';
let cache={token:null,until:0};
async function jsonFetch(url, options={}){
 const ctrl=new AbortController(); const timeout=setTimeout(()=>ctrl.abort(),15000);
 try{
  const r=await fetch(url,{...options,signal:ctrl.signal});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data.result===false||data.success===false){const msg=data.message||`CJ error ${r.status}`;throw Error(String(msg).slice(0,220));}
  return data.data;
 }finally{clearTimeout(timeout)}
}
async function token(){
 if(cache.token&&Date.now()<cache.until)return cache.token;
 if(!process.env.CJ_API_KEY)throw Error('CJ_API_KEY is missing');
 const d=await jsonFetch(`${BASE}/authentication/getAccessToken`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:process.env.CJ_API_KEY})});
 if(!d?.accessToken)throw Error('CJ authentication returned no access token');
 cache={token:d.accessToken,until:Date.now()+60*60*1000};return cache.token;
}
export async function cj(path,params=null,body=null){
 const access=await token();let url=BASE+path;
 if(params)url+='?'+new URLSearchParams(params).toString();
 return jsonFetch(url,{method:body?'POST':'GET',headers:{'CJ-Access-Token':access,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
const price=x=>{const n=Number(x);return Number.isFinite(n)&&n>0?n:null};
export const money=x=>Math.round(Number(x)*100)/100;
export function parseVariants(data){
 const arr=Array.isArray(data)?data:Array.isArray(data?.list)?data.list:[];
 return arr.map(v=>({vid:String(v.vid||v.id||''),sku:String(v.variantSku||''),label:String(v.variantKey||v.variantNameEn||v.variantSku||'Variant'),image:v.variantImage||'',cost:price(v.variantSellPrice),weight:Number(v.variantWeight)||null})).filter(v=>v.vid&&v.cost!==null);
}
export async function freight(items,zip,origin){
 const data=await cj('/logistic/freightCalculate',null,{
  startCountryCode:origin,endCountryCode:'US',zip,
  products:items.map(x=>({vid:x.vid,quantity:x.qty}))
 });
 if(!Array.isArray(data))throw Error('CJ did not return shipping methods');
 const methods=data.map(x=>({name:String(x.logisticName||''),price:price(x.totalPostageFee??x.logisticPrice),days:String(x.logisticAging||'')})).filter(x=>x.name&&x.price!==null).sort((a,b)=>a.price-b.price);
 if(!methods.length)throw Error('No verified CJ shipping method available for this cart');
 return methods;
}
