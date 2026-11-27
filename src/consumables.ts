import {categoryOf,num,ledMaterialLength,type CatalogItem,type RoomPricing,type Unit} from './pricing'
export type Method='step'|'point'|'metre'|'manual'
export type Consumable={id:string;name:string;price:string;unit:Unit;method:Method;rate:string;targets:string[];active:boolean}
export type Quantities=Record<string,string>
export const LED_ID='shared-led'
export const groups=[['wall','Усі пристінні профілі'],['cornice','Усі карнизи'],['fn27','FN-27'],['lights','Освітлення (штучні позиції)'],['led','Фактична довжина LED-підсвітки']] as const
export const defaultRules:Consumable[]=[
{id:'wall-fixing',name:'Шуруп + дюбель',price:'',unit:'шт.',method:'step',rate:'8',targets:['wall'],active:true},
{id:'cornice-bracket',name:'Кутик для карниза / FN-27',price:'',unit:'шт.',method:'step',rate:'40',targets:['cornice','fn27'],active:true},
{id:'light-support',name:'Підвіс / кутик для світильника',price:'',unit:'шт.',method:'point',rate:'4',targets:['lights'],active:true},
{id:LED_ID,name:'LED-стрічка',price:'',unit:'м',method:'metre',rate:'1',targets:['led'],active:true}]
export function rulesFromCatalog(catalog:CatalogItem[]):Consumable[]{
 const saved=catalog.find(v=>v.id==='standard-profile')?.consumables
 if(Array.isArray(saved))return saved
 const prices=[...new Set(catalog.map(v=>v.ledPurchasePrice?.trim()).filter((v):v is string=>!!v).map(v=>Number(v.replace(',','.'))).filter(v=>Number.isFinite(v)&&v>=0))]
 return defaultRules.map(r=>({...r,targets:[...r.targets],price:r.id===LED_ID&&prices.length===1?String(prices[0]):r.price}))
}
export const quantityKey=(roomId:string,ruleId:string)=>JSON.stringify([roomId,ruleId])
export type ConsumableNeed={rule:Consumable;quantity:number;key:string;automatic:number}
function override(raw:unknown, fallback:number){if(raw==null||String(raw).trim()==='')return fallback;const n=Number(String(raw).replace(',','.'));return Number.isFinite(n)&&n>=0?n:fallback}
function rounded(n:number){return Math.round(n*1e6)/1e6}
function count(n:number,step:number){return Math.max(0,Math.ceil(n/step-1e-8))}
export function automaticNeeds(p:RoomPricing,perimeter:number,rules:Consumable[],roomId:string,overrides:Quantities={}):ConsumableNeed[]{
 const used=p.items.filter(s=>categoryOf(s.item)==='Профілі'&&s.item.unit==='м').reduce((sum,s)=>sum+num(s.quantity),0)
 const standard=Math.max(0,perimeter-used)
 const elements=[{item:p.standard,q:standard,led:0},...p.items.map(s=>({item:s.item,q:num(s.quantity),led:ledMaterialLength(s)}))]
 return rules.filter(r=>r.active&&r.method!=='manual').flatMap(rule=>{
   const rate=num(rule.rate);if(!rate)return []
   let automatic=0
   for(const {item,q,led} of elements){if(!q)continue
    const cat=categoryOf(item),matches=rule.targets.includes('item:'+item.id)||rule.targets.includes('wall')&&cat==='Профілі'&&item.unit==='м'||rule.targets.includes('cornice')&&cat==='Карнизи'&&item.unit==='м'||rule.targets.includes('fn27')&&item.id==='fn27'&&item.unit==='м'||rule.targets.includes('lights')&&cat==='Освітлення основне'&&item.unit==='шт.'
    const length=rule.targets.includes('led')?led:0
    if(rule.method==='step'){if(matches&&item.unit==='м')automatic+=count(q,rate/100);if(length>0)automatic+=count(length,rate/100)}
    if(rule.method==='point'&&matches&&item.unit==='шт.')automatic+=q*rate
    if(rule.method==='metre'){if(matches&&item.unit==='м')automatic+=q*rate;automatic+=length*rate}
   }
   const key=quantityKey(roomId,rule.id),quantity=rounded(rule.id===LED_ID?automatic:override(overrides[key],automatic))
   return automatic>0||quantity>0||overrides[key]!==undefined?[{rule,quantity,key,automatic:rounded(automatic)}]:[]
 })
}
export function manualNeeds(rules:Consumable[],quantities:Quantities={}):ConsumableNeed[]{return rules.filter(r=>r.active&&r.method==='manual').map(rule=>{const key=quantityKey('',rule.id);return {rule,quantity:rounded(override(quantities[key],0)),key,automatic:0}})}
