import {type Consumable,type ConsumableNeed,type Quantities} from './consumables'
import {categoryOf,num,stockPlan,type CatalogItem,type PurchasePrices,type RoomPricing} from './pricing'
export type CostNeed={roomId:string;room:string;itemId:string;label:string;quantity:number;unit:string;priceUnit:string;field:keyof PurchasePrices;consumable?:boolean}
export type CostLine=CostNeed&{unitPrice:number|null;amount:number|null}
export type CostSnapshot={at:string;signature:string;lines:CostLine[]}
export type ObjectCosts={snapshot?:CostSnapshot;wages?:string;extra?:string;consumableQuantities?:Quantities}
export function priceValue(v:unknown):number|null {
 if(v==null||String(v).trim()==='')return null
 const n=Number(String(v).replace(',','.'));return Number.isFinite(n)&&n>=0?n:null
}
export function roomNeeds(roomId:string,room:string,p:RoomPricing,area:number,perimeter:number){
 const needs:CostNeed[]=[]
 const add=(v:CatalogItem,label:string,q:number,unit:string,field:keyof PurchasePrices='purchasePrice')=>{if(Number.isFinite(q)&&q>0)needs.push({roomId,room,itemId:v.id,label,quantity:Math.round(q*1e6)/1e6,unit,priceUnit:v.unit,field})}
 const stock=(v:CatalogItem,q:number)=>v.unit==='м'?stockPlan(q,v.stockLength||'').length:q
 const used=p.items.filter(s=>categoryOf(s.item)==='Профілі'&&s.item.unit==='м').reduce((n,s)=>n+num(s.quantity),0)
 const standard=Math.max(0,perimeter-used)
 if(p.fabric)add(p.fabric,p.fabric.name,area,'м²')
 add(p.standard,p.standard.name,stock(p.standard,standard),'м')
 if(standard>0)add(p.standard,`Кути — ${p.standard.name}`,num(p.standardCorners),'шт.','cornerPurchasePrice')
 add(p.insert,`${p.insert.name} (${p.insertColor==='black'?'чорна':'біла'})`,p.insertOverride===''?standard:Math.min(standard,num(p.insertOverride)),'м')
 for(const s of p.items){const v=s.item,q=num(s.quantity);if(!q)continue;const name=v.name+(categoryOf(v)==='Карнизи'?` (${s.color==='black'?'чорний':'білий'})`:'')
  add(v,name,stock(v,q),v.unit)
  add(v,`Кути — ${name}`,num(s.corners),'шт.','cornerPurchasePrice')
  add(v,`Блоки живлення — ${name}`,num(s.power),'шт.','powerPurchasePrice')
  add(v,`Магнітні решітки — ${name}`,num(s.grilles),'шт.','grillePurchasePrice')
 }
 return {needs,overrun:used>perimeter+1e-6}
}
export function consumableCostNeeds(roomId:string,room:string,items:ConsumableNeed[]):CostNeed[]{return items.filter(n=>n.quantity>0).map(n=>({roomId,room,itemId:n.rule.id,label:n.rule.name,quantity:n.quantity,unit:n.rule.unit,priceUnit:n.rule.unit,field:'purchasePrice',consumable:true}))}
export function costLines(needs:CostNeed[],catalog:CatalogItem[],rules:Consumable[]=[]):CostLine[]{
 return needs.map(n=>{const item=catalog.find(v=>v.id===n.itemId);const rule=n.consumable?rules.find(r=>r.id===n.itemId&&r.unit===n.unit):undefined;const unitPrice=n.consumable?priceValue(rule?.price):item&&item.unit===n.priceUnit&&(n.field!=='purchasePrice'||item.unit===n.unit)?priceValue(item[n.field]):null;return {...n,unitPrice,amount:unitPrice===null?null:Math.round(unitPrice*n.quantity*100)/100}})
}
export function costSignature(needs:CostNeed[]):string{
 return JSON.stringify(needs.map(n=>[n.roomId,n.room,n.itemId,n.field,n.label,n.quantity,n.unit,n.priceUnit]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))
}
export function summarizeCosts(lines:CostLine[],revenue:number,wages:unknown,extra:unknown,valid:boolean){
 const missing=lines.filter(l=>l.amount===null).length,known=Math.round(lines.reduce((n,l)=>n+(l.amount??0),0)*100)/100
 const labor=priceValue(wages),expenses=priceValue(extra),complete=valid&&lines.length>0&&missing===0
 const margin=complete?Math.round((revenue-known)*100)/100:null
 const profit=margin!==null&&labor!==null&&expenses!==null?Math.round((margin-labor-expenses)*100)/100:null
 return {missing,known,complete,margin,profit}
}
