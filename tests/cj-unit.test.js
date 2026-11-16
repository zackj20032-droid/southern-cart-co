import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVariants,freight} from '../api/_lib/cj.js';
const response=(obj)=>({ok:true,json:async()=>obj});
test('CJ variant parsing picks concrete variant prices and rejects missing prices',()=>{
 const variants=parseVariants([{vid:'v1',variantSku:'S-XL',variantKey:'Blue-XL',variantSellPrice:6.93},{vid:'v2',variantSellPrice:0}]);
 assert.equal(variants.length,1);assert.equal(variants[0].cost,6.93);assert.equal(variants[0].label,'Blue-XL');
});
test('CJ freight submits multi-variant quantities as a single combined quote and chooses cheapest valid option',async()=>{
 process.env.CJ_API_KEY='test-key';
 let posted=null;
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('getAccessToken'))return response({result:true,data:{accessToken:'fake-token'}});
  posted=JSON.parse(options.body);
  return response({result:true,data:[{logisticName:'Fast',logisticPrice:9.55,logisticAging:'3-6'},{logisticName:'Regular',logisticPrice:6.2,logisticAging:'5-10'}]});
 };
 const methods=await freight([{vid:'one',qty:2},{vid:'two',qty:1}],'40403','CN');
 assert.equal(posted.products.length,2);assert.equal(posted.products[0].quantity,2);
 assert.equal(posted.zip,'40403');assert.equal(methods[0].price,6.2);
});
test('missing / zero shipping fails closed',async()=>{
 globalThis.fetch=async()=>response({result:true,data:[{logisticName:'Unknown',logisticPrice:0}]});
 await assert.rejects(()=>freight([{vid:'one',qty:1}],'40403','CN'),/No verified CJ shipping/);
});
