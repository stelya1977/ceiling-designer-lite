import Transport from './Transport'
import {transportTotal,type TransportSettings} from './transport'
import type {Consumable,ConsumableNeed} from './consumables'
import NumericInput from './NumericInput'
import {costLines,costSignature,normalizeCostSignature,summarizeCosts,type CostNeed,type ObjectCosts} from './objectCost'
import type {CatalogItem} from './pricing'
import type {actualMaterialCost} from './stockMovement'
const money=(n:number)=>n.toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2})+' грн'
const qty=(n:number)=>n.toLocaleString('uk-UA',{maximumFractionDigits:3})
export default function ObjectFinance({needs,warnings,catalog,rules,adjustments,revenue,received,balance,value,onChange,actual,transportBase,lat,lng}:{transportBase?:TransportSettings;lat?:number|null;lng?:number|null;actual:ReturnType<typeof actualMaterialCost>;needs:CostNeed[];warnings:string[];catalog:CatalogItem[];rules:Consumable[];adjustments:{room:string;item:ConsumableNeed}[];revenue:number;received:number;balance:number;value:ObjectCosts;onChange:(v:ObjectCosts)=>void}){
 const signature=costSignature(needs),snapshot=value.snapshot,stale=!!snapshot&&normalizeCostSignature(snapshot.signature)!==normalizeCostSignature(signature)
 const current=costLines(needs,catalog,rules),lines=snapshot?snapshot.lines:current
 const summary=summarizeCosts(lines,revenue,value.wages,value.extra,!stale&&!warnings.length)
 const canFreeze=needs.length>0&&!warnings.length&&current.every(r=>r.amount!==null)
 const line=(label:string,v:string)=><div className="info-row"><span>{label}</span><b>{v}</b></div>
 return <div className="panel" style={{marginBottom:18,border:'1px solid #e5a900'}}><h2>Фінанси об’єкта · тільки для адміністратора</h2>
 <p className="muted">Розрахунок за потребою матеріалів, а не фактичним списанням зі складу. Для профілів із заданими довжинами планок враховується закупівля цілих планок по кожній позиції. Ціни беруться з каталогу до фіксації.</p>
 {line('Вартість замовлення зі знижкою',money(revenue))}{line('Отримано від клієнта',money(received))}{line('Залишок до оплати',money(balance))}
 {warnings.map((w,i)=><p key={i} style={{color:'#ffd27a'}}>{w}</p>)}
 {stale&&<p style={{color:'#ffd27a'}}>Матеріали об’єкта змінилися після фіксації. Старий розрахунок збережено; для актуального результату перевір і зафіксуй новий.</p>}
 {snapshot?<p>Ціни зафіксовано: {new Date(snapshot.at).toLocaleString('uk-UA')}</p>:<p className="muted">Ціни ще не зафіксовано.</p>}
 <details><summary style={{cursor:'pointer',fontWeight:700}}>Розхідні матеріали · фактична кількість</summary><p className="muted">Порожнє поле — автоматична кількість; 0 — не використано. Ручні позиції вводяться на весь об’єкт. LED рахується за довжиною підсвітки в кімнаті.</p>{adjustments.map(({room,item})=><label key={item.key} style={{display:'grid',gap:5,margin:'10px 0'}}>{room} · {item.rule.name} ({item.rule.unit}){item.rule.method!=='manual'&&<small className="muted">За нормою: {qty(item.automatic)}</small>}<NumericInput value={value.consumableQuantities?.[item.key]} placeholder={qty(item.automatic)} commitOnBlur onChange={v=>{const next={...value.consumableQuantities};if(v==='')delete next[item.key];else next[item.key]=v;onChange({...value,consumableQuantities:next})}}/></label>)}</details>
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
 <Transport value={value.transport} base={transportBase} lat={lat} lng={lng} onSave={transport=>onChange({...value,transport})}/>
 {line('Збережені витрати на пальне',transportTotal(value.transport)===null?'Не визначено':money(transportTotal(value.transport)!.cents/100))}
 {line('Розрахунковий прибуток',summary.profit===null||transportTotal(value.transport)===null?'Не визначено':money(summary.profit-transportTotal(value.transport)!.cents/100))}
 <div style={{marginTop:16,borderTop:'1px solid #425365',paddingTop:12}}><h3>Фактичні видачі зі складу</h3>{actual.count===0?<p className="muted">Видачі ще не зареєстровано.</p>:<>{line(actual.missing?'Відома сума видач':'Видано мінус повернуто',money(actual.known))}<details><summary>Матеріали за операціями</summary>{actual.issues.map(m=><div className="info-row" key={m.id}><span>{m.label} · {qty(m.quantity)} {m.unit}</span><b>{m.price===null?'Без ціни':money(m.price*m.quantity)}</b></div>)}</details></>}<p className="muted">Це облік фактичних видач за зафіксованою ціною операції, не повна собівартість монтажу. Плановий прибуток вище не замінюється автоматично.</p></div>
 </div>
}
