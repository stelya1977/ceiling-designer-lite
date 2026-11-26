export type Category = 'Полотна' | 'Профілі' | 'Карнизи' | 'Освітлення основне' | 'Інше'
export type CatalogCategory = Category | 'LED-профілі'
export type Unit = 'м' | 'шт.' | 'м²'
export type CatalogItem = { id: string; category: CatalogCategory; name: string; price: string; unit: Unit; stockLength: string; cornerPrice: string; freeCorners: string; description: string; billStock?: boolean; ledPrice?: string; powerPrice?: string; grillePrice?: string }
export type Selection = { id: string; item: CatalogItem; quantity: string; corners: string; color: 'white'|'black'; ledEnabled: boolean; ledLength: string; ledColor: string; power: string; grilles: string }
export type RoomPricing = { fabric: CatalogItem | null; standard: CatalogItem; insert: CatalogItem; insertColor: 'white'|'black'; insertOverride: string; standardCorners: string; items: Selection[] }
export const categories: Category[] = ['Полотна', 'Профілі', 'Карнизи', 'Освітлення основне', 'Інше']
export const categoryOf = (item: CatalogItem): Category => item.category === 'LED-профілі' ? 'Освітлення основне' : item.category
export const num = (value: unknown) => { const n = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0 }
const item = (id: string, category: Category, name: string, price: string, unit: Unit, extra: Partial<CatalogItem> = {}): CatalogItem => ({id, category, name, price, unit, stockLength:'',cornerPrice:'0',freeCorners:'0',description:'',...extra})
export const baseItems = [item('fabric-msd','Полотна','Полотно MSD Premium','700','м²'), item('standard-profile','Профілі','Стандартний профіль','0','м',{cornerPrice:'400',freeCorners:'4'}), item('decorative-insert','Інше','Декоративна вставка','100','м')]
const defaults: Record<string, Partial<CatalogItem>> = {
  'alutat-fly': {billStock:true, powerPrice:'1000',grillePrice:'900'},
  'shadow-ud': {billStock:false},
  'alutat-sk30': {billStock:true,ledPrice:'250',powerPrice:'600',grillePrice:'900'},
  'fn27': {billStock:true,powerPrice:'1000',grillePrice:'900'},
}
export function effectiveCatalog(raw: CatalogItem[]): CatalogItem[] {
  const list: CatalogItem[] = raw.map(v => ({...defaults[v.id],...v,category:categoryOf(v)}))
  for (const v of baseItems) if (!list.some(x => x.id === v.id)) list.push({...v})
  return list
}
export function snapshot(item: CatalogItem): CatalogItem { return {...item,category:categoryOf(item)} }
export function newPricing(catalog: CatalogItem[]): RoomPricing {
  const get = (id: string) => snapshot(catalog.find(v=>v.id===id) || baseItems.find(v=>v.id===id)!)
  return {fabric:get('fabric-msd'),standard:get('standard-profile'),insert:get('decorative-insert'),insertColor:'white',insertOverride:'',standardCorners:'4',items:[]}
}
export function newSelection(v: CatalogItem, id: string): Selection {
  return {id,item:snapshot(v),quantity:v.unit==='шт.'?'1':'',corners:'0',color:'white',ledEnabled:false,ledLength:'',ledColor:'Тепле 3000K',power:'0',grilles:'0'}
}
export function stockPlan(need: number, text: string): {length:number; bars:{length:number; count:number}[]} {
  if (!(need>0)) return {length:0,bars:[]}
  // Centimetre resolution, integer arithmetic, bounded memory. Prefer fewer bars on ties.
  const bars = [...new Set(text.split(/[;\s]+/).map(num).map(x=>Math.round(x*100)).filter(x=>x>0&&x<=10000))].sort((a,b)=>b-a)
  if (!bars.length) return {length:need,bars:[]}
  const target=Math.ceil(need*100-1e-7), max=target+bars[0]
  if (max>200000) { const n=Math.ceil(target/bars[0]); return {length:n*bars[0]/100,bars:[{length:bars[0]/100,count:n}]} }
  const counts=new Int32Array(max+1).fill(-1), prev=new Int32Array(max+1); counts[0]=0
  for(let i=0;i<=max;i++) if(counts[i]>=0) for(const b of bars) if(i+b<=max&&(counts[i+b]<0||counts[i]+1<counts[i+b])) {counts[i+b]=counts[i]+1;prev[i+b]=b}
  let end=target;while(end<=max&&counts[end]<0)end++
  const tally=new Map<number,number>();for(let i=end;i>0;i-=prev[i]){const b=prev[i];if(!b)break;tally.set(b,(tally.get(b)||0)+1)}
  return {length:end/100,bars:[...tally].map(([length,count])=>({length:length/100,count}))}
}
export type PriceRow = {label:string; amount:number}
export type Material = {label:string; quantity:number; unit:string}
export function calculate(p: RoomPricing, area: number, perimeter: number) {
  const rows: PriceRow[] = [], materials: Material[] = []
  const push = (label:string, amount:number) => {if(amount>0)rows.push({label,amount})}
  const mat = (label:string, quantity:number,unit:string) => {if(quantity>0)materials.push({label,quantity,unit})}
  const fmt=(x:number)=>x.toLocaleString('uk-UA',{maximumFractionDigits:3})
  const used=p.items.filter(s=>categoryOf(s.item)==='Профілі'&&s.item.unit==='м').reduce((sum,s)=>sum+num(s.quantity),0)
  const standardLength=Math.max(0,perimeter-used)
  const insertLength=p.insertOverride===''?standardLength:Math.min(standardLength,num(p.insertOverride))
  if(p.fabric){push(`${p.fabric.name} (${fmt(area)} м²)`,area*num(p.fabric.price));mat(p.fabric.name,area,'м²')}
  if(standardLength>0){const plan=stockPlan(standardLength,p.standard.stockLength);push(`${p.standard.name} (${fmt(standardLength)} м)`,(p.standard.billStock?plan.length:standardLength)*num(p.standard.price)); if(plan.bars.length)plan.bars.forEach(b=>mat(`${p.standard.name} — планка ${fmt(b.length)} м`,b.count,'шт.'));else mat(p.standard.id==='standard-profile'?'Профіль пластиковий':p.standard.name,standardLength,'м');push(`Додаткові кути ${p.standard.name}`,Math.max(0,num(p.standardCorners)-num(p.standard.freeCorners))*num(p.standard.cornerPrice))}
  push(`${p.insert.name} (${fmt(insertLength)} м)`,insertLength*num(p.insert.price));mat(`${p.insert.name} (${p.insertColor==='white'?'біла':'чорна'})`,insertLength,'м')
  for(const s of p.items){const v=s.item,q=num(s.quantity);if(!q)continue;const plan=v.unit==='м'?stockPlan(q,v.stockLength):{length:q,bars:[]};const color=categoryOf(v)==='Карнизи'?` (${s.color==='white'?'білий':'чорний'})`:'';const name=v.name+color;let amount=(v.billStock?plan.length:q)*num(v.price);const corners=num(s.corners);amount+=Math.max(0,corners-num(v.freeCorners))*num(v.cornerPrice); const led=s.ledEnabled?num(s.ledLength):0;amount+=led*num(v.ledPrice)+num(s.power)*num(v.powerPrice)+num(s.grilles)*num(v.grillePrice);push(`${name} (${fmt(q)} ${v.unit})${led>0?` · ${s.ledColor}`:''}`,amount);mat(plan.bars.length?`${name} — монтажна довжина`:name,q,v.unit);if(plan.bars.length)plan.bars.forEach(b=>mat(`${name} — планка ${fmt(b.length)} м`,b.count,'шт.'));mat(`Кути — ${name}`,corners,'шт.');mat(`LED ${s.ledColor} — ${name}`,led,'м');mat(`Блоки живлення — ${name}`,num(s.power),'шт.');mat(`Магнітні решітки — ${name}`,num(s.grilles),'шт.')}
  return {rows,materials,used,standardLength,insertLength,total:rows.reduce((sum,r)=>sum+r.amount,0),overrun:used>perimeter+1e-6,insertClamped:p.insertOverride!==''&&num(p.insertOverride)>standardLength+1e-6}
}
