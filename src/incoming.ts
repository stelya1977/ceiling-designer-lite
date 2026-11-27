import type {WarehouseData,StockEntry} from './warehouse'
import {applyMovement,movements,roundStock} from './stockMovement'
export type SupplyOrder={id:string;at:string;key:string;label:string;unit:string;supplierId?:string;supplierName:string;quantity:number;price:number|null;due:string;note:string;cancelledAt?:string}
export const supplyOrders=(d:WarehouseData):SupplyOrder[]=>Array.isArray(d.orders)?d.orders:[]
export const receivedQuantity=(d:WarehouseData,id:string)=>roundStock(movements(d).filter(m=>m.kind==='receipt'&&m.sourceId===id).reduce((s,m)=>s+m.quantity,0))
export const outstanding=(d:WarehouseData,o:SupplyOrder)=>o.cancelledAt?0:roundStock(Math.max(0,o.quantity-receivedQuantity(d,o.id)))
export const incomingQuantity=(d:WarehouseData,key:string)=>roundStock(supplyOrders(d).filter(o=>o.key===key).reduce((s,o)=>s+outstanding(d,o),0))
export function addOrders(d:WarehouseData,items:SupplyOrder[]){
 const existing=supplyOrders(d),ids=new Set(existing.map(o=>o.id));const next=[...existing]
 for(const o of items){if(ids.has(o.id)||!o.key||!o.label||!Number.isFinite(o.quantity)||o.quantity<=0||o.quantity>1e9||(o.unit==='шт.'&&!Number.isSafeInteger(o.quantity))||(o.price!==null&&(!Number.isFinite(o.price)||o.price<0))||d.entries.some(r=>r.key===o.key&&r.excluded))continue;ids.add(o.id);next.push({...o,quantity:roundStock(o.quantity)})}
 return {...d,orders:next}
}
export function receiveOrder(d:WarehouseData,id:string,row:StockEntry,q:number,price:number|null,operationId:string,at:string){
 const fail=(error:string)=>({data:d,error});if(movements(d).some(m=>m.id===operationId))return {data:d}
 const order=supplyOrders(d).find(o=>o.id===id);if(!order||order.key!==row.key||order.unit!==row.unit)return fail('Замовлення або матеріал не знайдено.')
 if(!Number.isFinite(q)||q<=0||roundStock(q)>outstanding(d,order))return fail('Кількість перевищує невиконану частину замовлення.')
 return applyMovement(d,{id:operationId,at,kind:'receipt',row,quantity:q,price,sourceId:id,note:`Поставка: ${order.supplierName||'без постачальника'}${order.note?' · '+order.note:''}`})
}
export function cancelOrder(d:WarehouseData,id:string,at:string):WarehouseData{return {...d,orders:supplyOrders(d).map(o=>o.id===id&&outstanding(d,o)>0?{...o,cancelledAt:at}:o)}}
