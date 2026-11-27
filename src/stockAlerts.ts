import {stockRows,stockKey,type WarehouseData,type StockRow,type DemandProject} from './warehouse'
import {netIssued,reserved,roundStock} from './stockMovement'
import {priceValue} from './objectCost'
import type {CatalogItem} from './pricing'
import type {Consumable} from './consumables'

export function minimumFor(data:WarehouseData,key:string):number|null{return priceValue(data.minimums?.[key])}
export function setMinimum(data:WarehouseData,row:StockRow,value:string):WarehouseData{
 const n=priceValue(value);if(value!==''&&(n===null||n>1e9||(row.unit==='шт.'&&!Number.isSafeInteger(n))))return data
 const minimums={...data.minimums};if(value===''||n===0)delete minimums[row.key];else minimums[row.key]=String(n)
 return {...data,minimums}
}
export function minimumAlert(data:WarehouseData,row:StockRow){
 const minimum=minimumFor(data,row.key);if(row.excluded||minimum===null||minimum<=0)return null
 return {minimum,missing:row.free===null?null:roundStock(Math.max(0,minimum-row.free)),afterIncoming:row.free===null?null:roundStock(Math.max(0,minimum-row.free-row.incoming))}
}
const priority=(p:DemandProject)=>p.status==='В роботі'?0:p.status==='Завдаток отримано'?1:2
export function stockAlerts(catalog:CatalogItem[],rules:Consumable[],data:WarehouseData,projects:DemandProject[]){
 const rows=stockRows(catalog,rules,data,projects,'all').filter(r=>!r.excluded),byKey=new Map(rows.map(r=>[r.key,r])),free=new Map(rows.map(r=>[r.key,r.free])),incoming=new Map(rows.map(r=>[r.key,r.incoming]))
 const ordered=[...projects].sort((a,b)=>priority(a)-priority(b)||(a.date||'9999').localeCompare(b.date||'9999')||a.id.localeCompare(b.id))
 const objects=ordered.map(p=>{
  const needs=new Map<string,number>();for(const n of p.needs){if(Number.isFinite(n.quantity)&&n.quantity>0){const k=stockKey(n);needs.set(k,(needs.get(k)||0)+n.quantity)}}
  const shortages=[] as {row:StockRow;needed:number;physical:number|null;toBuy:number|null;inTransit:number}[]
  for(const [key,quantity] of needs){const row=byKey.get(key);if(!row)continue
   const needed=roundStock(Math.max(0,quantity-netIssued(data,key,p.id)));if(!needed)continue
   const own=Math.min(needed,reserved(data,key,p.id)),uncovered=roundStock(Math.max(0,needed-own)),available=free.get(key)??null
   if(available===null){shortages.push({row,needed,physical:null,toBuy:null,inTransit:0});continue}
   const take=Math.min(available,uncovered);free.set(key,roundStock(available-take));const physical=roundStock(uncovered-take)
   if(physical<=0)continue
   const inTransit=Math.min(physical,incoming.get(key)||0);incoming.set(key,roundStock((incoming.get(key)||0)-inTransit))
   shortages.push({row,needed,physical,toBuy:roundStock(physical-inTransit),inTransit})
  }
  return {project:p,shortages}
 }).filter(p=>p.shortages.length||p.project.warnings.length)
 const low=rows.flatMap(row=>{const a=minimumAlert(data,row);return a&&(a.missing===null||a.missing>0)?[{row,...a}]:[]})
 const red=objects.filter(o=>o.shortages.some(s=>s.physical!==null&&s.physical>0)).length
 const unknown=objects.filter(o=>o.project.warnings.length||o.shortages.some(s=>s.physical===null)).length
 return {objects,low,red,unknown}
}
