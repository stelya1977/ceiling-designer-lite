export type PayrollRule={prefix:string;mode:'exclude'|'fixed';rate:number}
export type PayrollLine={label:string;quantity:number;unit:string;amount:number}
export type PayrollEstimate={total:number;lines:PayrollLine[]}
export const defaultRules:PayrollRule[]=[
 {prefix:'Блоки живлення',mode:'exclude',rate:0},{prefix:'Блок живлення',mode:'exclude',rate:0},
 ...['Кріплення та встановлення світильників','Монтаж світильників','Встановлення світильників','Монтаж точкових світильників','Кріплення під точкові світильники','Монтаж люстри','Монтаж люстр','Кріплення під люстру','Кріплення та встановлення люстри','Кріплення та встановлення точкових світильників','Встановлення люстри','Встановлення точкових світильників'].map(prefix=>({prefix,mode:'fixed' as const,rate:300}))
]
export const cents=(n:number)=>Math.round((n+Number.EPSILON)*100)
export function jobAmounts(e:PayrollEstimate,rules:PayrollRule[]){
 if(!Number.isFinite(e.total)||e.total<0)throw new Error('Некоректна сума кошторису')
 let excluded=0,fixed=0;const matches:{label:string;amount:number;fixed:number}[]=[]
 const normalized=rules.filter(r=>r.prefix.trim()).map(r=>({...r,key:r.prefix.trim().toLocaleLowerCase('uk-UA')})).sort((a,b)=>b.key.length-a.key.length)
 for(const row of e.lines){if(!Number.isFinite(row.amount)||row.amount<0||!Number.isFinite(row.quantity)||row.quantity<0)throw new Error(`Некоректна позиція: ${row.label}`);const rule=normalized.find(r=>row.label.trim().toLocaleLowerCase('uk-UA').startsWith(r.key));if(!rule)continue
  if(rule.mode==='fixed'&&(row.unit!=='шт.'&&row.unit!=='шт'))throw new Error(`Фіксований тариф «${row.label}» потребує одиниці «шт.»`)
  const add=rule.mode==='fixed'?cents(row.quantity*rule.rate):0;excluded+=cents(row.amount);fixed+=add;matches.push({label:row.label,amount:row.amount,fixed:add/100})
 }
 return {base_cents:Math.max(0,cents(e.total)-excluded),fixed_cents:fixed,matches}
}
export function workerAmounts(base:number,fixed:number,team:string[],worker:string,rate:number){
 const sorted=[...new Set(team)].sort(),index=sorted.indexOf(worker);if(index<0||!sorted.length)throw new Error('Не знайдено учасника монтажу')
 if(!Number.isFinite(rate)||rate<0||rate>100)throw new Error('Некоректний відсоток')
 return {percent_cents:Math.round(base*rate/100),share_cents:Math.floor(fixed/sorted.length)+(index<fixed%sorted.length?1:0)}
}
