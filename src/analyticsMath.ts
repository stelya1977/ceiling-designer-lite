import {businessSummary,inPeriod,type BusinessCost,type Period} from './businessMath'
import {cents,dayValid,type financeSummary} from './financeMath'
import {overheadSummary,netAfterOverhead} from './overhead'
import {refusedSummary,type RefusedTransport} from './transport'
import type {WarehouseData} from './warehouse'
export type AreaInfo={known:number;missing:number}
export type AnalyticsInput={summary:ReturnType<typeof financeSummary>;costs:Record<string,BusinessCost>;warehouse:WarehouseData;period:Period;refused:RefusedTransport[];areas:Record<string,AreaInfo>}
const iso=(d:Date)=>d.toISOString().slice(0,10)
export function analyticsPeriods(p:Period):Period[]{
 if(!dayValid(p.from)||!dayValid(p.to)||p.from>p.to)return []
 const start=new Date(p.from+'T00:00:00Z'),end=new Date(p.to+'T00:00:00Z'),days=(+end-+start)/86400000+1,months=(end.getUTCFullYear()-start.getUTCFullYear())*12+end.getUTCMonth()-start.getUTCMonth()+1
 const mode=days<=31?'day':months<=24?'month':'year',out:Period[]=[];let cur=start
 while(cur<=end){const next=new Date(cur);if(mode==='day')next.setUTCDate(next.getUTCDate()+1);else if(mode==='month'){next.setUTCDate(1);next.setUTCMonth(next.getUTCMonth()+1)}else{next.setUTCMonth(0,1);next.setUTCFullYear(next.getUTCFullYear()+1)}
 const last=new Date(+next-86400000);out.push({from:iso(cur),to:iso(last>end?end:last)});cur=next}
 return out
}
export function analyticsSlice(input:AnalyticsInput,period:Period){
 const {summary,costs,warehouse,refused,areas}=input,completed=summary.completed.filter(r=>inPeriod(r.day,period)),s=businessSummary(completed,costs,warehouse,period),o=overheadSummary(warehouse.overhead,period),f=refusedSummary(refused,period.from,period.to),wages=summary.salary.filter(r=>inPeriod(r.paid_on,period)).reduce((n,r)=>n+cents(r.amount),0),received=summary.monthly.filter(r=>inPeriod(r.day,period)).reduce((n,r)=>n+r.cents,0),mountRevenue=completed.reduce((n,r)=>n+r.total,0),turnover=mountRevenue+s.saleRevenue,net=netAfterOverhead(s.result===null||f.missing?null:s.result-f.total-wages,o)
 const a=completed.reduce((v,r)=>{const area=areas[r.id];return {known:v.known+(area?.known??0),missing:v.missing+(area?.missing??1)}},{known:0,missing:0})
 return {...period,count:completed.length,area:a.known,areaMissing:a.missing,turnover,turnoverIncomplete:s.sales.some(r=>r.revenue===null)||s.unknown>0,received,mountRevenue,saleRevenue:s.saleRevenue,net,wages,overhead:o.total,material:s.material+s.saleCost+s.writeoffCost,fuel:s.fuel+f.total,extra:s.extra,estimated:s.estimated,incomplete:s.incomplete,margin:net===null||turnover<=0?null:net/turnover*100}
}
export function analyticsReport(input:AnalyticsInput){return {total:analyticsSlice(input,input.period),rows:analyticsPeriods(input.period).map(p=>analyticsSlice(input,p))}}
