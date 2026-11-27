import {cents,kyivDay,depositParts,type FinanceProject,type Receipt,type Completion} from './financeMath'
export type PaymentProject=FinanceProject&{phone?:string;address?:string;city?:string;measurementDate?:string}
export type PaymentState='debt'|'confirmed'|'quote'|'paid'|'overpaid'|'noestimate'|'excluded'
export function paymentControl(projects:PaymentProject[],receipts:Receipt[],jobs:Completion[],today:string){
 const byReceipt=new Map(receipts.map(r=>[r.project_id,r])),byJob=new Map(jobs.map(j=>[j.project_id,j])),seen=new Set<string>()
 const rows=projects.filter(p=>{if(seen.has(p.id))return false;seen.add(p.id);return true}).map(p=>{
  const r=byReceipt.get(p.id),done=kyivDay(byJob.get(p.id)?.completed_at||p.completedAt),total=cents(p.total),deposit=cents(p.deposit),worker=cents(r?.amount),final=Math.max(cents(p.final),cents(r?.final_total),worker),received=deposit+final,balance=Math.max(0,total-received),overpaid=Math.max(0,received-total),excluded=!done&&(!!p.archivedAt||p.status==='Відмовлено'),confirmed=deposit>0||final>0||['Завдаток отримано','В роботі'].includes(p.status)
  const state:PaymentState=excluded?'excluded':total===0?'noestimate':overpaid?'overpaid':!balance?'paid':done?'debt':confirmed?'confirmed':'quote'
  const days=done?Math.max(0,Math.floor((Date.parse(today+'T00:00:00Z')-Date.parse(done+'T00:00:00Z'))/86400000)):null
  const history=[...depositParts(p.deposit,p.depositParts).map(x=>({...x,label:'Завдаток'})),...depositParts((final-worker)/100,p.finalParts).map(x=>({...x,label:'Оплата власнику'})),...(worker?[{day:kyivDay(r?.collected_at),cents:worker,label:'Отримав монтажник'}]:[])].sort((a,b)=>(b.day||'').localeCompare(a.day||''))
  return {...p,state,done,days,total,deposit,final,received,balance,overpaid,worker,onHands:r&&!r.handed_at?worker:0,discrepancy:!!r&&cents(p.final)!==cents(r.final_total),history}
 })
 const totals=(state:PaymentState)=>rows.filter(r=>r.state===state).reduce((n,r)=>n+(state==='overpaid'?r.overpaid:r.balance),0)
 return {rows,debt:totals('debt'),confirmed:totals('confirmed'),quote:totals('quote'),overpaid:totals('overpaid'),onHands:receipts.filter(r=>!r.handed_at).reduce((n,r)=>n+cents(r.amount),0),missing:receipts.filter(r=>!seen.has(r.project_id)).length}
}
