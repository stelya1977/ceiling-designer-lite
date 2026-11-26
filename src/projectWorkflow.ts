export type Workflow = { status: string; created: string; measurementDate?: string; archivedAt?: string; completedAt?: string; previousStatus?: string; deposit?: string; finalPayment?: number; discountPercent?: string; roundedEstimate?: boolean }
export const activeStatuses = ['Новий', 'Очікує завдатку', 'Завдаток отримано', 'В роботі', 'Відмовлено']
export function localDate(value?: string) {
  const d = value ? new Date(value) : new Date()
  if (!Number.isFinite(d.getTime())) return localDate()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
export function projectDate(p: Pick<Workflow,'measurementDate'|'created'>) {
  return /^\d{4}-\d{2}-\d{2}$/.test(p.measurementDate || '') ? p.measurementDate! : localDate(p.created)
}
export function amount(value: unknown) { const n=Number(String(value??'').replace(',','.')); return Number.isFinite(n)?Math.max(0,n):0 }
export function payment(base: number, p: Workflow) {
  const percent = Math.min(100,amount(p.discountPercent)), discounted = amount(base)*(1-percent/100)
  const total = p.roundedEstimate ? Math.floor(discounted/100)*100 : Math.round(discounted)
  const deposit=amount(p.deposit), final=amount(p.finalPayment), balance=Math.max(0,total-deposit-final)
  return {total,deposit,final,balance,paid:total>0 && balance===0,percent,discounted}
}
export function archive<T extends Workflow>(p:T, now:string, complete=false):T {
  if(complete) return {...p, previousStatus:p.status==='Виконано'?p.previousStatus:p.status, status:'Виконано', archivedAt:now, completedAt:now}
  return {...p, archivedAt:now}
}
export function restore<T extends Workflow>(p:T):T {
  const {archivedAt,completedAt,previousStatus,...rest}=p
  return {...rest,status:p.status==='Виконано'?(previousStatus&&activeStatuses.includes(previousStatus)?previousStatus:'В роботі'):p.status} as T
}
export function matchesDate(p: Workflow, scope: 'day'|'month'|'year', date:string) {
  return projectDate(p).slice(0,scope==='day'?10:scope==='month'?7:4)===date.slice(0,scope==='day'?10:scope==='month'?7:4)
}
export function calendarDays(month:string) {
  const [y,m]=month.split('-').map(Number)
  const first=new Date(y,m-1,1), count=new Date(y,m,0).getDate(), offset=(first.getDay()+6)%7
  return [...Array.from({length:offset},()=>''),...Array.from({length:count},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`)]
}
export function shiftMonth(month:string, delta:number) {
  const [y,m]=month.split('-').map(Number), d=new Date(y,m-1+delta,1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
