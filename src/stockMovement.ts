import type {WarehouseData,StockEntry,StockRow} from './warehouse'
import {priceValue} from './objectCost'
export type Reservation={key:string;projectId:string;projectLabel:string;quantity:number}
export type MovementKind='receipt'|'issue'|'return'|'reserve'|'release'|'adjust'|'sale'|'writeoff'
export type Movement={id:string;at:string;kind:MovementKind;key:string;label:string;unit:string;quantity:number;projectId?:string;projectLabel?:string;price:number|null;sourceId?:string;salePrice?:number;note?:string;before?:number|null;after?:number|null}
export type Command={id:string;at:string;kind:Exclude<MovementKind,'adjust'>;row:StockEntry;quantity:number;projectId?:string;projectLabel?:string;price?:number|null;sourceId?:string;salePrice?:number;note?:string;remaining?:number;confirmed?:boolean}
export const roundStock=(n:number)=>Math.round(n*1e6)/1e6
export const movements=(d:WarehouseData):Movement[]=>Array.isArray(d.movements)?d.movements:[]
export const reservations=(d:WarehouseData):Reservation[]=>Array.isArray(d.reservations)?d.reservations:[]
export const reserved=(d:WarehouseData,key:string,projectId?:string)=>roundStock(reservations(d).filter(r=>r.key===key&&(!projectId||r.projectId===projectId)).reduce((s,r)=>s+r.quantity,0))
export const netIssued=(d:WarehouseData,key:string,projectId:string)=>roundStock(movements(d).filter(m=>m.key===key&&m.projectId===projectId).reduce((s,m)=>s+(m.kind==='issue'?m.quantity:m.kind==='return'?-m.quantity:0),0))
export const returnable=(d:WarehouseData,id:string)=>{const issue=movements(d).find(m=>m.id===id&&m.kind==='issue');return issue?roundStock(issue.quantity-movements(d).filter(m=>m.kind==='return'&&m.sourceId===id).reduce((s,m)=>s+m.quantity,0)):0}
export const movementLabels:Record<MovementKind,string>={receipt:'Надходження',issue:'Видача на об’єкт',return:'Повернення',reserve:'Резерв',release:'Зняття резерву',adjust:'Інвентаризація',sale:'Продаж зі складу',writeoff:'Списання'}
function put(d:WarehouseData,row:StockEntry,quantity:number|null):WarehouseData{const {key,label,unit,itemId,field,consumable,priceUnit,manual,excluded}=row;return {...d,entries:[...d.entries.filter(e=>e.key!==key),{key,label,unit,itemId,field,consumable,priceUnit,manual,excluded,quantity:quantity===null?'':String(quantity)}]}}
function changeReserve(d:WarehouseData,key:string,projectId:string,projectLabel:string,quantity:number):WarehouseData{return {...d,reservations:[...reservations(d).filter(r=>r.key!==key||r.projectId!==projectId),...(quantity>0?[{key,projectId,projectLabel,quantity}]:[])]}}
export function applyMovement(d:WarehouseData,c:Command):{data:WarehouseData;error?:string}{
 const fail=(error:string)=>({data:d,error});if(movements(d).some(m=>m.id===c.id))return {data:d}
 const row=d.entries.find(e=>e.key===c.row.key)||c.row, key=row.key,q=roundStock(c.quantity),pid=c.projectId||'',pl=c.projectLabel||pid
 const on=priceValue(row.quantity),own=reserved(d,key,pid),all=reserved(d,key),free=on===null?null:roundStock(on-all)
 if(!Number.isFinite(q)||q<=0||q>1e9||(row.unit==='шт.'&&!Number.isSafeInteger(q)))return fail('Введи коректну додатну кількість.')
 if(row.excluded&&c.kind!=='release'&&c.kind!=='return')return fail('Позиція виключена зі складу.')
 if(c.price!=null&&(!Number.isFinite(c.price)||c.price<0))return fail('Некоректна ціна.')
 if(['sale','writeoff'].includes(c.kind)&&pid)return fail('Ця операція не прив’язується до об’єкта.')
 if(c.kind==='sale'&&(c.salePrice==null||!Number.isFinite(c.salePrice)||c.salePrice<=0))return fail('Введи додатну ціну продажу.')
 if(c.kind==='writeoff'&&!c.note?.trim())return fail('Вкажи причину списання.')
 if(['sale','writeoff'].includes(c.kind)&&c.price==null)return fail('Введи собівартість за одиницю (або 0 явно).')
 if(['reserve','release','issue','return'].includes(c.kind)&&!pid)return fail('Вибери об’єкт.')
 let next=d,after=on,price=c.price??null
 if(c.kind==='reserve'){
  if(!c.confirmed)return fail('Резерв лише для підтвердженого об’єкта (завдаток отримано або в роботі).')
  if(free===null||q>free||q>roundStock(Math.max(0,(c.remaining??0)-own)))return fail('Недостатньо вільного залишку або потреби для резерву.')
  next=changeReserve(d,key,pid,pl,roundStock(own+q))
 }else if(c.kind==='release'){
  if(q>own)return fail('Кількість перевищує резерв об’єкта.')
  next=changeReserve(d,key,pid,pl,roundStock(own-q))
 }else{
  if(on===null)return fail('Спочатку задай фактичний залишок (0, якщо матеріалу немає).')
  if(c.kind==='issue'){
   if(!c.confirmed)return fail('Видача лише на підтверджений об’єкт.')
   if(q>roundStock(on-all+own))return fail('Недостатньо матеріалу: резерви інших об’єктів захищено.')
   after=roundStock(on-q);next=changeReserve(d,key,pid,pl,roundStock(Math.max(0,own-q)))
  }else if(c.kind==='return'){
   const issue=movements(d).find(m=>m.id===c.sourceId&&m.kind==='issue')
   if(!issue||issue.key!==key||issue.projectId!==pid||q>returnable(d,issue.id))return fail('Повернення перевищує залишок конкретної видачі.')
   price=issue.price;after=roundStock(on+q)
  }else if(c.kind==='sale'||c.kind==='writeoff'){
   if(free===null||q>free)return fail('Недостатньо вільного залишку: резерви об’єктів захищено.')
   after=roundStock(on-q)
  }else after=roundStock(on+q)
  next=put(next,row,after)
 }
 return {data:{...next,movements:[...movements(d),{id:c.id,at:c.at,kind:c.kind,key,label:row.label,unit:row.unit,quantity:q,projectId:pid||undefined,projectLabel:pl||undefined,price,salePrice:c.kind==='sale'?c.salePrice:undefined,sourceId:c.sourceId,note:c.note,before:on,after}]}}
}
export function inventoryAdjustment(d:WarehouseData,row:StockEntry,quantity:string,id:string,at:string):WarehouseData{
 const prior=d.entries.find(e=>e.key===row.key),before=priceValue(prior?.quantity),after=priceValue(quantity),all=reserved(d,row.key)
 if(quantity!==''&&(after===null||(row.unit==='шт.'&&!Number.isSafeInteger(after))))return d
 if(all>0&&(after===null||after<all||row.excluded))return d
 const next=put(d,row,after)
 if(before===after)return next
 return {...next,movements:[...movements(d),{id,at,kind:'adjust',key:row.key,label:row.label,unit:row.unit,quantity:roundStock((after??0)-(before??0)),price:null,before,after}]}
}
export function actualMaterialCost(d:WarehouseData,projectId:string){
 const lines=movements(d).filter(m=>m.projectId===projectId&&(m.kind==='issue'||m.kind==='return'))
 const issues=lines.filter(m=>m.kind==='issue').map(m=>({...m,quantity:returnable(d,m.id)})).filter(m=>m.quantity>0)
 return {count:lines.length,missing:issues.filter(m=>m.price===null).length,known:issues.reduce((s,m)=>s+m.quantity*(m.price??0),0),issues}
}
