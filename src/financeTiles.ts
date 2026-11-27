import type {analyticsSlice} from './analyticsMath'
import type {paymentControl} from './paymentControlMath'
import type {businessSummary} from './businessMath'
import type {overheadSummary} from './overhead'
export type FinanceView='report'|'payments'|'analytics'|'overhead'|'payroll'|'transport'|'sales'|'settings'
type Tone='neutral'|'danger'|'warning'|'success'
type Tile={id:FinanceView;label:string;detail:string;tone:Tone}
type Input={totals:ReturnType<typeof analyticsSlice>|null;payments:ReturnType<typeof paymentControl>|null;business:ReturnType<typeof businessSummary>|null;overhead:ReturnType<typeof overheadSummary>|null;baseReady:boolean;synced:boolean;busy:boolean;error:boolean;valid:boolean;travelMissing:number}
const money=(n:number)=>(n/100).toLocaleString('uk-UA',{maximumFractionDigits:2})+' грн'
export function financeTiles(i:Input):Tile[]{
 const {totals:t,payments:p,business:b,overhead:o}=i,missing=i.busy?'Завантаження…':i.error?'Помилка завантаження':!i.valid?'Вибери період':'Немає даних',safe=i.synced&&!i.busy&&!i.error,partial=!safe?' · перевір дані':'',debt=p?.rows.filter(r=>r.state==='debt').length??0,paymentIncomplete=!safe||!!p?.missing||!!p?.rows.some(r=>r.discrepancy||r.state==='noestimate')
 const resultIncomplete=!safe||t?.net==null||!!t?.turnoverIncomplete
 return [
 {id:'report',label:'Фінансовий звіт',tone:t?.net!=null&&t.net<0?'danger':resultIncomplete?'warning':((t?.net??0)>0)?'success':'neutral',detail:!t?missing:t.net===null?'Прибуток не визначено':(t.net>0?'+':'')+money(t.net)+(resultIncomplete?' · перевір дані':'')},
 {id:'payments',label:'Контроль оплат',tone:p?.debt?'danger':paymentIncomplete||!!p?.confirmed?'warning':p?'success':'warning',detail:!p?missing:p.debt?`${debt} об’єктів · борг ${money(p.debt)}`+(paymentIncomplete?' · перевір дані':''):paymentIncomplete?'Перевір повноту оплат':p.confirmed?'Очікується '+money(p.confirmed):'Боргів після монтажу немає'},
 {id:'analytics',label:'Аналітика',tone:!safe||!t||t.areaMissing||t.turnoverIncomplete||t.net===null?'warning':'neutral',detail:t?`${t.count} монтажів · ${t.area.toLocaleString('uk-UA',{maximumFractionDigits:2})} м²${t.areaMissing?' (неповна площа)':''}${partial}`:missing},
 {id:'overhead',label:'Витрати підприємства',tone:!i.synced||!o||o.invalid?'warning':'neutral',detail:o?money(o.total)+(o.invalid?' · неповні дані':!i.synced?' · перевір дані':''):missing},
 {id:'payroll',label:'Зарплати',tone:!safe||!t?'warning':'neutral',detail:t?'Виплачено '+money(t.wages)+partial:missing},
 {id:'transport',label:'Транспортні витрати',tone:!safe||!t||i.travelMissing||!i.baseReady?'warning':'neutral',detail:t?money(t.fuel)+(i.travelMissing?' · неповний розрахунок':!i.baseReady?' · налаштуй базу':partial):missing},
 {id:'sales',label:'Продажі зі складу',tone:b?.saleProfit!=null&&b.saleProfit<0?'danger':!safe||!b||b.missingSales||b.missingWriteoffs||b.missingReceipts||b.unknown?'warning':'neutral',detail:b?'Виручка '+money(b.saleRevenue)+(b.missingSales||b.unknown?' · неповні дані':partial):missing},
 {id:'settings',label:'Налаштування',tone:i.baseReady?'neutral':'warning',detail:i.baseReady?'База та пальне':'Задай базу та розхід'}
 ]
}
