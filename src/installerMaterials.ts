export type InstallerMaterial = {label:string;quantity:number;unit:string}
const format=(n:number)=>n.toLocaleString('uk-UA',{maximumFractionDigits:3})
const stockFormat=(n:string)=>Number(n.replace(',','.')).toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:3})
function normalizeLabel(label:string){
  let s=label.trim().replace(/\s*\((?:м²|м|шт\.)\)\s*$/u,'')
  const stock=s.match(/^(.*?)\s*—\s*планк(?:а|и по)\s+([\d.,]+)\s*м$/iu)
  if(stock){let name=stock[1];const color=name.match(/\s*(\((?:білий|чорний|біла|чорна)\))$/iu);if(color)name=name.slice(0,-color[0].length);if(/^ALUTAT SK 3\.0$/i.test(name))name='Карниз ALUTAT SK 3.0';s=`${name} ${stockFormat(stock[2])} м${color?' '+color[1]:''}`}
  if(/^LED\s/iu.test(s))s=s.replace(/^LED\s*/iu,'LED-стрічка ')
  // Rename only generic mounting items; preserve model/size-specific entries.
  if(/^(?:монтаж|кріплення(?:\s+під|\s+для)?|установка|встановлення)\s+люстр[а-яіїєґ]*$|^люстр[а-яіїєґ]*$/iu.test(s))s='Кріплення під люстру'
  if(/^(?:(?:монтаж|кріплення(?:\s+під|\s+для)?|установка|встановлення)\s+)?точков[а-яіїєґ]*\s+світильник[а-яіїєґ]*$/iu.test(s))s='Кріплення під точкові світильники'
  return s.trim()
}
export function consolidateMaterials(input:InstallerMaterial[]):string[]{
  const stripUnit=(s:string)=>s.replace(/\s*\((?:м²|м|шт\.)\)\s*$/u,'').trim()
  const stockNames=new Set(input.map(m=>stripUnit(m.label).match(/^(.*?)\s*—\s*планк(?:а|и по)\s+[\d.,]+\s*м$/iu)?.[1]).filter(Boolean))
  const totals=new Map<string,InstallerMaterial>()
  for(const m of input){if(!Number.isFinite(m.quantity)||m.quantity<=0)continue;const raw=stripUnit(m.label);const mount=raw.match(/^(.*?)\s*—\s*монтажна довжина$/iu);if(mount&&stockNames.has(mount[1]))continue;
    const label=normalizeLabel(raw),key=JSON.stringify([label,m.unit]);const old=totals.get(key);totals.set(key,{label,unit:m.unit,quantity:(old?.quantity||0)+m.quantity})}
  return [...totals.values()].map(m=>`${m.label} — ${format(m.quantity)} ${m.unit}`)
}
// Compatibility with already-published 0.7.17 tasks. New tasks store a clean list.
export function cleanPublishedMaterials(lines:string[]):string[]{
  const parsed:InstallerMaterial[]=[],other:string[]=[]
  for(const line of lines){const m=line.match(/^(.*?)\s*—\s*([\d\s\u00a0\u202f.,]+)\s*(м²|м|шт\.)$/u);if(m)parsed.push({label:m[1],quantity:Number(m[2].replace(/\s/g,'').replace(',','.')),unit:m[3]});else other.push(line)}
  return [...consolidateMaterials(parsed),...other]
}
