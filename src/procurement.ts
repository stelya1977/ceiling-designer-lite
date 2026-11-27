import type {StockRow,WarehouseData} from './warehouse'
import {priceValue} from './objectCost'
export type Supplier={id:string;name:string;phone:string;url:string;note:string;active:boolean}
export type Offer={id:string;key:string;supplierId:string;price:string;pack:string;url:string;note:string;preferred:boolean}
export type PurchasingData={suppliers:Supplier[];offers:Offer[]}
export const purchasing=(data:WarehouseData):PurchasingData=>({suppliers:Array.isArray(data.suppliers)?data.suppliers:[],offers:Array.isArray(data.offers)?data.offers:[]})
export const validUrl=(s:string)=>{try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
export function saveSupplier(data:PurchasingData,supplier:Supplier):PurchasingData{return {...data,suppliers:[...data.suppliers.filter(s=>s.id!==supplier.id),supplier]}}
export function saveOffer(data:PurchasingData,offer:Offer):PurchasingData{return {...data,offers:[...data.offers.filter(o=>o.id!==offer.id).map(o=>offer.preferred&&o.key===offer.key?{...o,preferred:false}:o),offer]}}
const round=(x:number)=>Math.round(x*1e6)/1e6
export function purchaseRows(rows:StockRow[],data:PurchasingData){return rows.filter(r=>!r.excluded&&r.needed>0&&(r.shortage===null||r.shortage>0)).map(row=>{
 const options=data.offers.filter(o=>o.key===row.key&&data.suppliers.some(s=>s.id===o.supplierId&&s.active))
 const offer=options.find(o=>o.preferred)|| (options.length===1?options[0]:undefined)
 const supplier=data.suppliers.find(s=>s.id===offer?.supplierId&&s.active)
 const size=priceValue(offer?.pack),pack=size&&size>0?size:null
 const packs=row.shortage!==null&&pack?Math.ceil(row.shortage/pack-1e-9):null
 const quantity=row.shortage===null?null:pack?round(packs!*pack):row.shortage
 const price=priceValue(offer?.price)??row.unitPrice
 return {row,options,offer,supplier,pack,packs,quantity,price,amount:quantity===null||price===null?null:Math.round(quantity*price*100)/100}
})}
export type PurchaseRow=ReturnType<typeof purchaseRows>[number]
export const fmt=(n:number)=>n.toLocaleString('uk-UA',{maximumFractionDigits:3})
export function orderText(name:string,rows:PurchaseRow[],project:string){return [`Закупівля — ${name}`,`Об’єкти: ${project}`,...rows.filter(r=>r.quantity!==null&&r.supplier).map(r=>`${r.row.label}: ${fmt(r.quantity!)} ${r.row.unit}${r.packs!==null?` (${r.packs} уп./планок × ${fmt(r.pack!)} ${r.row.unit})`:''}${r.offer?.url&&validUrl(r.offer.url)?' · '+validUrl(r.offer.url):''}${r.offer?.note?' · '+r.offer.note:''}`)].join('\n')}
