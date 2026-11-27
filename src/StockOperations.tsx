import {useState} from 'react'
import NumericInput from './NumericInput'
import {priceValue} from './objectCost'
import {applyMovement,movements,reservations,returnable,movementLabels,type Command,type MovementKind} from './stockMovement'
import {stockRows,type WarehouseData,type DemandProject,type StockRow} from './warehouse'
import type {CatalogItem} from './pricing'
import type {Consumable} from './consumables'
import {fmt} from './procurement'
const confirmed=(p?:DemandProject)=>!!p&&['Завдаток отримано','В роботі'].includes(p.status)
const standalone=(kind:MovementKind)=>['receipt','sale','writeoff'].includes(kind)
const uid=()=>crypto.randomUUID()
export default function StockOperations({data,projects,catalog,rules,onUpdate,canEdit,tab}:{data:WarehouseData;projects:DemandProject[];catalog:CatalogItem[];rules:Consumable[];onUpdate:(fn:(d:WarehouseData)=>WarehouseData)=>void;canEdit:boolean;tab:'movement'|'history'}){
 const [kind,setKind]=useState<Exclude<MovementKind,'adjust'>>('receipt'),[pid,setPid]=useState(''),[key,setKey]=useState(''),[source,setSource]=useState(''),[qty,setQty]=useState(''),[price,setPrice]=useState(''),[salePrice,setSalePrice]=useState(''),[note,setNote]=useState(''),[msg,setMsg]=useState(''),[historyFilter,setHistoryFilter]=useState(''),[limit,setLimit]=useState(50)
 const ledger=movements(data),held=reservations(data),p=projects.find(v=>v.id===pid)
 const rows=stockRows(catalog,rules,data,projects,pid||'all'),row=rows.find(r=>r.key===key)
 const issues=ledger.filter(m=>m.kind==='issue'&&returnable(data,m.id)>0).slice().reverse(),issue=issues.find(m=>m.id===source)
 const release=kind==='release'?held.find(r=>r.projectId===pid&&r.key===key):undefined
 const choices=kind==='reserve'?rows.filter(r=>!r.excluded&&r.needed>r.ownReserved):kind==='release'?rows.filter(r=>held.some(h=>h.key===r.key&&h.projectId===pid)):rows.filter(r=>!r.excluded)
 const projectOptions=kind==='release'?[...new Map(held.map(r=>[r.projectId,{id:r.projectId,label:r.projectLabel}])).values()]:projects.filter(confirmed)
 const reset=()=>{setKey('');setQty('');setPrice('');setSalePrice('');setNote('');setSource('');setMsg('')}
 function choose(r?:StockRow){setKey(r?.key||'');setPrice(r?.unitPrice==null?'':String(r.unitPrice));setQty('');setSalePrice('');setMsg('')}
 function submit(){
  if(!canEdit)return
  const r=kind==='return'?rows.find(x=>x.key===issue?.key):row
  const q=priceValue(qty);if(!r||q===null){setMsg('Вибери матеріал і кількість.');return}
  if(kind==='issue'&&priceValue(price)===null){setMsg('Введи ціну видачі (або 0 явно).');return}
  const c:Command={id:uid(),at:new Date().toISOString(),kind,row:r,quantity:q,projectId:kind==='return'?issue?.projectId:standalone(kind)?undefined:pid,projectLabel:kind==='return'?issue?.projectLabel:standalone(kind)?undefined:release?.projectLabel||p?.label,price:priceValue(price),salePrice:priceValue(salePrice)??undefined,sourceId:kind==='return'?source:undefined,note:note.trim(),remaining:r.needed,confirmed:confirmed(p)}
  const result=applyMovement(data,c);if(result.error){setMsg(result.error);return}
  if(!confirm(`${movementLabels[kind]}: ${r.label} · ${fmt(q)} ${r.unit}?`))return
  onUpdate(current=>applyMovement(current,c).data);setQty('');setNote('');setSalePrice('');setMsg('Перевір операцію в історії та статус синхронізації.')
 }
 const history=ledger.slice().reverse().filter(m=>[m.label,m.projectLabel,movementLabels[m.kind],m.note].join(' ').toLowerCase().includes(historyFilter.trim().toLowerCase()))
 return <div className="panel form-panel">
 {tab==='movement'?<><h2>Рух матеріалів</h2><p className="muted">Для отримання зареєстрованого замовлення використовуй «Замовлені матеріали», а не звичайне надходження. Спочатку внеси фактичні залишки. Резерви не списують матеріал. Після видачі та повернення залишки й потреба змінюються автоматично.</p>
 <label>Операція<select value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setPid('');reset()}}>{(['receipt','reserve','release','issue','return','sale','writeoff'] as const).map(k=><option key={k} value={k}>{movementLabels[k]}</option>)}</select></label>
 {kind==='return'?<label>Вибери попередню видачу<select value={source} onChange={e=>{setSource(e.target.value);setQty('');setMsg('')}}><option value="">Вибрати</option>{issues.map(m=><option key={m.id} value={m.id}>{m.projectLabel} · {m.label} · {fmt(returnable(data,m.id))} {m.unit} · {new Date(m.at).toLocaleDateString('uk-UA')}</option>)}</select></label>:<>{!standalone(kind)&&<label>Об’єкт<select value={pid} onChange={e=>{setPid(e.target.value);reset()}}><option value="">Вибрати</option>{projectOptions.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label>}
 <label>Матеріал<select value={key} disabled={!standalone(kind)&&!pid} onChange={e=>choose(rows.find(r=>r.key===e.target.value))}><option value="">Вибрати</option>{choices.map(r=><option key={r.key} value={r.key}>{r.label} · {r.unit}</option>)}</select></label></>}
 {kind==='return'&&issue&&<p>Можна повернути: <b>{fmt(returnable(data,issue.id))} {issue.unit}</b>. Ціна — за початковою видачею.</p>}
 {kind!=='return'&&row&&<p>На складі: <b>{row.onHand===null?'не задано':fmt(row.onHand)}</b> · Вільно: <b>{row.free===null?'—':fmt(row.free)}</b>{pid&&<> · Резерв цього об’єкта: <b>{fmt(row.ownReserved)}</b> · Ще потрібно: <b>{fmt(row.needed)}</b></>} {row.unit}</p>}
 <label>Кількість<NumericInput value={qty} onChange={setQty} integer={(kind==='return'?issue?.unit:row?.unit)==='шт.'}/></label>
 {(standalone(kind)||kind==='issue')&&<label>Собівартість за одиницю, грн {kind==='receipt'?'(необов’язково)':'(фіксується в історії)'}<NumericInput value={price} onChange={setPrice}/></label>}
 {kind==='sale'&&<><label>Ціна продажу за одиницю, грн<NumericInput value={salePrice} onChange={setSalePrice}/></label>{priceValue(qty)!==null&&priceValue(salePrice)!==null&&priceValue(price)!==null&&<p>Виручка: <b>{fmt(Number(qty)*Number(salePrice))} ₴</b> · Валовий прибуток: <b>{fmt(Number(qty)*(Number(salePrice)-Number(price)))} ₴</b></p>}</>}
 <label>{kind==='sale'?'Покупець / примітка':kind==='writeoff'?'Причина списання (обов’язково)':'Примітка'}<input value={note} onChange={e=>setNote(e.target.value)} placeholder={kind==='sale'?'Ім’я покупця, номер накладної':kind==='writeoff'?'Брак, пошкодження, втрата':'Накладна, монтажник тощо'}/></label>
 <button className="button primary" disabled={!canEdit||!qty||!(kind==='return'?source:key)||(!standalone(kind)&&kind!=='return'&&!pid)} onClick={submit}>Провести операцію</button>{msg&&<p role="status">{msg}</p>}
 <h2>Активні резерви</h2>{held.length===0&&<p className="muted">Резервів немає.</p>}{held.map(h=><div key={h.projectId+'|'+h.key} className="info-row"><div><b>{h.projectLabel}</b><div>{rows.find(r=>r.key===h.key)?.label||h.key} · {fmt(h.quantity)}</div>{!projects.some(p=>p.id===h.projectId)&&<small style={{color:'#ffcf52'}}>Об’єкт закритий або відсутній — зніми резерв.</small>}</div><button className="button secondary" disabled={!canEdit} onClick={()=>{setKind('release');setPid(h.projectId);setKey(h.key);setQty(String(h.quantity));setMsg('')}}>Зняти</button></div>)}
 </>:<><h2>Історія операцій</h2><label>Пошук<input value={historyFilter} onChange={e=>{setHistoryFilter(e.target.value);setLimit(50)}}/></label>{history.length===0&&<p className="muted">Операцій немає.</p>}{history.slice(0,limit).map(m=><div key={m.id} style={{padding:'10px 0',borderBottom:'1px solid #425365'}}><b>{movementLabels[m.kind]} · {m.label}</b><div className="muted">{new Date(m.at).toLocaleString('uk-UA')}{m.projectLabel?' · '+m.projectLabel:''}</div><div>{m.kind==='adjust'?`${m.before===null?'не задано':fmt(m.before??0)} → ${m.after===null?'не задано':fmt(m.after??0)} ${m.unit}`:`${fmt(m.quantity)} ${m.unit}`}{m.price!==null?` × ${fmt(m.price)} ₴`:''}</div>{m.kind==='sale'&&m.salePrice!=null&&<div>Продаж: {fmt(m.salePrice)} ₴/од. · Виручка: <b>{fmt(m.quantity*m.salePrice)} ₴</b> · Валовий прибуток: <b>{m.price==null?'—':fmt(m.quantity*(m.salePrice-m.price))+' ₴'}</b></div>}{m.kind==='writeoff'&&m.price!=null&&<div>Сума списання: {fmt(m.quantity*m.price)} ₴</div>}{m.note&&<small>{m.note}</small>}</div>)}{history.length>limit&&<button className="button secondary" onClick={()=>setLimit(v=>v+50)}>Показати ще</button>}</>}
 </div>
}
