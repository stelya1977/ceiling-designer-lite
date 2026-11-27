import NumericInput from './NumericInput'
import {costLines,costSignature,summarizeCosts,type CostNeed,type ObjectCosts} from './objectCost'
import type {CatalogItem} from './pricing'
const money=(n:number)=>n.toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2})+' грн'
const qty=(n:number)=>n.toLocaleString('uk-UA',{maximumFractionDigits:3})
export default function ObjectFinance({needs,warnings,catalog,revenue,received,balance,value,onChange}:{needs:CostNeed[];warnings:string[];catalog:CatalogItem[];revenue:number;received:number;balance:number;value:ObjectCosts;onChange:(v:ObjectCosts)=>void}){
 const signature=costSignature(needs),snapshot=value.snapshot,stale=!!snapshot&&snapshot.signature!==signature
 const current=costLines(needs,catalog),lines=snapshot?snapshot.lines:current
 const summary=summarizeCosts(lines,revenue,value.wages,value.extra,!stale&&!warnings.length)
 const canFreeze=needs.length>0&&!warnings.length&&current.every(r=>r.amount!==null)
 const line=(label:string,v:string)=><div className="info-row"><span>{label}</span><b>{v}</b></div>
 return <div className="panel" style={{marginBottom:18,border:'1px solid #e5a900'}}><h2>Фінанси об’єкта · тільки для адміністратора</h2>
 <p className="muted">Розрахунок за потребою матеріалів, а не фактичним списанням зі складу. Для профілів із заданими довжинами планок враховується закупівля цілих планок по кожній позиції. Ціни беруться з каталогу до фіксації.</p>
 {line('Вартість замовлення зі знижкою',money(revenue))}{line('Отримано від клієнта',money(received))}{line('Залишок до оплати',money(balance))}
 {warnings.map((w,i)=><p key={i} style={{color:'#ffd27a'}}>{w}</p>)}
 {stale&&<p style={{color:'#ffd27a'}}>Матеріали об’єкта змінилися після фіксації. Старий розрахунок збережено; для актуального результату перевір і зафіксуй новий.</p>}
 {snapshot?<p>Ціни зафіксовано: {new Date(snapshot.at).toLocaleString('uk-UA')}</p>:<p className="muted">Ціни ще не зафіксовано.</p>}
 <details open={undefined}><summary style={{cursor:'pointer',fontWeight:700}}>Матеріали ({lines.length}) · {money(summary.known)}{summary.missing?` · без ціни: ${summary.missing}`:''}</summary>
 {lines.map((r,i)=><div className="info-row" key={i}><div><small className="muted">{r.room}</small><div>{r.label}</div><small>{qty(r.quantity)} {r.unit} × {r.unitPrice===null?'ціна не задана':money(r.unitPrice)}</small></div><b style={{color:r.amount===null?'#ffd27a':undefined}}>{r.amount===null?'—':money(r.amount)}</b></div>)}
 </details>
 {summary.missing>0&&<p style={{color:'#ffd27a'}}>Не задано {summary.missing} закупівельних цін. Нуль вводиться явно, якщо позиція не має матеріальної вартості.</p>}
 <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0'}}><button className="button secondary" disabled={!canFreeze} onClick={()=>{if(snapshot&&!confirm('Замінити зафіксовані ціни поточними цінами каталогу?'))return;onChange({...value,snapshot:{at:new Date().toISOString(),signature,lines:current}})}}>{snapshot?'Перефіксувати з каталогу':'Зафіксувати собівартість'}</button></div>
 {snapshot&&!canFreeze&&<p className="muted">Для нової фіксації потрібні всі актуальні ціни та коректні розміри.</p>}
 {line(summary.complete?'Собівартість матеріалів':'Відомі витрати на матеріали',money(summary.known))}{line('Залишок після матеріалів',summary.margin===null?'Не визначено':money(summary.margin))}
 <label style={{display:'grid',gap:6,margin:'12px 0'}}>Зарплата по об’єкту, грн (вручну)<NumericInput value={value.wages} onChange={wages=>onChange({...value,wages})} placeholder="Не задано" commitOnBlur/></label>
 <label style={{display:'grid',gap:6,margin:'12px 0'}}>Додаткові витрати, грн (вручну)<NumericInput value={value.extra} onChange={extra=>onChange({...value,extra})} placeholder="Не задано" commitOnBlur/></label>
 <p className="muted">Зарплату і витрати введи фактичними сумами або 0. Цей запис не нараховує зарплату повторно і не змінює касу. Податки та інші витрати враховуються тільки якщо внесені.</p>
 {line('Розрахунковий прибуток',summary.profit===null?'Не визначено':money(summary.profit))}
 </div>
}
