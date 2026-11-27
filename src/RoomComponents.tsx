import NumericInput from './NumericInput'
import { calculate, categoryOf, hasIncludedLed, ledMaterialLength, newSelection, num, snapshot, stockPlan, type CatalogItem, type RoomPricing, type Selection, type Category } from './pricing'

type Props = { pricing: RoomPricing; catalog: CatalogItem[]; area: number | null; perimeter: number | null; onChange:(p:RoomPricing)=>void }
const format=(n:number)=>n.toLocaleString('uk-UA',{maximumFractionDigits:2})
const money=(n:number)=>`${Math.round(n).toLocaleString('uk-UA')} ₴`
export default function RoomComponents({pricing:p,catalog,area,perimeter,onChange}:Props){
 const e=calculate(p,area||0,perimeter||0)
 const update=(patch:Partial<RoomPricing>)=>onChange({...p,...patch})
 const edit=(id:string,patch:Partial<Selection>)=>update({items:p.items.map(x=>x.id===id?{...x,...patch}:x)})
 const input=(label:string,value:string,change:(s:string)=>void,integer=false)=><label>{label}<NumericInput integer={integer} value={value} onChange={change}/></label>
 const add=(id:string)=>{const item=catalog.find(x=>x.id===id);if(item)update({items:[...p.items,newSelection(item,crypto.randomUUID())]})}
 const refresh=()=>{
   if(!confirm('Оновити тарифи та параметри вибраних позицій за поточним каталогом? Сума кошторису може змінитися.'))return
   // Do not revive deleted products or change the type/unit of a previously selected product.
   const current=(v:CatalogItem)=>{const next=catalog.find(x=>x.id===v.id);return next&&categoryOf(next)===categoryOf(v)&&next.unit===v.unit?snapshot(next):v}
   update({fabric:p.fabric?current(p.fabric):null,standard:current(p.standard),insert:current(p.insert),items:p.items.map(s=>({...s,item:current(s.item)}))})
 }
 const section=(category:Category)=>{
  const options=catalog.filter(x=>categoryOf(x)===category&&!['standard-profile','decorative-insert','fabric-msd'].includes(x.id))
  return <div className="panel form-panel" key={category}><h2>{category}</h2>
    <label>Додати з каталогу<select value="" onChange={ev=>add(ev.target.value)}><option value="">Обрати позицію…</option>{options.map(x=><option key={x.id} value={x.id}>{x.name} — {x.price} ₴/{x.unit}</option>)}</select></label>
    {!options.length&&<p className="muted">Нові позиції можна додати в каталозі.</p>}
    {p.items.filter(s=>categoryOf(s.item)===category).map(s=>{const v=s.item;const plan=stockPlan(num(s.quantity),v.unit==='м'?v.stockLength:'');return <div key={s.id} style={{border:'1px solid #60778a',padding:12,borderRadius:10,marginTop:10}}>
      <div className="info-row"><b>{v.name}</b><button className="button secondary" onClick={()=>update({items:p.items.filter(x=>x.id!==s.id)})}>Видалити</button></div>
      <p className="muted">{v.price} ₴/{v.unit} · ціна зафіксована</p>
      {input(`Кількість, ${v.unit}`,s.quantity,q=>edit(s.id,{quantity:q}),v.unit==='шт.')}
      {plan.bars.length>0&&<p className="muted">Планки: {plan.bars.map(b=>`${b.count} × ${format(b.length)} м`).join('; ')}. Закупівля: {format(plan.length)} м.{v.billStock?' Оплата за закуплену довжину.':' Оплата за фактичну довжину.'}</p>}
      {category==='Карнизи'&&<label>Колір<select value={s.color} onChange={ev=>edit(s.id,{color:ev.target.value as 'white'|'black'})}><option value="white">Білий</option><option value="black">Чорний</option></select></label>}
      {(category==='Профілі'||num(v.cornerPrice)>0)&&input(`Кути, шт. (${v.cornerPrice||0} ₴/шт.; безкоштовно ${v.freeCorners||0})`,s.corners,q=>edit(s.id,{corners:q}),true)}
      {v.ledPrice!==undefined&&v.ledPrice!==''&&<><label>Підсвітка<select value={s.ledEnabled?'yes':'no'} onChange={ev=>edit(s.id,{ledEnabled:ev.target.value==='yes'})}><option value="no">Без підсвітки</option><option value="yes">З підсвіткою</option></select></label>{s.ledEnabled&&<><label>Колір світла<select value={s.ledColor} onChange={ev=>edit(s.id,{ledColor:ev.target.value})}><option>Тепле 3000K</option><option>Нейтральне 4000K</option><option>Холодне 6000K</option><option>RGB</option></select></label>{input(`Довжина LED, м (${v.ledPrice} ₴/м)`,s.ledLength,q=>edit(s.id,{ledLength:q}))}</>}</>}
      {hasIncludedLed(v)&&<><label>LED у складі профілю (тільки матеріали)<select value={s.includedLedDisabled?'no':'yes'} onChange={ev=>edit(s.id,{includedLedDisabled:ev.target.value==='no'})}><option value="yes">З підсвіткою</option><option value="no">Без підсвітки</option></select></label>{!s.includedLedDisabled&&<><label>Колір світла<select value={s.ledColor} onChange={ev=>edit(s.id,{ledColor:ev.target.value})}><option>Тепле 3000K</option><option>Нейтральне 4000K</option><option>Холодне 6000K</option><option>RGB</option></select></label>{input('Довжина LED, м (порожньо — автоматично)',s.includedLedLength??'',q=>edit(s.id,{includedLedLength:q}))}<p className="muted">До матеріалів: {format(ledMaterialLength(s))} м. Ціна клієнта не змінюється.</p></>}</>}
      {v.powerPrice!==undefined&&v.powerPrice!==''&&input(`Блоки живлення, шт. (${v.powerPrice} ₴)`,s.power,q=>edit(s.id,{power:q}),true)}
      {v.grillePrice!==undefined&&v.grillePrice!==''&&input(`Магнітні решітки, шт. (${v.grillePrice} ₴)`,s.grilles,q=>edit(s.id,{grilles:q}),true)}
    </div>})}
  </div>
 }
 return <div style={{display:'grid',gap:16}}>
  <div className="panel form-panel"><h2>Базова стеля</h2><label>Полотно<select value={p.fabric?.id||''} onChange={ev=>{const v=catalog.find(x=>x.id===ev.target.value);update({fabric:v?snapshot(v):null})}}><option value="">Без полотна</option>{catalog.filter(x=>categoryOf(x)==='Полотна').map(x=><option value={x.id} key={x.id}>{x.name} — {x.price} ₴/м²</option>)}{p.fabric&&!catalog.some(x=>x.id===p.fabric?.id)&&<option value={p.fabric.id}>{p.fabric.name} (збережене)</option>}</select></label><p className="muted">Площа: {area===null?'не визначена':`${format(area)} м²`}. Ціна в кімнаті: {p.fabric?.price||'0'} ₴/м²</p></div>
  <div className="panel form-panel"><h2>Стандартний профіль та вставка</h2><p>Периметр: {perimeter===null?'не визначений':`${format(perimeter)} м`}</p><p>Спеціальні профілі: {format(e.used)} м. Залишок стандартного профілю: <b>{format(e.standardLength)} м</b>.</p>{e.overrun&&<p role="alert" style={{color:'#ffb4b4'}}>Довжина периметральних профілів перевищує периметр. Перевір заміри.</p>}
    <p className="muted">{p.standard.name}: {p.standard.price} ₴/м · вставка: {p.insert.price} ₴/м</p>
    <label>Колір декоративної вставки<select value={p.insertColor} onChange={ev=>update({insertColor:ev.target.value as 'white'|'black'})}><option value="white">Біла</option><option value="black">Чорна</option></select></label>
    {input('Довжина вставки, м (порожнє поле — автоматично)',p.insertOverride,q=>update({insertOverride:q}))}<p>До розрахунку: {format(e.insertLength)} м.{e.insertClamped?' Обмежено залишком стандартного профілю.':''}</p>
    {input(`Кути стандартного профілю, шт. (${p.standard.freeCorners} безкоштовно; далі ${p.standard.cornerPrice} ₴)`,p.standardCorners,q=>update({standardCorners:q}),true)}
  </div>
  {section('Профілі')}{section('Карнизи')}{section('Освітлення основне')}{section('Інше')}
  <div className="panel"><h2>Попередній кошторис кімнати</h2><p className="muted">Ціни зафіксовані в кімнаті. Зміни в каталозі не перераховують її автоматично.</p><button className="button secondary" onClick={refresh}>Оновити тарифи з каталогу</button>{e.rows.map((r,i)=><div className="info-row" key={i}><span>{r.label}</span><b>{money(r.amount)}</b></div>)}<div className="room-area"><span>Разом попередньо</span><strong>{money(e.total)}</strong></div></div>
 </div>
}
