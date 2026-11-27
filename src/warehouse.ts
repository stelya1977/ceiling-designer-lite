import type {CostNeed} from './objectCost'
import {priceValue} from './objectCost'
import type {CatalogItem} from './pricing'
import type {Consumable} from './consumables'
import type {Supplier,Offer} from './procurement'
import {reserved,netIssued,type Reservation,type Movement} from './stockMovement'

export type StockEntry={key:string;label:string;unit:string;quantity:string;itemId?:string;field?:CostNeed['field'];consumable?:boolean;priceUnit?:string;manual?:boolean;excluded?:boolean}
export type WarehouseData={entries:StockEntry[];suppliers?:Supplier[];offers?:Offer[];reservations?:Reservation[];movements?:Movement[]}
export type DemandProject={id:string;label:string;status:string;needs:CostNeed[];warnings:string[]}
export type StockRow=StockEntry&{needed:number;totalNeeded:number;onHand:number|null;shortage:number|null;totalShortage:number|null;unitPrice:number|null;reserved:number;ownReserved:number;free:number|null;planned:number;issued:number}
const round=(n:number)=>Math.round(n*1e6)/1e6
const variant=(n:CostNeed)=>n.consumable?'':(n.itemId==='decorative-insert'||n.itemId==='alutat-sk30'||/\((?:білий|чорний|біла|чорна)\)$/u.test(n.label))?(n.label.match(/\((білий|чорний|біла|чорна)\)$/u)?.[1]?.startsWith('біл')?'white':n.label.match(/\((чорний|чорна)\)$/u)?'black':'') : ''
export function stockKey(n:CostNeed){return JSON.stringify([n.consumable?'consumable':'catalog',n.itemId,n.field,n.unit,variant(n)])}
export function includesDemand(p:{status:string;archivedAt?:string;completedAt?:string;rooms:unknown[]}){return !p.archivedAt&&!p.completedAt&&!['Виконано','Відмовлено'].includes(p.status)&&p.rooms.length>0}
export function warehouseFromCatalog(catalog:CatalogItem[]):WarehouseData{
 const data=catalog.find(v=>v.id==='standard-profile')?.warehouse
 return {...data,entries:Array.isArray(data?.entries)?data.entries:[]}
}
function catalogNeeds(catalog:CatalogItem[],rules:Consumable[]):CostNeed[]{
 const result:CostNeed[]=[]
 const add=(v:CatalogItem,label:string,unit:string,field:CostNeed['field']='purchasePrice')=>result.push({roomId:'',room:'',itemId:v.id,label,quantity:0,unit,priceUnit:v.unit,field})
 for(const v of catalog){
  const colors=v.category==='Карнизи'?[' (білий)',' (чорний)']:v.id==='decorative-insert'?[' (біла)',' (чорна)']:['']
  for(const c of colors){const name=v.name+c;add(v,name,v.unit);if(v.cornerPurchasePrice?.trim()||Number(v.cornerPrice)>0)add(v,'Кути — '+name,'шт.','cornerPurchasePrice');if(v.powerPurchasePrice?.trim()||Number(v.powerPrice)>0)add(v,'Блоки живлення — '+name,'шт.','powerPurchasePrice');if(v.grillePurchasePrice?.trim()||Number(v.grillePrice)>0)add(v,'Магнітні решітки — '+name,'шт.','grillePurchasePrice')}
 }
 for(const r of rules)if(r.active)result.push({roomId:'',room:'',itemId:r.id,label:r.name,quantity:0,unit:r.unit,priceUnit:r.unit,field:'purchasePrice',consumable:true})
 return result
}
export function stockRows(catalog:CatalogItem[],rules:Consumable[],data:WarehouseData,projects:DemandProject[],selected:string):StockRow[]{
 const rows=new Map<string,StockEntry>();const total=new Map<string,number>(),need=new Map<string,number>(),planned=new Map<string,number>(),issued=new Map<string,number>(),covered=new Map<string,number>(),ownCovered=new Map<string,number>(),perProject=new Map<string,Map<string,number>>()
 for(const s of data.entries)rows.set(s.key,s)
 function register(n:CostNeed){const key=stockKey(n),old=rows.get(key);rows.set(key,{key,label:n.label,unit:n.unit,quantity:old?.quantity??'',excluded:old?.excluded,itemId:n.itemId,field:n.field,priceUnit:n.priceUnit,consumable:n.consumable});return key}
 for(const n of catalogNeeds(catalog,rules))register(n)
 for(const p of projects){const pNeeds=new Map<string,number>();for(const n of p.needs){if(!Number.isFinite(n.quantity)||n.quantity<=0)continue;const key=register(n);pNeeds.set(key,(pNeeds.get(key)||0)+n.quantity)}perProject.set(p.id,pNeeds)}
 for(const p of projects)for(const [key,q] of perProject.get(p.id)||[]){const out=netIssued(data,key,p.id),remaining=round(Math.max(0,q-out)),cover=Math.min(remaining,reserved(data,key,p.id));total.set(key,(total.get(key)||0)+remaining);covered.set(key,(covered.get(key)||0)+cover);if(selected==='all'||selected===p.id){need.set(key,(need.get(key)||0)+remaining);planned.set(key,(planned.get(key)||0)+q);issued.set(key,(issued.get(key)||0)+out);ownCovered.set(key,(ownCovered.get(key)||0)+cover)}}
 return [...rows.values()].map(s=>{
  const needed=round(need.get(s.key)||0),totalNeeded=round(total.get(s.key)||0),onHand=priceValue(s.quantity)
  const item=catalog.find(v=>v.id===s.itemId),rule=rules.find(v=>v.id===s.itemId&&v.unit===s.unit)
  const unitPrice=s.consumable?priceValue(rule?.price):item&&s.field&&item.unit===s.priceUnit?priceValue(item[s.field]):null
  const held=reserved(data,s.key),own=selected==='all'?held:reserved(data,s.key,selected),free=onHand===null?null:round(Math.max(0,onHand-held))
  return {...s,needed,totalNeeded,onHand,reserved:held,ownReserved:own,free,planned:round(planned.get(s.key)||0),issued:round(issued.get(s.key)||0),shortage:needed===0?0:free===null?null:round(Math.max(0,needed-(ownCovered.get(s.key)||0)-free)),totalShortage:totalNeeded===0?0:free===null?null:round(Math.max(0,totalNeeded-(covered.get(s.key)||0)-free)),unitPrice}
 }).sort((a,b)=>a.label.localeCompare(b.label,'uk')||a.unit.localeCompare(b.unit))
}
export function setStock(data:WarehouseData,entry:StockEntry,quantity:string):WarehouseData{
 const value=priceValue(quantity);if(quantity!==''&&(value===null||(entry.unit==='шт.'&&!Number.isInteger(value))))return data
 const {key,label,unit,itemId,field,consumable,priceUnit,manual,excluded}=entry
 const clean:StockEntry={key,label,unit,quantity:quantity===''?'':String(value),itemId,field,consumable,priceUnit,manual,excluded}
 return {...data,entries:[...data.entries.filter(e=>e.key!==key),clean]}
}
