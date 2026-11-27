import {transportTotal} from './transport'
import {cents,kyivDay,dayValid} from './financeMath'
import {priceValue,costLines,costSignature,normalizeCostSignature,summarizeCosts,type CostNeed,type ObjectCosts} from './objectCost'
import type {CatalogItem} from './pricing'
import type {Consumable} from './consumables'
import {actualMaterialCost,movements} from './stockMovement'
import type {WarehouseData} from './warehouse'
export type BusinessCost={material:number;materialComplete:boolean;frozen:boolean;wages:number|null;extra:number|null;fuel:number|null;actual:number;actualCount:number;actualMissing:number;reason:string[]}
export type Period={from:string;to:string}
export function inPeriod(day:string|null|undefined,p:Period){return !!day&&dayValid(day)&&day>=p.from&&day<=p.to}
export function projectBusinessCost(needs:CostNeed[],warnings:string[],value:ObjectCosts,catalog:CatalogItem[],rules:Consumable[],warehouse:WarehouseData,id:string):BusinessCost{
 const snap=value.snapshot, stale=!!snap&&normalizeCostSignature(snap.signature)!==normalizeCostSignature(costSignature(needs));
 const lines=snap?snap.lines:costLines(needs,catalog,rules),sum=summarizeCosts(lines,0,value.wages,value.extra,!stale&&!warnings.length),actual=actualMaterialCost(warehouse,id)
 return {material:cents(sum.known),materialComplete:sum.complete,frozen:!!snap&&!stale,wages:priceValue(value.wages)===null?null:cents(value.wages),extra:priceValue(value.extra)===null?null:cents(value.extra),fuel:transportTotal(value.transport)?.cents??null,actual:cents(actual.known),actualCount:actual.count,actualMissing:actual.missing,reason:[...warnings,...(stale?['Застаріла фіксація матеріалів']:[]),...(sum.missing?[`Без закупівельної ціни: ${sum.missing}`]:[]),...(!lines.length?['Немає матеріалів для розрахунку']:[])]}
}
export function businessSummary(completed:{id:string;client:string;day:string;total:number}[],costs:Record<string,BusinessCost>,warehouse:WarehouseData,period:Period){
 const objects=completed.map(p=>{const c=costs[p.id],complete=!!c&&c.materialComplete&&c.extra!==null&&c.fuel!=null;return {...p,c,complete,profit:complete?p.total-c.material-c.extra!-c.fuel!:null}})
 const sum=(f:(r:typeof objects[number])=>number)=>objects.reduce((n,r)=>n+f(r),0)
 const rows=movements(warehouse).filter(m=>['sale','writeoff','receipt'].includes(m.kind))
 const dated=rows.filter(m=>inPeriod(kyivDay(m.at),period)),unknown=rows.filter(m=>!kyivDay(m.at)).length
 const cost=(m:typeof rows[number])=>priceValue(m.price)===null?null:cents(m.quantity*m.price!)
 const revenue=(m:typeof rows[number])=>priceValue(m.salePrice)===null?null:cents(m.quantity*m.salePrice!)
 const sales=dated.filter(m=>m.kind==='sale').map(m=>({...m,revenue:revenue(m),cost:cost(m)})),writeoffs=dated.filter(m=>m.kind==='writeoff').map(m=>({...m,cost:cost(m)})),receipts=dated.filter(m=>m.kind==='receipt').map(m=>({...m,cost:cost(m)}))
 const saleRevenue=sales.reduce((n,m)=>n+(m.revenue??0),0),saleCost=sales.reduce((n,m)=>n+(m.cost??0),0),writeoffCost=writeoffs.reduce((n,m)=>n+(m.cost??0),0),receiptCost=receipts.reduce((n,m)=>n+(m.cost??0),0)
 const incomplete=objects.filter(r=>!r.complete).length,estimated=objects.filter(r=>r.complete&&!r.c.frozen).length,missingSales=sales.filter(m=>m.cost===null||m.revenue===null).length,missingWriteoffs=writeoffs.filter(m=>m.cost===null).length,missingReceipts=receipts.filter(m=>m.cost===null).length
 const objectProfit=incomplete?null:sum(r=>r.profit??0),saleProfit=missingSales?null:saleRevenue-saleCost
 return {objects,incomplete,estimated,material:sum(r=>r.c?.material??0),labor:sum(r=>r.c?.wages??0),extra:sum(r=>r.c?.extra??0),fuel:sum(r=>r.c?.fuel??0),actual:sum(r=>r.c?.actual??0),objectProfit,sales,writeoffs,receipts,saleRevenue,saleCost,writeoffCost,receiptCost,missingSales,missingWriteoffs,missingReceipts,unknown,saleProfit,result:objectProfit===null||saleProfit===null||missingWriteoffs||unknown?null:objectProfit+saleProfit-writeoffCost}
}
