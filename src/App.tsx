import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useCloud, supabase } from './cloud'
import JobPhotos,{hasJobPhotos} from './JobPhotos'
import {ObserverEstimateButton} from './Observer'
import { StaffManager, JobAssignment, type JobPayload } from './Staff'
import OwnerCalendar from './OwnerCalendar'
import Finance from './Finance'
import ObjectFinance from './ObjectFinance'
import {roomNeeds,consumableCostNeeds,type ObjectCosts,type CostNeed} from './objectCost'
import Consumables from './Consumables'
import {rulesFromCatalog,automaticNeeds,manualNeeds,LED_ID,type Consumable,type ConsumableNeed} from './consumables'
import {reviseDeposit,assignDepositDate,kyivDay,type MoneyPart,type CashRow} from './financeMath'
import type {PayrollEstimate} from './payrollMath'
import { consolidateMaterials, type InstallerMaterial } from './installerMaterials'
import RoomComponents from './RoomComponents'
import NumericInput from './NumericInput'
import { metresToCm, cmToMetres, formatCm } from './measurementUnits'
import { solveMeasuredPolygon, solveReferencePolygon, previewReference, fitDrawing, rectangleDrawing, type GeometryResult, type ReferenceResult } from './measuredGeometry'
import { buildContour, contourDrawing, containsContourPoint, hasFeatures, type Features, type ContourResult, type Cutout } from './contourFeatures'

import { activeStatuses, localDate, projectDate, payment, archive, restore, matchesDate, calendarDays, shiftMonth, type Workflow } from './projectWorkflow'
import { categories, categoryOf, effectiveCatalog, newPricing, newSelection, calculate, snapshot, stockPlan, num, type DetailedPriceRow, type CatalogCategory, type CatalogItem, type RoomPricing, type Unit } from './pricing'
import {
  Plus, Search, ChevronRight, House, ClipboardList, Layers3, Settings,
  X, ArrowLeft, Trash2, Ruler, RotateCcw, MapPin, Navigation, ImagePlus, Pencil, Sparkles, Download, Archive, CalendarDays
} from 'lucide-react'

// Keep NumericInput's decimal draft behavior while storing geometry in metres.
function CmInput({value,onChange,placeholder,style}: {value:string|number|undefined;onChange:(value:string)=>void;placeholder?:string;style?:CSSProperties}) {
  return <NumericInput value={metresToCm(value)} onChange={v=>onChange(cmToMetres(v))} placeholder={placeholder} style={style}/>
}

type Side = { id: string; label: string; length: string }
type Point = { x: number; y: number }
type VizMark = { id: string; type: string; x: number; y: number; x2?: number; y2?: number; label: string; color?: string; ledEnabled?: boolean; ledColor?: string; ledPower?: '10' | '14' }
type VizPhoto = { id: string; name: string; data: string; marks: VizMark[] }
type Room = {
  visualization?: {
    photo?: string
    photos?: VizPhoto[]
    activePhotoId?: string
    wallLength?: string
    leftWallLength?: string
    rightWallLength?: string
    leftWindowWidths?: string
    rightWindowWidths?: string
    roomHeight?: string
    ceilingColor?: string
    fabric?: string
    brightness?: number
    marks?: VizMark[]
    wallMode?: 'one' | 'two'
    wallSide?: 'left' | 'right' | 'both'
    curtainLayout?: 'straight' | 'L' | 'two'
    windowWidths?: string
    curtainColor?: string
    curtainLength?: string
    wallColor?: string
    floorColor?: string
    lightingVisibility?: { led: boolean; chandelier: boolean; spots: boolean }
  }
  id: string
  name: string
  canvasNumber?: string
  length?: number
  width?: number
  shape: 'rectangle' | 'polygon'
  sides: Side[]
  vertices?: Point[]
  geometryMode?: 'sketch' | 'measured'
  reference0?: Record<string,string>
  contourFeatures?: Features
  diagonals?: Record<string, string>
  overallWidth?: string
  overallHeight?: string
  estimateAreaMode?: 'real' | 'bounds'
  actualAreaOverride?: string
  pricing?: RoomPricing
  components?: {
    ceiling: 'fabric'
    profile: 'standard' | 'fly' | 'ud'
    insertColor: 'white' | 'black'
    insertLength: string
    profileLength: string
    flyLength: string
    udLength: string
    flyEnabled: boolean
    udEnabled: boolean
    sk30Length: string
    sk30LedLength: string
    sk30Power: string
    sk30Grilles: string
    sk30Items?: { id: string; color: 'white' | 'black'; length: string; ledLength: string; ledEnabled?: boolean; ledColor?: string; power: string; grilles: string }[]
    fn27Length: string
    fn27Power: string
    fn27Grilles: string
    flyGrilles: string
    flyPower: string
    flyCorners: string
    udCorners: string
    standardCorners: string
    catalogItems?: { id: string; catalogId: string; name: string; price: string; unit: 'м' | 'шт.'; quantity: string }[]
  }
}

const CATALOG_KEY = 'nsk-ceiling-designer-catalog-v1'
const defaultCatalog: CatalogItem[] = [
  { id: 'standard-profile', category: 'Профілі', name: 'Стандартний профіль', price: '0', unit: 'м', stockLength: '', cornerPrice: '400', freeCorners: '4', description: 'Декоративна вставка та додаткові кути налаштовуються окремо' },
  { id: 'alutat-fly', category: 'Профілі', name: 'ALUTAT FLY', price: '1200', unit: 'м', stockLength: '2', cornerPrice: '500', freeCorners: '0', description: 'Кут — 500 грн/шт.; блок живлення — 1000 грн/шт.' },
  { id: 'shadow-ud', category: 'Профілі', name: 'Тіньовий профіль UD', price: '500', unit: 'м', stockLength: '2', cornerPrice: '400', freeCorners: '0', description: 'Кут — 400 грн/шт.' },
  { id: 'alutat-sk30', category: 'Карнизи', name: 'ALUTAT SK 3.0', price: '2200', unit: 'м', stockLength: '2; 2.5; 3.2; 3.6', cornerPrice: '0', freeCorners: '0', description: 'LED — 250 грн/м; блок живлення — 600 грн; магнітна решітка — 900 грн' },
  { id: 'fn27', category: 'LED-профілі', name: 'FN-27', price: '2100', unit: 'м', stockLength: '2', cornerPrice: '0', freeCorners: '0', description: 'Закупівля планками по 2 м' }
]
function readCatalog(): CatalogItem[] {
  try {
    const raw = localStorage.getItem(CATALOG_KEY)
    if (!raw) return defaultCatalog
    const saved = JSON.parse(raw) as Partial<CatalogItem>[]
    return saved.map(item => {
      const preset = defaultCatalog.find(v => v.id === item.id)
      return { ...preset, ...item, cornerPrice: item.cornerPrice ?? preset?.cornerPrice ?? '0', freeCorners: item.freeCorners ?? preset?.freeCorners ?? '0' } as CatalogItem
    })
  } catch { return defaultCatalog }
}

type Project = Workflow & {
  id: string
  objectCosts?: ObjectCosts
  workerReceiptId?: string
  depositParts?: MoneyPart[]
  finalParts?: MoneyPart[]
  client: string
  phone: string
  address: string
  city?: string
  locationLat?: number | null
  locationLng?: number | null
  status: string
  created: string
  deposit?: string
  measurementDate?: string
  rooms: Room[]
}

const STORAGE_KEY = 'nsk-ceiling-designer-projects-v1'
const demo: Project[] = [{
  id: 'NSK-001',
  client: 'Демо-об’єкт',
  phone: '068-000-00-00',
  address: 'Коломия',
  status: 'Новий',
  created: new Date().toISOString(),
  rooms: [{ id: 'demo-room', name: 'Вітальня', shape: 'rectangle', sides: [] }]
}]

const makeId = () => crypto.randomUUID()
const regularVertices = (count: number): Point[] =>
  Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / count
    return { x: 180 + 112 * Math.cos(a), y: 112 + 78 * Math.sin(a) }
  })
const geometryCache = new WeakMap<Room, GeometryResult | ReferenceResult>()
function sketchPoints(room: Room): Point[] {
  return room.vertices?.length===room.sides.length ? room.vertices : regularVertices(room.sides.length || 4)
}
function measuredGeometry(room: Room): GeometryResult | ReferenceResult {
  const cached=geometryCache.get(room); if(cached)return cached
  const result=room.reference0 ? solveReferencePolygon(room.sides.map(s=>s.length),room.reference0,room.diagonals||{},sketchPoints(room)) : solveMeasuredPolygon(room.sides.map(s=>s.length),room.diagonals||{},sketchPoints(room))
  geometryCache.set(room,result);return result
}
const featureCache = new WeakMap<Room, ContourResult>()
function roomHasFeatures(room:Room){return hasFeatures(room.contourFeatures||{})}
function featureResult(room:Room):ContourResult|null {
  if(!roomHasFeatures(room))return null
  const cached=featureCache.get(room);if(cached)return cached
  let result:ContourResult
  if(room.shape==='rectangle'){
    const l=Number(room.length),w=Number(room.width)
    result=l>0&&w>0&&!rectangleMismatch(room)?buildContour([{x:0,y:w},{x:0,y:0},{x:l,y:0},{x:l,y:w}],room.contourFeatures!):{ok:false,reason:'Внеси правильні розміри базового прямокутника.'}
  }else{
    const base=room.geometryMode==='measured'?measuredGeometry(room):null
    result=base?.ok?buildContour(base.points,room.contourFeatures!):{ok:false,reason:'Спочатку побудуй базовий контур за сторонами та діагоналями.'}
    if(result.ok&&base?.ok&&'reference' in base&&!containsContourPoint(result,base.reference))result={ok:false,reason:'Точка 0 опинилася поза фактичним контуром або у вирізі. Перевір її розташування.'}
  }
  featureCache.set(room,result);return result
}
function featureDrawing(room:Room,w=360,h=230){const r=featureResult(room);return r?.ok?contourDrawing(r,w,h):null}
function featureTexts(room:Room):string[]{
  const f=room.contourFeatures||{},n=room.shape==='rectangle'?4:room.sides.length,L=(i:number)=>String.fromCharCode(65+i),cm=(v:string)=>v!==''&&Number(v)===0?'0 см':formatCm(v)
  return [...(f.rounds||[]).map(v=>`Кут ${L(v.corner)}: R = ${formatCm(v.radius)}`),...(f.arcs||[]).map(v=>`Дуга ${L(v.side)}${L((v.side+1)%n)}: стріла ${formatCm(v.rise)}, ${v.direction==='out'?'назовні':'всередину'}`),...(f.cutouts||[]).map((v,i)=>`В${i+1}: ${v.kind==='circle'?'Ø '+formatCm(v.width):formatCm(v.width)+' × '+formatCm(v.height)}; ${v.kind==='circle'?'центр':'початковий кут'}: від A уздовж AB ${cm(v.along)}, перпендикулярно від AB усередину ${cm(v.inward)}`),...((f.rounds?.length||f.arcs?.length)?['Сторони і діагоналі — між базовими (умовними) кутами; для дуг сторона означає хорду.']:[])]
}
function drawingPoints(room: Room, width=360, height=230): Point[] {
  const feature=featureDrawing(room,width,height);if(feature)return feature.points
  if(room.shape==='rectangle')return rectangleDrawing(room.length,room.width,width,height)
  const result=room.geometryMode==='measured'?measuredGeometry(room):null
  return fitDrawing(result?.ok?result.points:sketchPoints(room),width,height,30)
}
// The same transform as the outline; curves may change the fitted drawing's bounds.
function referenceDrawing(room:Room,pts:Point[],preview=false):Point|null {
  if(room.shape!=='polygon'||!room.reference0)return null
  const result=room.geometryMode==='measured'?measuredGeometry(room):null
  if(result?.ok&&'reference' in result&&pts.length===result.points.length){
    const a=result.points[0],b=result.points[1],scale=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)/Math.hypot(b.x-a.x,b.y-a.y)
    return {x:pts[0].x+(result.reference.x-a.x)*scale,y:pts[0].y+(result.reference.y-a.y)*scale}
  }
  return preview?previewReference(room.sides[0]?.length,room.reference0.A,room.reference0.B,pts):null
}
function referenceMeasurements(room:Room):{label:string;length:number}[]{
  if(room.shape!=='polygon'||!room.reference0)return []
  return room.sides.map((_,i)=>String.fromCharCode(65+i)).map(k=>({label:k+'0',length:Number(room.reference0?.[k])})).filter(v=>Number.isFinite(v.length)&&v.length>0)
}
function referenceSvg(room:Room,pts:Point[]):string {
  const p=referenceDrawing(room,pts);if(!p)return ''
  return pts.map(v=>`<line x1="${p.x}" y1="${p.y}" x2="${v.x}" y2="${v.y}" stroke="#1671ac" stroke-width="0.8" stroke-dasharray="4 4"/>`).join('')+`<circle cx="${p.x}" cy="${p.y}" r="4" fill="#c00000"/><text x="${p.x+7}" y="${p.y-6}" fill="#c00000" font-size="15" font-weight="bold">0</text>`
}
function unverifiedMeasuredRooms(project: Project): Room[] {
  return project.rooms.filter(r=>(r.shape==='polygon'&&(r.geometryMode==='measured'&&!measuredGeometry(r).ok||!!r.reference0&&(r.geometryMode!=='measured'||!measuredGeometry(r).ok)))||(roomHasFeatures(r)&&!featureResult(r)?.ok))
}
function rectangleMismatch(room: Room): boolean {
  if(room.shape!=='rectangle'||!(Number(room.length)>0)||!(Number(room.width)>0))return false
  const expected=Math.hypot(Number(room.length),Number(room.width))
  return ['A-C','B-D'].some(k=>{const n=Number(room.diagonals?.[k]);return n>0&&Math.abs(n-expected)>0.005000001})
}
function geometryNote(room:Room):string {
  const f=featureResult(room);if(f&&!f.ok)return `УВАГА: ${f.reason}`;
  if(room.shape==='rectangle')return rectangleMismatch(room)?'УВАГА: діагоналі не відповідають прямокутнику. Перевір заміри або обери складну форму.':!(Number(room.length)>0&&Number(room.width)>0)?'Ескіз: не всі розміри внесено.':''
  if(room.geometryMode!=='measured')return 'Ескіз: пропорції за замірами не перевірені.'
  const result=measuredGeometry(room)
  return result.ok?'':`УВАГА: контур не підтверджено. ${result.reason}`
}
const defaultComponents = () => ({
  ceiling: 'fabric' as const,
  profile: 'standard' as const,
  insertColor: 'white' as const,
  insertLength: '',
  profileLength: '',
  flyLength: '',
  udLength: '',
  flyEnabled: false,
  udEnabled: false,
  sk30Length: '',
  sk30LedLength: '',
  sk30Power: '0',
  sk30Grilles: '0',
  sk30Items: [],
  fn27Length: '',
  fn27Power: '0',
  fn27Grilles: '0',
  flyGrilles: '0',
  flyPower: '0',
  flyCorners: '4',
  udCorners: '0',
  standardCorners: '4',
  catalogItems: []
})
const makeSides = (count: number): Side[] =>
  Array.from({ length: count }, (_, i) => ({
    id: makeId(),
    label: `${String.fromCharCode(65 + i)}–${String.fromCharCode(65 + ((i + 1) % count))}`,
    length: ''
  }))

function normalizeProjects(parsed: Project[]): Project[] {
    return parsed.map(p => ({
      ...p,
      rooms: (p.rooms || []).map(r => ({
        ...r,
        shape: r.shape || 'rectangle',
        sides: r.sides || [],
        vertices: r.vertices || (r.shape === 'polygon' ? regularVertices((r.sides || []).length || 4) : undefined),
        diagonals: r.diagonals || {},
        components: {
          ...defaultComponents(),
          ...(r.components || {}),
          flyEnabled: r.components?.flyEnabled ?? r.components?.profile === 'fly',
          udEnabled: r.components?.udEnabled ?? r.components?.profile === 'ud',
          flyLength: r.components?.flyLength ?? (r.components?.profile === 'fly' ? r.components?.profileLength || '' : ''),
          udLength: r.components?.udLength ?? (r.components?.profile === 'ud' ? r.components?.profileLength || '' : ''),
          sk30Items: (r.components?.sk30Items || []).map(item => ({ ...item, ledEnabled: item.ledEnabled ?? Number(item.ledLength || 0) > 0, ledColor: item.ledColor || 'Тепле 3000K' }))
        }
      }))
    }))
}

function readProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeProjects(JSON.parse(raw) as Project[]) : demo
  } catch { return demo }
}

function escapeHtml(value: unknown) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }

// The object label is separate from the customer's identity. Legacy addresses
// can supply an editable initial label without rewriting saved records.
function projectCity(project: Pick<Project, 'city' | 'address'>) {
  return project.city?.trim() || project.address?.split(',')[0]?.trim() || ''
}
function projectObjectName(project: Pick<Project, 'city' | 'address' | 'client' | 'id'>) {
  return projectCity(project) || project.client?.trim() || project.id || 'Об’єкт'
}

function exportName(project: Project, kind: string) {
  const [, month, day] = projectDate(project).split('-')
  const name = ((kind === 'Розкрій' || kind === 'Монтаж') ? projectObjectName(project) : (project.client || project.id || 'Об’єкт')).replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/g,'').slice(0,100) || 'Об’єкт'
  return `${name} ${day}${month} - ${kind}`
}
function formatNumber(n: number) {
  return n.toFixed(2).replace('.', ',')
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>(readProjects)
  const [catalog, setCatalog] = useState<CatalogItem[]>(readCatalog)
  const availableCatalog = useMemo(() => effectiveCatalog(catalog), [catalog])
  const consumableRules=useMemo(()=>rulesFromCatalog(catalog),[catalog])
  const [consumablesPage,setConsumablesPage]=useState(false)
  function saveConsumables(rules:Consumable[]){setCatalog(items=>effectiveCatalog(items).map(item=>item.id==='standard-profile'?{...item,consumables:rules}:item))}
  const [catalogPage, setCatalogPage] = useState(false)
  const [ownerPage,setOwnerPage]=useState<'staff'|'mounts'|'finance'|null>(null)
  const [catalogCategory, setCatalogCategory] = useState<CatalogCategory>('Профілі')
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null)
  const emptyCatalogDraft = { category: 'Профілі' as CatalogCategory, name: '', price: '', purchasePrice: '', cornerPurchasePrice: '', ledPurchasePrice: '', powerPurchasePrice: '', grillePurchasePrice: '', unit: 'м' as Unit, stockLength: '', cornerPrice: '0', freeCorners: '0', description: '', billStock: false, ledPrice: '', powerPrice: '', grillePrice: '' }
  const [catalogDraft, setCatalogDraft] = useState(emptyCatalogDraft)
  const [query, setQuery] = useState('')
  const [projectView, setProjectView] = useState<'active'|'archive'|'calendar'>('active')
  const [archiveFilter, setArchiveFilter] = useState<'all'|'paid'|'unpaid'>('all')
  const [calendarMonth, setCalendarMonth] = useState(localDate().slice(0,7))
  const [calendarDate, setCalendarDate] = useState(localDate())
  const [calendarScope, setCalendarScope] = useState<'day'|'month'|'year'>('month')
  const [calendarYear, setCalendarYear] = useState(localDate().slice(0,4))
  const [calendarFilter, setCalendarFilter] = useState<'all'|'active'|'archive'>('all')
  const [measurementDate, setMeasurementDate] = useState(localDate())
  const [creating, setCreating] = useState(false)
  const [active, setActive] = useState<Project | null>(null)
  const [financeProjectId,setFinanceProjectId]=useState<string|null>(null)
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [roomSection, setRoomSection] = useState<'measurements' | 'components' | 'visualization'>('measurements')
  const [selectedVizTool, setSelectedVizTool] = useState('Карниз / ніша SK 3.0')
  const [pendingVizPoint, setPendingVizPoint] = useState<{ x: number; y: number } | null>(null)
  const [editingVizMarkId, setEditingVizMarkId] = useState<string | null>(null)
  const [hiddenVizTypes, setHiddenVizTypes] = useState<string[]>([])
  const [vizStep, setVizStep] = useState(2)
  const [client, setClient] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [locationOpen, setLocationOpen] = useState(false)
  const [locationAddress, setLocationAddress] = useState('')
  const [locationLat, setLocationLat] = useState<number | null>(null)
  const [locationLng, setLocationLng] = useState<number | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [estimateProject, setEstimateProject] = useState<Project | null>(null)
  const [estimateReturnToCreate, setEstimateReturnToCreate] = useState(false)
  const [discountOpen, setDiscountOpen] = useState(false)
  const discountPercent = estimateProject?.discountPercent || '0'
  const roundedEstimate = !!estimateProject?.roundedEstimate

  const [networkOnline, setNetworkOnline] = useState(navigator.onLine)
  const [offlineReady, setOfflineReady] = useState(!!navigator.serviceWorker?.controller)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  useEffect(() => {
    const networkChanged = () => setNetworkOnline(navigator.onLine)
    const shellChanged = () => {
      setOfflineReady(!!navigator.serviceWorker?.controller)
      navigator.serviceWorker?.controller?.postMessage({type:'CEILING_VERSION'})
    }
    const versionMessage = (event: MessageEvent) => {
      if (event.source === navigator.serviceWorker?.controller && event.data?.type === 'CEILING_VERSION') {
        setUpdateAvailable(event.data.version !== '0.7.45')
      }
    }
    window.addEventListener('online', networkChanged)
    window.addEventListener('offline', networkChanged)
    navigator.serviceWorker?.addEventListener('controllerchange', shellChanged)
    navigator.serviceWorker?.addEventListener('message', versionMessage)
    networkChanged(); shellChanged()
    return () => {
      window.removeEventListener('online', networkChanged)
      window.removeEventListener('offline', networkChanged)
      navigator.serviceWorker?.removeEventListener('controllerchange', shellChanged)
      navigator.serviceWorker?.removeEventListener('message', versionMessage)
    }
  }, [])
  const [storageWarning, setStorageWarning] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
      localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog))
      setStorageWarning('')
    } catch { setStorageWarning('Не вдалося зберегти всі дані в браузері. Не закривай сторінку до успішної синхронізації.') }
  }, [projects, catalog])
  const cloud = useCloud({ projects, catalog }, next => {
    // Keep the same storage keys and existing local data format.
    const oldProjects = localStorage.getItem(STORAGE_KEY)
    const oldCatalog = localStorage.getItem(CATALOG_KEY)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.projects))
      localStorage.setItem(CATALOG_KEY, JSON.stringify(next.catalog))
    } catch (e) {
      try {
        if (oldProjects === null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, oldProjects)
        if (oldCatalog === null) localStorage.removeItem(CATALOG_KEY); else localStorage.setItem(CATALOG_KEY, oldCatalog)
      } catch { /* live data remains intact */ }
      throw e
    }
    setProjects(next.projects); setCatalog(next.catalog)
    setActive(prev => prev ? next.projects.find(p => p.id === prev.id) || null : null)
    setEstimateProject(prev => prev ? next.projects.find(p => p.id === prev.id) || null : null)
    setEditingCatalogId(null)
  }, w => w.projects.length === 1 && w.projects[0].id === 'NSK-001'
    && JSON.stringify(normalizeProjects([{ ...w.projects[0], created: '' }])) === JSON.stringify(normalizeProjects([{ ...demo[0], created: '' }]))
    && JSON.stringify(w.catalog) === JSON.stringify(defaultCatalog))
  async function submitCloudLogin(e: React.FormEvent) {
    e.preventDefault(); setLoginBusy(true); setLoginError('')
    try { await cloud.login(loginEmail, loginPassword); setLoginPassword(''); setLoginOpen(false) }
    catch (err) { setLoginError(err instanceof Error ? err.message : String(err)) }
    finally { setLoginBusy(false) }
  }
  function downloadLocalBackup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ projects, catalog }, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `ceiling-backup-${new Date().toISOString().slice(0,10)}.json`; a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function projectPayment(p: Project) {
    return payment(estimateRows(p).reduce((sum,section)=>sum+section.total,0),p)
  }
  const liveProjects = projects.filter(p=>!p.archivedAt)
  const archivedProjects = projects.filter(p=>!!p.archivedAt)
  const calendarKey = calendarScope==='year'?calendarYear:calendarScope==='month'?calendarMonth:calendarDate
  const selectedProjects = projectView==='active'?liveProjects:projectView==='archive'?archivedProjects.filter(p=>archiveFilter==='all'||(!!p.completedAt&&(archiveFilter==='paid'?projectPayment(p).paid:!projectPayment(p).paid))):projects.filter(p=>matchesDate(p,calendarScope,calendarKey)&&(calendarFilter==='all'||(calendarFilter==='archive'?!!p.archivedAt:!p.archivedAt)))
  const filtered = selectedProjects.filter(p=>`${p.client} ${p.phone} ${p.address} ${p.city || ''} ${p.id}`.toLowerCase().includes(query.toLowerCase()))
  const unpaidProjects = archivedProjects.filter(p=>p.completedAt&&!projectPayment(p).paid)
  const debts = unpaidProjects.reduce((sum,p)=>sum+projectPayment(p).balance,0)
  function navigateProjects(view:'active'|'archive'|'calendar') {
    if(creating && (client.trim()||phone.trim()||address.trim()||city.trim()||roomName.trim()||rooms.length) && !confirm('Вийти зі створення об’єкта? Незбережена чернетка буде втрачена.'))return
    setOwnerPage(null);setProjectView(view);setCatalogPage(false);setCreating(false);setEstimateProject(null);setActive(null);setActiveRoomId(null);setQuery('')
  }
  function navigateOwner(page:'staff'|'mounts'|'finance') {
    if(creating && (client.trim()||phone.trim()||address.trim()||city.trim()||roomName.trim()||rooms.length) && !confirm('Вийти зі створення об’єкта? Незбережена чернетка буде втрачена.'))return
    setOwnerPage(page);setCatalogPage(false);setCreating(false);setEstimateProject(null);setActive(null);setActiveRoomId(null);setQuery('')
  }
  function openFinanceProject(id:string) {
    const p=projects.find(p=>p.id===id);if(!p){alert('Об’єкта немає у локальних даних. Синхронізуй програму.');return}
    setOwnerPage(null);setProjectView(p.archivedAt?'archive':'active');setActiveRoomId(null);setActive(p)
  }
  function dateLegacyPayment(row:CashRow,day:string,totalCents:number){
    if(row.kind==='worker')return
    if(cloud.status!=='Синхронізовано'){alert('Спочатку синхронізуй програму.');return}
    setProjects(prev=>prev.map(p=>p.id!==row.id?p:row.kind==='deposit'?{...p,depositParts:assignDepositDate(p.deposit,p.depositParts,day)}:{...p,finalParts:assignDepositDate(totalCents/100,p.finalParts,day)}))
  }
  function archiveActive(complete:boolean) {
    if(!active || active.archivedAt)return
    if(!confirm(complete?'Позначити об’єкт виконаним і перенести в архів?':'Перенести об’єкт в архів без позначки виконання?'))return
    syncProject(archive(active,new Date().toISOString(),complete))
    setProjectView('archive');setArchiveFilter('all')
  }
  function markPayment(p:Project, paid:boolean) {
    const info=projectPayment(p)
    if(!p.completedAt || (paid && info.total<=0))return
    if(p.workerReceiptId){alert('Оплату отримав монтажник. Запис збережено в обліку працівників.');return}
    if(!confirm(paid?`Підтвердити отримання залишку ${money(info.balance)}?`:'Скасувати позначку остаточної оплати? Завдаток залишиться.'))return
    const finalPayment=paid?info.final+info.balance:0
    syncProject({...p,finalPayment,finalParts:reviseDeposit(info.final,p.finalParts,finalPayment,kyivDay(new Date().toISOString())!)})
  }

  function resetForm() {
    setClient('')
    setPhone('')
    setAddress('')
    setCity('')
    setMeasurementDate(localDate())
    setRooms([])
    setRoomName('')
  }

  function addRoom() {
    const name = roomName.trim()
    if (!name) return
    setRooms(prev => [...prev, {
      id: makeId(), name, shape: 'rectangle', sides: makeSides(4), vertices: regularVertices(4), diagonals: {}, components: defaultComponents(), pricing: newPricing(availableCatalog)
    }])
    setRoomName('')
  }

  function saveProject() {
    if (!client.trim()) return
    const p: Project = {
      id: `NSK-${String(Date.now()).slice(-6)}`,
      client: client.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      status: 'Новий',
      created: new Date().toISOString(),
      measurementDate: measurementDate || localDate(),
      rooms
    }
    setProjects(prev => [p, ...prev])
    setCreating(false)
    resetForm()
    setActive(p)
  }

  function syncProject(updated: Project) {
    setActive(updated)
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  async function deleteProject(id: string) {
    if(projects.find(p=>p.id===id)?.workerReceiptId){alert('Об’єкт має зареєстровану оплату монтажника. Його не можна видалити з історії.');return}
    if (!confirm('Видалити цей об’єкт разом з усіма кімнатами та розрахунками? Завдання монтажників також буде відкликано.')) return
    if (!cloud.session || !networkOnline) { alert('Для видалення об’єкта потрібен інтернет: спочатку треба відкликати завдання монтажників.'); return }
    try { if(await hasJobPhotos(cloud.session.user.id,id)){alert('Спочатку видали фото виконаних робіт з об’єкта.');return} } catch(e){alert('Не вдалося перевірити фото. Видалення зупинено.');return}
    const removed = await supabase.from('ceiling_jobs').delete().eq('owner_id',cloud.session.user.id).eq('project_id',id)
    if (removed.error) { alert('Не вдалося відкликати завдання: '+removed.error.message); return }
    setProjects(prev => prev.filter(p => p.id !== id))
    setActive(null)
    setActiveRoomId(null)
  }

  function openLocation() {
    if (!active) return
    setLocationAddress(active.address || '')
    setLocationLat(active.locationLat ?? null)
    setLocationLng(active.locationLng ?? null)
    setLocationOpen(true)
  }

  function saveLocation() {
    if (!active) return
    syncProject({ ...active, address: locationAddress.trim(), locationLat, locationLng })
    setLocationOpen(false)
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      alert('Цей браузер не підтримує визначення геолокації.')
      return
    }
    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocationLat(position.coords.latitude)
        setLocationLng(position.coords.longitude)
        setLocationLoading(false)
      },
      error => {
        setLocationLoading(false)
        alert(error.code === 1 ? 'Надай браузеру дозвіл на доступ до геолокації.' : 'Не вдалося визначити місцезнаходження. Спробуй ще раз або введи адресу вручну.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  function locationMapUrl() {
    if (locationLat !== null && locationLng !== null) return `https://www.google.com/maps/search/?api=1&query=${locationLat},${locationLng}`
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationAddress.trim())}`
  }

  function saveActiveProject() {
    if (!active) return
    setProjects(prev => {
      const exists = prev.some(p => p.id === active.id)
      return exists ? prev.map(p => p.id === active.id ? active : p) : [active, ...prev]
    })
    alert('Об’єкт збережено.')
  }

  function addRoomToActiveProject() {
    if (!active) return
    const enteredName = window.prompt('Введи назву нової кімнати:')
    const name = enteredName?.trim()
    if (!name) return
    const newRoom: Room = {
      id: makeId(),
      name,
      shape: 'rectangle',
      sides: makeSides(4),
      vertices: regularVertices(4),
      diagonals: {},
      components: defaultComponents(), pricing: newPricing(availableCatalog)
    }
    const updated: Project = { ...active, rooms: [...active.rooms, newRoom] }
    syncProject(updated)
    setActiveRoomId(newRoom.id)
  }

  function updateEstimateDeposit(value: string) {
    if (!estimateProject) return
    const updated = { ...estimateProject, deposit: value, depositParts:reviseDeposit(estimateProject.deposit,estimateProject.depositParts,value,kyivDay(new Date().toISOString())!) }
    setEstimateProject(updated)
    if (estimateProject.id !== 'Чернетка') {
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
      setActive(prev => prev?.id === updated.id ? updated : prev)
    }
  }

  const activeRoom = active?.rooms.find(r => r.id === activeRoomId)
  const editorPoints=activeRoom&&activeRoom.shape==='polygon'?(activeRoom.geometryMode==='measured'?drawingPoints(activeRoom):sketchPoints(activeRoom)):[]

  function updateRoom(roomId: string, patch: Partial<Room>) {
    if (!active) return
    const updated = {
      ...active,
      rooms: active.rooms.map(r => r.id === roomId ? { ...r, ...patch } : r)
    }
    syncProject(updated)
  }

  function updateVertex(room: Room, index: number, point: Point) {
    const vertices = room.vertices || regularVertices(room.sides.length || 4)
    updateRoom(room.id, { vertices: vertices.map((v, i) => i === index ? point : v) })
  }

  function updateSide(room: Room, sideId: string, value: string) {
    updateRoom(room.id, {
      sides: room.sides.map(s => s.id === sideId ? { ...s, length: value } : s)
    })
  }

  function updateComponents(room: Room, patch: Partial<NonNullable<Room['components']>>) {
    updateRoom(room.id, { components: { ...defaultComponents(), ...(room.components || {}), ...patch } })
  }

  function positiveAreaNumber(value: unknown): number | null {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  function actualRoomArea(room: Room): number | null {
    const feature=featureResult(room);if(feature)return feature.ok?(room.actualAreaOverride?positiveAreaNumber(room.actualAreaOverride):feature.area):null
    if (room.shape === 'rectangle') return room.length && room.width ? room.length * room.width : null
    if (room.actualAreaOverride != null && room.actualAreaOverride !== '') return positiveAreaNumber(room.actualAreaOverride)
    if(room.geometryMode==='measured'){const result=measuredGeometry(room);return result.ok?result.area:null}
    return polygonArea(room)
  }

  function boundsRoomArea(room: Room): number | null {
    const width = positiveAreaNumber(room.overallWidth), height = positiveAreaNumber(room.overallHeight)
    if (width === null || height === null) return null
    return positiveAreaNumber(width * height)
  }

  function roomArea(room: Room): number | null {
    return (room.shape === 'polygon'||roomHasFeatures(room)) && room.estimateAreaMode === 'bounds' ? boundsRoomArea(room) : actualRoomArea(room)
  }

  function missingBounds(project: Project): boolean {
    return project.rooms.some(room => (room.shape === 'polygon'||roomHasFeatures(room)) && room.estimateAreaMode === 'bounds' && boundsRoomArea(room) === null)
  }

  function roomPerimeter(room: Room) {
    const feature=featureResult(room);if(feature)return feature.ok?feature.perimeter:null
    if (room.shape === 'rectangle') return room.length && room.width ? 2 * (room.length + room.width) : null
    return room.sides.length && room.sides.every(side => Number(side.length) > 0)
      ? room.sides.reduce((sum, side) => sum + Number(side.length), 0)
      : null
  }

  function projectCostNeeds(p:Project) {
    const needs:CostNeed[]=[],warnings:string[]=[],adjustments:{room:string;item:ConsumableNeed}[]=[]
    for(const r of p.rooms){
      const area=actualRoomArea(r),perimeter=roomPerimeter(r)
      if(area===null||!(area>0)||perimeter===null||!(perimeter>0))warnings.push(`${r.name}: перевір фактичну площу та периметр.`)
      // Legacy rooms must be reviewed in the modern component editor before fixing costs.
      if(!r.pricing){warnings.push(`${r.name}: старий формат комплектуючих. Переведи кімнату на новий каталог і перевір кількості перед розрахунком.`);continue}
      const result=roomNeeds(r.id,r.name,r.pricing,area||0,perimeter||0)
      needs.push(...result.needs)
      const auto=automaticNeeds(r.pricing,perimeter||0,consumableRules,r.id,p.objectCosts?.consumableQuantities)
      needs.push(...consumableCostNeeds(r.id,r.name,auto))
      adjustments.push(...auto.filter(n=>n.rule.id!==LED_ID).map(item=>({room:r.name,item})))
      if(result.overrun)warnings.push(`${r.name}: довжина профілів перевищує периметр.`)
    }
    if(!p.rooms.length)warnings.push('У об’єкті немає кімнат.')
    const manual=manualNeeds(consumableRules,p.objectCosts?.consumableQuantities)
    needs.push(...consumableCostNeeds('','Весь об’єкт',manual))
    adjustments.push(...manual.map(item=>({room:'Весь об’єкт',item})))
    return {needs,warnings,adjustments}
  }

  function money(value: number) {
    return `${Math.round(value).toLocaleString('uk-UA')} ₴`
  }

  function convertLegacyRoom(room: Room): RoomPricing {
    const c = {...defaultComponents(), ...(room.components || {})}
    const oldCatalog = effectiveCatalog(defaultCatalog)
    const result = newPricing(oldCatalog)
    result.insertColor=c.insertColor; result.insertOverride=c.insertLength ?? ''; result.standardCorners=c.standardCorners || '4'
    const add = (id:string, quantity:string, patch: Partial<ReturnType<typeof newSelection>> = {}) => {
      const item = oldCatalog.find(x=>x.id===id)
      if(item && num(quantity)>0) result.items.push({...newSelection(item,makeId()),quantity,...patch})
    }
    if(c.flyEnabled) add('alutat-fly',c.flyLength,{corners:c.flyCorners,power:c.flyPower,grilles:c.flyGrilles})
    if(c.udEnabled) add('shadow-ud',c.udLength,{corners:c.udCorners})
    for(const item of c.sk30Items || []) add('alutat-sk30',item.length,{color:item.color,ledEnabled:item.ledEnabled ?? num(item.ledLength)>0,ledLength:item.ledLength,ledColor:item.ledColor||'Тепле 3000K',power:item.power,grilles:item.grilles})
    add('fn27',c.fn27Length,{power:c.fn27Power,grilles:c.fn27Grilles})
    for(const item of c.catalogItems||[]) result.items.push({...newSelection({id:item.catalogId,category:'Інше',name:item.name,price:item.price,unit:item.unit,stockLength:'',cornerPrice:'0',freeCorners:'0',description:''},item.id),quantity:item.quantity})
    return result
  }

  function componentEstimate(room: Room) {
    const c = { ...defaultComponents(), ...(room.components || {}) }
    const area = roomArea(room) || 0
    const perimeter = roomPerimeter(room) || 0
    const fabric = area * 700
    const insert = Number(c.insertLength || 0) * 100
    const enteredFlyLength = Number(c.flyLength || 0)
    const enteredUdLength = Number(c.udLength || 0)
    const fly = c.flyEnabled ? Math.ceil(enteredFlyLength / 2) * 2 * 1200 : 0
    const ud = c.udEnabled ? enteredUdLength * 500 : 0
    const standardCorners = Math.max(0, Number(c.standardCorners || 4) - 4) * 400
    const flyCornersCost = c.flyEnabled ? Math.max(0, Number(c.flyCorners || 0)) * 500 : 0
    const udCornersCost = c.udEnabled ? Math.max(0, Number(c.udCorners || 0)) * 400 : 0
    const corners = standardCorners + flyCornersCost + udCornersCost
    const skItems = c.sk30Items || []
    const skDetails = skItems.map(item => ({ ...item, stock: sk30StockLength(Number(item.length || 0)), total: sk30StockLength(Number(item.length || 0)) * 2200
      + ((item.ledEnabled ?? Number(item.ledLength || 0) > 0) ? Number(item.ledLength || 0) * 250 : 0)
      + Number(item.power || 0) * 600 + Number(item.grilles || 0) * 900 }))
    const sk = skDetails.reduce((sum, item) => sum + item.total, 0)
    const fnLength = Number(c.fn27Length || 0)
    const fn27 = Math.ceil(fnLength / 2) * 2 * 2100
    const fn27Power = Number(c.fn27Power || 0) * 1000
    const fn27Grilles = Number(c.fn27Grilles || 0) * 900
    const flyPower = Number(c.flyPower || 0) * 1000
    const flyGrilles = c.flyEnabled ? Number(c.flyGrilles || 0) * 900 : 0
    const catalogItems = c.catalogItems || []
    const catalogItemsTotal = catalogItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0)
    return { area, perimeter, fabric, profile: fly + ud, fly, ud, corners, standardCorners, flyCornersCost, udCornersCost, sk, skDetails, fn27, fn27Power, fn27Grilles, flyPower, flyGrilles, insert, catalogItems, catalogItemsTotal, profileLength: enteredFlyLength + enteredUdLength, insertLength: Number(c.insertLength || 0), total: fabric + insert + fly + ud + corners + sk + fn27 + fn27Power + fn27Grilles + flyPower + flyGrilles + catalogItemsTotal }
  }

  function estimateRows(project: Project) {
    return project.rooms.map(room => {
      if(room.pricing){const e=calculate(room.pricing,roomArea(room)||0,roomPerimeter(room)||0);return {room,rows:e.rows,detailedRows:e.detailedRows,total:e.total}}
      const e = componentEstimate(room)
      const rows: { label: string; amount: number }[] = []
      if (e.fabric > 0) rows.push({ label: `Полотно MSD Premium (${formatNumber(e.area)} м²)`, amount: e.fabric })
      if (e.insert > 0) rows.push({ label: `Декоративна вставка (${formatNumber(e.insertLength)} пог. м)`, amount: e.insert })
      if (e.fly > 0) rows.push({ label: `ALUTAT FLY (${formatNumber(Number(room.components?.flyLength || 0))} пог. м; закупівля планками по 2 м)`, amount: e.fly })
      if (e.flyCornersCost > 0) rows.push({ label: `Кути FLY (${room.components?.flyCorners || 0} шт.)`, amount: e.flyCornersCost })
      if (e.flyPower > 0) rows.push({ label: `Блоки живлення FLY (${room.components?.flyPower || 0} шт.)`, amount: e.flyPower })
      if (e.flyGrilles > 0) rows.push({ label: `Магнітні решітки FLY (${room.components?.flyGrilles || 0} шт.)`, amount: e.flyGrilles })
      if (e.ud > 0) rows.push({ label: `Тіньовий профіль UD (${formatNumber(Number(room.components?.udLength || 0))} пог. м)`, amount: e.ud })
      if (e.udCornersCost > 0) rows.push({ label: `Кути UD (${room.components?.udCorners || 0} шт.)`, amount: e.udCornersCost })
      if (e.standardCorners > 0) rows.push({ label: 'Додаткові кути стандартного профілю', amount: e.standardCorners })
      e.skDetails.filter(item => item.total > 0).forEach((item, i) => rows.push({ label: `Карниз SK 3.0 №${i+1} (${item.color === 'white' ? 'білий' : 'чорний'}${(item.ledEnabled ?? Number(item.ledLength || 0) > 0) ? `, підсвітка ${item.ledColor || 'Тепле 3000K'}` : ', без підсвітки'}) та аксесуари`, amount: item.total }))
      if (e.fn27 > 0) rows.push({ label: `LED-профіль FN-27 (${formatNumber(Number(room.components?.fn27Length || 0))} пог. м)`, amount: e.fn27 })
      if (e.fn27Power > 0) rows.push({ label: `Блоки живлення FN-27 (${room.components?.fn27Power || 0} шт.)`, amount: e.fn27Power })
      if (e.fn27Grilles > 0) rows.push({ label: `Магнітні решітки FN-27 (${room.components?.fn27Grilles || 0} шт.)`, amount: e.fn27Grilles })
      e.catalogItems.filter(item => Number(item.quantity || 0) > 0).forEach(item => rows.push({ label: `${item.name} (${item.quantity} ${item.unit})`, amount: Number(item.price || 0) * Number(item.quantity || 0) }))
      const c = {...defaultComponents(), ...(room.components || {})}
      const detailedRows: DetailedPriceRow[] = []
      const detail = (label:string, quantity:number, unit:string, unitPrice:number, amount=quantity*unitPrice) => {if(amount>0)detailedRows.push({label,quantity,unit,unitPrice,amount})}
      detail('Полотно MSD Premium',e.area,'м²',700,e.fabric)
      detail(`Декоративна вставка (${c.insertColor==='black'?'чорна':'біла'})`,e.insertLength,'м',100,e.insert)
      detail(`ALUTAT FLY (монтаж ${formatNumber(num(c.flyLength))} м)`,Math.ceil(num(c.flyLength)/2)*2,'м',1200,e.fly)
      detail('Кути FLY',num(c.flyCorners),'шт.',500,e.flyCornersCost)
      detail('Блоки живлення FLY',num(c.flyPower),'шт.',1000,e.flyPower)
      detail('Магнітні решітки FLY',num(c.flyGrilles),'шт.',900,e.flyGrilles)
      detail('Тіньовий профіль UD',num(c.udLength),'м',500,e.ud)
      detail('Кути UD',num(c.udCorners),'шт.',400,e.udCornersCost)
      detail('Додаткові кути стандартного профілю',Math.max(0,Number(c.standardCorners || 4)-4),'шт.',400,e.standardCorners)
      e.skDetails.filter(item=>item.total>0).forEach((item,i)=>detail(`Карниз SK 3.0 №${i+1} (${item.color==='white'?'білий':'чорний'}, ${formatNumber(num(item.length))} м) та аксесуари`,1,'компл.',item.total))
      detail(`LED-профіль FN-27 (монтаж ${formatNumber(num(c.fn27Length))} м)`,Math.ceil(num(c.fn27Length)/2)*2,'м',2100,e.fn27)
      detail('Блоки живлення FN-27',num(c.fn27Power),'шт.',1000,e.fn27Power)
      detail('Магнітні решітки FN-27',num(c.fn27Grilles),'шт.',900,e.fn27Grilles)
      e.catalogItems.forEach(item=>detail(item.name,Number(item.quantity||0),item.unit,Number(item.price||0)))
      return { room, rows, detailedRows, total: rows.reduce((sum, row) => sum + row.amount, 0) }
    })
  }

  // Payroll uses the private synchronized estimate, not the worker packing list.
  function payrollEstimate(raw: unknown): PayrollEstimate {
    const project=raw as Project
    if(!project||!Array.isArray(project.rooms))throw new Error('Некоректний кошторис для зарплати')
    const sections=estimateRows(project)
    const lines=sections.flatMap(section=>{
      const room=section.room
      if(room.pricing){
        const zero=room.pricing.items.filter(s=>num(s.quantity)>0&&num(s.item.price)===0).map(s=>({label:s.item.name,quantity:num(s.quantity),unit:s.item.unit,unitPrice:0,amount:0}))
        return [...section.detailedRows,...zero]
      }
      const e=componentEstimate(room)
      const rows=section.detailedRows.filter(r=>!/^Карниз SK 3\.0 №/.test(r.label))
      const detail=(label:string,quantity:number,unit:string,unitPrice:number)=>{if(quantity>0)rows.push({label,quantity,unit,unitPrice,amount:quantity*unitPrice})}
      for(const item of e.skDetails){const name=`ALUTAT SK 3.0 (${item.color==='white'?'білий':'чорний'})`;detail(name,item.stock,'м',2200);if(item.ledEnabled??num(item.ledLength)>0)detail(`LED ${item.ledColor||'Тепле 3000K'} — ${name}`,num(item.ledLength),'м',250);detail(`Блоки живлення — ${name}`,num(item.power),'шт.',600);detail(`Магнітні решітки — ${name}`,num(item.grilles),'шт.',900)}
      for(const item of e.catalogItems)if(num(item.price)===0)detail(item.name,num(item.quantity),item.unit,0)
      return rows
    })
    return {total:projectPayment(project).total,lines}
  }

  function openEstimate(project: Project, fromCreate = false) {
    setEstimateProject({ ...project, measurementDate: projectDate(project) })
    setEstimateReturnToCreate(fromCreate)
    setDiscountOpen(false)
  }

  function updateEstimateTerms(percent:string,rounded:boolean) {
    if(!estimateProject)return
    const updated={...estimateProject,discountPercent:percent,roundedEstimate:rounded}
    setEstimateProject(updated)
    if(updated.id!=='Чернетка'){setProjects(prev=>prev.map(p=>p.id===updated.id?updated:p));setActive(prev=>prev?.id===updated.id?updated:prev)}
  }

  function formatMeasurementDate(value?: string) {
    if (!value) return new Date().toLocaleDateString('uk-UA')
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('uk-UA')
  }

  function exportEstimate(format: 'pdf' | 'jpeg', detailed = false) {
    if (!estimateProject) return
    if(unverifiedMeasuredRooms(estimateProject).length){alert('Перевір геометрію стель перед друком кошторису.');return}
    if (missingBounds(estimateProject)) { alert('Введи габаритну ширину й висоту в усіх кімнатах, де вибрано «По габаритах».'); return }
    const sections = estimateRows(estimateProject)
    const base = sections.reduce((sum, section) => sum + section.total, 0)
    const discounted = base * (1 - Math.min(100,num(discountPercent)) / 100)
    const total = roundedEstimate ? Math.floor(discounted / 100) * 100 : Math.round(discounted)
    const deposit = num(estimateProject.deposit)
    const final = payment(base,estimateProject).final
    const balance = Math.max(0, total - deposit - final)
    const moneyText = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} грн`
    const filename = exportName(estimateProject, detailed ? 'Детальний кошторис' : 'Кошторис по кімнатах')
    const preciseMoney = (n:number) => `${n.toLocaleString('uk-UA',{maximumFractionDigits:2})} грн`
    const rowsHtml = sections.map(section => `<section class="room"><h2>${escapeHtml(section.room.name)}</h2><table>${detailed ? '<thead><tr><th>Найменування</th><th>Кількість</th><th>Ціна за од.</th><th>Сума</th></tr></thead>' : ''}<tbody>${detailed ? section.detailedRows.map(row => `<tr><td>${escapeHtml(row.label)}</td><td>${row.quantity.toLocaleString('uk-UA',{maximumFractionDigits:3})} ${escapeHtml(row.unit)}</td><td>${preciseMoney(row.unitPrice)}</td><td>${preciseMoney(row.amount)}</td></tr>`).join('') : section.rows.map(row => `<tr><td>${escapeHtml(row.label)}</td><td>${moneyText(row.amount)}</td></tr>`).join('')}<tr class="subtotal"><td colspan="${detailed?3:1}">Разом за кімнату</td><td>${detailed?preciseMoney(section.total):moneyText(section.total)}</td></tr></tbody></table></section>`).join('')
    const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${escapeHtml(filename)}</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#202a33;background:#fff;padding:32px;max-width:900px;margin:auto}h1{font-size:28px;margin:0 0 8px}p{color:#596675;margin:4px 0 24px}.room{margin:22px 0;page-break-inside:auto}tr{break-inside:avoid}thead{display:table-header-group}h2{font-size:19px;border-bottom:2px solid #e4a900;padding-bottom:8px}table{width:100%;border-collapse:collapse}th{text-align:left;background:#f5f7f9;padding:8px 4px}th:not(:first-child),td:not(:first-child){text-align:right;white-space:nowrap}td{padding:9px 4px;border-bottom:1px solid #e4e8ec}td:last-child{text-align:right;white-space:nowrap;font-weight:600}.subtotal td{font-weight:700;background:#f5f7f9}.total{margin-top:26px;padding:18px;background:#f5f7f9;font-size:24px;font-weight:700;text-align:right}.discount{text-align:right;color:#596675}@media print{body{padding:0}}</style></head><body><h1>${detailed?'Детальний кошторис':'Кошторис'} · НСК — Натяжні Стелі Коломия</h1><p>Замовник: ${escapeHtml(estimateProject.client || '—')} · Телефон: ${escapeHtml(estimateProject.phone || '—')}<br>Об’єкт: ${escapeHtml(estimateProject.address || '—')}<br>Дата заміру: ${formatMeasurementDate(estimateProject.measurementDate)}</p>${rowsHtml}${Number(discountPercent)>0 ? `<p class="discount">Знижка ${discountPercent}%: −${moneyText(base-discounted)}</p>` : ''}<div class="total">Вартість замовлення: ${moneyText(total)}<br><small>Завдаток: ${moneyText(deposit)}<br>${final>0?`Остаточна оплата: ${moneyText(final)}<br>`:''}Залишок до оплати: ${moneyText(balance)}</small></div></body></html>`
    if (format === 'pdf') {
      const win = window.open('', '_blank')
      if (!win) { alert('Дозволь спливаючі вікна для збереження PDF.'); return }
      win.document.open(); win.document.write(html); win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 300)
      return
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;background:white;color:#202a33;padding:38px;width:1200px;min-height:1600px">${html.split('<body>')[1].split('</body>')[0]}</div></foreignObject></svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = Math.max(1600, img.height || 1600)
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); alert('Не вдалося створити JPEG.'); return }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(file => { if (file) { const a = document.createElement('a'); const link = URL.createObjectURL(file); a.href = link; a.download = `${filename}.jpg`; a.click(); URL.revokeObjectURL(link) } URL.revokeObjectURL(url) }, 'image/jpeg', 0.94)
    }
    img.onerror = () => { URL.revokeObjectURL(url); alert('Браузер не зміг сформувати JPEG. Спробуй PDF.') }
    img.src = url
  }


  function ceilingCountHtml(count: number) {
    return `<p class="ceiling-count">Стель всього ${count} шт</p>`
  }
  const ceilingCountPrintCss = `
    .ceiling-count{margin:14px 0 0;color:#087a29;font-size:22px;font-weight:700;line-height:1.25;text-align:center;break-inside:avoid;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body.pdf-paginated{width:180mm;max-width:none;margin:0 auto;padding:0}
    .pdf-print-page{box-sizing:border-box;width:180mm;min-height:266mm;display:flex;flex-direction:column;break-after:page;page-break-after:always}
    .pdf-print-page:last-child{break-after:auto;page-break-after:auto}
    .pdf-print-content{display:flow-root;flex:0 0 auto}
    .pdf-print-content .sheet{break-after:auto;page-break-after:auto}
    .pdf-print-content .mini{max-height:130px}
    .pdf-print-page>.ceiling-count{margin:auto 0 0;padding-top:12px;flex:0 0 auto}
    @media screen{.pdf-print-page{margin-bottom:12px;border-bottom:1px solid #ddd}.pdf-print-page:last-child{border-bottom:0}}
    @media print{body.pdf-paginated{margin:0;padding:0}.pdf-print-page{margin:0}}
  `
  // Use the same A4 content size for measuring and printing. Explicit pages keep
  // the one-off total at the bottom of the last page, not on every printed page.
  const ceilingCountPagination = `<script>(function(){
    var body=document.body, footer=body.querySelector('.ceiling-count');
    if(!footer)return;
    var nodes=Array.from(body.children).filter(function(n){return n.tagName!=='SCRIPT'&&n!==footer;});
    footer.remove();
    // Keep the installer signature with the last drawing when present.
    var last=nodes[nodes.length-1], before=nodes[nodes.length-2];
    if(last&&last.classList.contains('pdf-signature')&&before&&before.classList.contains('room')){before.appendChild(last);nodes.pop();}
    body.classList.add('pdf-paginated');
    var page,content,hasSheet=false,limit=266*96/25.4;
    function newPage(){page=document.createElement('div');page.className='pdf-print-page';content=document.createElement('div');content.className='pdf-print-content';page.appendChild(content);body.appendChild(page);hasSheet=false;}
    function height(){return content.getBoundingClientRect().height;}
    function add(node){var had=content.children.length>0;content.appendChild(node);if(had&&height()>limit){node.remove();newPage();content.appendChild(node);} }
    newPage();
    nodes.forEach(function(node){
      if(node.classList.contains('sheet')){if(hasSheet)newPage();add(node);hasSheet=true;return;}
      var list=node.tagName==='SECTION'&&!node.classList.contains('room')?node.querySelector('ul'):null;
      if(list&&list.children.length){
        var items=Array.from(list.children),heading=node.querySelector('h2');
        var chunk=node.cloneNode(false),ul=list.cloneNode(false);
        if(heading)chunk.appendChild(heading.cloneNode(true));chunk.appendChild(ul);
        var first=items.shift();ul.appendChild(first);add(chunk);
        items.forEach(function(li){ul.appendChild(li);if(height()>limit&&ul.children.length>1){li.remove();newPage();chunk=node.cloneNode(false);ul=list.cloneNode(false);chunk.appendChild(ul);ul.appendChild(li);content.appendChild(chunk);}});
        node.remove();return;
      }
      add(node);
    });
    page.appendChild(footer);
    // If necessary, move the last drawing together with its total to a fresh page.
    var needed=footer.getBoundingClientRect().height;
    if(height()+needed>limit&&content.children.length>1){
      var tail=content.lastElementChild;tail.remove();footer.remove();newPage();content.appendChild(tail);page.appendChild(footer);
    }
  })();</script>`


  function exportCuttingPlan() {
    const project = active || estimateProject
    if (!project) return
    const invalid=unverifiedMeasuredRooms(project)
    if(invalid.length){alert('Перевір геометрію перед друком: '+invalid.map(r=>r.name).join(', '));return}
    const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    const fmt = formatCm
    const roomPages = project.rooms.map((room, index) => {
      const orderedSides=room.sides
      const pts=drawingPoints(room,360,230)
      const poly=pts.map(v=>`${v.x},${v.y}`).join(' ')
      const feature=featureDrawing(room,360,230)
      const featureLabels=feature?.centers.map((v,i)=>`<text x="${v.x}" y="${v.y}" text-anchor="middle" font-size="12" font-weight="bold">В${i+1}</text>`).join('')||''
      const vertices=pts.map((v,i)=>`<text x="${v.x+8}" y="${v.y-8}" font-size="14" font-weight="bold" fill="#111">${String.fromCharCode(65+i)}</text>`).join('')
      const drawing=`<svg class="drawing" viewBox="-8 -8 376 246" role="img" aria-label="Полотно ${index+1}">${feature?`<path d="${feature.path}" fill="#fff" fill-rule="evenodd" stroke="#111" stroke-width="2.5"/>`:`<polygon points="${poly}" fill="#fff" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>`}${referenceSvg(room,pts)}${vertices}${featureLabels}<text x="180" y="${feature||room.reference0?16:115}" text-anchor="middle" font-size="15" font-weight="bold" fill="#111">${esc(room.canvasNumber || `Полотно №${index+1}`)}</text></svg>`
      const note=geometryNote(room)
      const diagonals = Object.entries(room.diagonals || {}).filter(([key, value]) => validDiagonal(key,room.shape==='rectangle'?4:room.sides.length) && Number(value) > 0).map(([key, value]) => `${key} = ${fmt(value)}`).join(' · ')
      const overall = [num(room.overallWidth)>0?`Габаритна ширина = ${fmt(room.overallWidth)}`:'',num(room.overallHeight)>0?`Габаритна висота = ${fmt(room.overallHeight)}`:''].filter(Boolean).join(' · ')
      const c = room.components
      const special = room.pricing ? room.pricing.items.some(v=>['alutat-fly','shadow-ud'].includes(v.item.id)&&num(v.quantity)>0) : !!(c && (((c.flyEnabled??c.profile==='fly')&&num(c.flyLength||c.profileLength)>0)||((c.udEnabled??c.profile==='ud')&&num(c.udLength||c.profileLength)>0)))
      return `<section class="sheet"><div class="sheet-head"><div><p class="sheet-object">Об’єкт: ${esc(projectObjectName(project))}</p><h2>Полотно: ${esc(room.canvasNumber || `№${index + 1}`)}</h2><p>${esc(room.name || `Приміщення ${index + 1}`)}</p></div><div class="sheet-number">№ ${index + 1}</div></div>${drawing}<div class="measurements">${note?`<p style="color:#9b5600;font-weight:bold">${esc(note)}</p>`:''}<h3>Розміри сторін</h3><div class="side-grid">${(room.shape === 'rectangle' ? [`AB = ${fmt(room.width)}`, `BC = ${fmt(room.length)}`, `CD = ${fmt(room.width)}`, `DA = ${fmt(room.length)}`] : orderedSides.map((side, i) => `${String.fromCharCode(65+i)}${String.fromCharCode(65+((i+1)%orderedSides.length))} = ${fmt(side.length)}`)).map(item => `<div>${esc(item)}</div>`).join('')}</div>${diagonals ? `<p class="diagonals">Діагоналі: ${esc(diagonals)}</p>` : ''}${referenceMeasurements(room).length?`<p class="diagonals"><b>Від точки 0:</b> ${esc(referenceMeasurements(room).map(v=>`${v.label} = ${fmt(v.length)}`).join(' · '))}</p>`:''}${overall?`<p class="diagonals">${esc(overall)}</p>`:''}${featureTexts(room).map(t=>`<p class="diagonals">${esc(t)}</p>`).join('')}${special?'<p class="special-cut">ЧОРНИЙ ГАРПУН, СПЕЦРОЗКРІЙ</p>':''}${index===project.rooms.length-1?ceilingCountHtml(project.rooms.length):''}</div></section>`
    }).join('')
    const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${esc(exportName(project,'Розкрій'))}</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;padding:22px}.header{border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}.header h1{font-size:25px;margin:0 0 10px}.header p{font-size:17px;margin:4px 0}.sheet{page-break-after:always;break-after:page;min-height:0;padding:8px 0;page-break-inside:avoid;break-inside:avoid}.sheet:last-child{page-break-after:auto;break-after:auto}.sheet-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #aaa;padding-bottom:8px}.sheet-head h2{font-size:23px;margin:0 0 5px}.sheet-head p{margin:0;color:#444}.sheet-head .sheet-object{font-size:19px;font-weight:bold;color:#111;margin:0 0 6px}.sheet-number{font-size:25px;font-weight:bold}.drawing{display:block;width:100%;height:340px;margin:12px auto 8px}.measurements{margin-top:10px}.measurements h3{font-size:18px;margin-bottom:12px}.side-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.side-grid div{border:1px solid #bbb;padding:6px;font-size:15px;font-weight:bold}.diagonals{margin-top:7px;font-size:14px}.special-cut{margin:10px 0 0;color:#c00000;font-size:24px;font-weight:900;line-height:1.15;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:15mm}@media print{body{padding:0}.sheet{min-height:0;page-break-inside:avoid;break-inside:avoid}.sheet:last-child{page-break-after:auto;break-after:auto}}${ceilingCountPrintCss}</style></head><body><header class="header"><h1>Креслення для закрійника</h1><p><b>Об’єкт:</b> ${esc(projectObjectName(project))}</p><p><b>Телефон:</b> ${esc(project.phone || '—')}</p></header>${roomPages || '<p>У цьому об’єкті немає полотен.</p>'+ceilingCountHtml(0)}${ceilingCountPagination}</body></html>`
    const win = window.open('', '_blank')
    if (!win) { alert('Дозволь спливаючі вікна, щоб відкрити креслення та зберегти його в PDF.'); return }
    win.document.open()
    win.document.write(html)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 350)
  }

  function buildWorkerTask(project: Project) {
    const jobRooms: JobPayload['rooms'] = []
    const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    const qty = formatCm
    const allMaterials: InstallerMaterial[] = []
    const warnings: string[] = []
    const rows = project.rooms.map((room, index) => {
      const roomStart = allMaterials.length
      const c = { ...defaultComponents(), ...(room.components || {}) }
      const e = componentEstimate(room)
      const addTotal = (label: string, value: number, unit = 'м') => { if (value > 0) allMaterials.push({label,quantity:value,unit}) }
      if(room.pricing){
        const m=calculate(room.pricing,actualRoomArea(room)||0,roomPerimeter(room)||0)
        for(const v of m.materials)addTotal(v.label,v.quantity,v.unit)
        for(const n of automaticNeeds(room.pricing,roomPerimeter(room)||0,consumableRules,room.id,project.objectCosts?.consumableQuantities)){if(n.rule.id!==LED_ID)addTotal(n.rule.name,n.quantity,n.rule.unit)}
        if(m.overrun)warnings.push(`${room.name}: довжина периметральних профілів перевищує периметр`)
      }else{
        const plasticLength=Math.max(0,(roomPerimeter(room)||0)-(c.flyEnabled?num(c.flyLength):0)-(c.udEnabled?num(c.udLength):0))
        addTotal('Полотно MSD Premium',actualRoomArea(room)||0,'м²')
        addTotal('Профіль пластиковий',plasticLength)
        addTotal(`Декоративна вставка (${c.insertColor==='black'?'чорна':'біла'})`,e.insertLength)
        if(c.flyEnabled&&num(c.flyLength)>0){addTotal('ALUTAT FLY — планка 2 м',Math.ceil(num(c.flyLength)/2),'шт.');addTotal('Кути — ALUTAT FLY',num(c.flyCorners),'шт.');addTotal('Блоки живлення FLY',num(c.flyPower),'шт.');addTotal('Магнітні решітки FLY',num(c.flyGrilles),'шт.')}
        if(c.udEnabled&&num(c.udLength)>0){addTotal('Тіньовий профіль UD',num(c.udLength));addTotal('Кути UD',num(c.udCorners),'шт.')}
        e.skDetails.forEach(item=>{if(!num(item.length))return;const name=`ALUTAT SK 3.0 (${item.color==='white'?'білий':'чорний'})`;stockPlan(num(item.length),'2;2.5;3.2;3.6').bars.forEach(b=>addTotal(`${name} — планка ${b.length} м`,b.count,'шт.'));if(item.ledEnabled??num(item.ledLength)>0)addTotal(`LED ${item.ledColor||'Тепле 3000K'} — ${name}`,num(item.ledLength));addTotal(`Блоки живлення — ${name}`,num(item.power),'шт.');addTotal(`Магнітні решітки — ${name}`,num(item.grilles),'шт.')})
        if(num(c.fn27Length)>0)addTotal('FN-27 — планка 2 м',Math.ceil(num(c.fn27Length)/2)+1,'шт.')
        addTotal('Блоки живлення FN-27',num(c.fn27Power),'шт.');addTotal('Магнітні решітки FN-27',num(c.fn27Grilles),'шт.')
        e.catalogItems.forEach(item=>addTotal(item.name,num(item.quantity),item.unit||'шт.'))
        addTotal('Додаткові кути стандартного профілю',Math.max(0,num(c.standardCorners)-4),'шт.')
        warnings.push(`${room.name}: старий формат комплектуючих; для розхідників переведи кімнату на новий каталог.`)
        if((c.flyEnabled?num(c.flyLength):0)+(c.udEnabled?num(c.udLength):0)>(roomPerimeter(room)||0)+1e-6)warnings.push(`${room.name}: довжина периметральних профілів перевищує периметр`)
      }
      if(room.shape==='polygon' && room.estimateAreaMode==='bounds' && actualRoomArea(room)===null)warnings.push(`${room.name}: фактична площа полотна не вказана; дивись креслення`)
      const pts=drawingPoints(room,360,224)
      const feature=featureDrawing(room,360,224)
      const note=geometryNote(room)
      if(note)warnings.push(`${room.name}: ${note}`)
      jobRooms.push({ name: room.name, canvas: room.canvasNumber || `Полотно №${index + 1}`, points: pts.map(p=>({x:Number(p.x),y:Number(p.y)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)), sides: room.shape==='rectangle' ? [{label:'AB',length:num(room.width)},{label:'BC',length:num(room.length)},{label:'CD',length:num(room.width)},{label:'DA',length:num(room.length)}] : room.sides.map(v=>({label:v.label,length:num(v.length)})), diagonals: Object.entries(room.diagonals||{}).filter(([label,value])=>validDiagonal(label,room.shape==='rectangle'?4:room.sides.length)&&num(value)>0).map(([label,value])=>({label,length:num(value)})), overallWidth:num(room.overallWidth), overallHeight:num(room.overallHeight), referencePoint:referenceDrawing(room,pts)||undefined, referenceMeasurements:referenceMeasurements(room), contourPath:feature?.path, cutoutCenters:feature?.centers, featureNotes:featureTexts(room), materials: consolidateMaterials(allMaterials.slice(roomStart)) })
      const polygon = pts.map(p => `${p.x},${p.y}`).join(' ')
      const drawing = `<svg class="mini" viewBox="0 0 360 224" role="img" aria-label="Креслення ${esc(room.name)}">${feature?`<path d="${feature.path}" fill="#f7f9fb" fill-rule="evenodd" stroke="#263746" stroke-width="3"/>`:`<polygon points="${polygon}" fill="#f7f9fb" stroke="#263746" stroke-width="3"/>`}${feature?.centers.map((v,i)=>`<text x="${v.x}" y="${v.y}" text-anchor="middle" font-size="12" font-weight="bold">В${i+1}</text>`).join('')||''}${referenceSvg(room,pts)}${pts.map((v,i)=>`<text x="${v.x+8}" y="${v.y-8}" font-size="14" font-weight="bold" fill="#263746">${String.fromCharCode(65+i)}</text>`).join('')}<text x="180" y="${feature||room.reference0?16:112}" text-anchor="middle" font-size="13" font-weight="bold" fill="#222">${esc(room.canvasNumber || `Полотно №${index + 1}`)}</text><text x="180" y="215" text-anchor="middle" font-size="12" fill="#667">Схема контуру</text></svg>`
      const roomData=jobRooms[jobRooms.length-1]
      const dimensions=roomData.sides.map(v=>`${v.label}: ${qty(v.length)}`).join(' · ')
      const diagonals=roomData.diagonals.filter(v=>v.length>0).map(v=>`${v.label}: ${qty(v.length)}`).join(' · ')
      return `<section class="room"><h2>${esc(room.name)}</h2><div class="roomgrid"><div><p>${esc(roomData.canvas)}</p><p>${esc(dimensions)}</p>${diagonals?`<p>Діагоналі: ${esc(diagonals)}</p>`:''}${roomData.referenceMeasurements?.length?`<p>Від точки 0: ${esc(roomData.referenceMeasurements.map(v=>`${v.label}: ${qty(v.length)}`).join(' · '))}</p>`:''}${roomData.overallWidth?`<p>Габаритна ширина: ${qty(roomData.overallWidth)}</p>`:''}${roomData.overallHeight?`<p>Габаритна висота: ${qty(roomData.overallHeight)}</p>`:''}${featureTexts(room).map(t=>`<p>${esc(t)}</p>`).join('')}</div>${drawing}</div>${index===project.rooms.length-1?ceilingCountHtml(project.rooms.length):''}</section>`
    }).join('')
    for(const n of manualNeeds(consumableRules,project.objectCosts?.consumableQuantities))if(n.quantity>0)allMaterials.push({label:n.rule.name,quantity:n.quantity,unit:n.rule.unit})
    const totals=consolidateMaterials(allMaterials)
    const summaryHtml = totals.map(line=>`<li>${esc(line)}</li>`).join('')
    const warningsHtml = warnings.map(line=>`<p><b>УВАГА:</b> ${esc(line)}</p>`).join('')
    const mapUrl = project.locationLat != null && project.locationLng != null
      ? `https://www.google.com/maps?q=${project.locationLat},${project.locationLng}`
      : project.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.address)}` : ''
    const payload: JobPayload = {objectName:projectObjectName(project),client:project.client, phone:project.phone, address:project.address, mapUrl, rooms:jobRooms, totals,warnings, roomDetailsVersion: 1}
    return {rows,summaryHtml,mapUrl,payload,warningsHtml}
  }
  function exportWorkerTask() {
    const project=active
    if(!project)return
    const invalid=unverifiedMeasuredRooms(project)
    if(invalid.length){alert('Перевір геометрію перед друком: '+invalid.map(r=>r.name).join(', '));return}
    const esc=escapeHtml
    const {rows,summaryHtml,mapUrl,warningsHtml}=buildWorkerTask(project)
    const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${esc(exportName(project,'Монтаж'))}</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#202a33;padding:28px;max-width:900px;margin:auto}h1{font-size:26px;margin:0 0 14px}h2{font-size:19px;border-bottom:2px solid #e4a900;padding-bottom:7px;margin-top:24px}p{margin:7px 0}ul{padding-left:22px}li{padding:5px 0;font-size:16px}.roomgrid{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:14px;align-items:start}.mini{width:100%;max-height:145px;border:1px solid #d8dee5;border-radius:6px;background:#fff}.map{display:inline-block;margin-top:10px;padding:10px 14px;background:#eef3f8;border-radius:6px;color:#174c83;text-decoration:none;font-weight:bold}.room{page-break-inside:avoid} @page{size:A4;margin:15mm}@media print{body{padding:0}.roomgrid{grid-template-columns:minmax(0,1fr) 190px}.mini{max-height:130px}}${ceilingCountPrintCss}</style></head><body><h1>Завдання монтажникам</h1><p><b>Об'єкт:</b> ${esc(projectObjectName(project))}</p><p><b>Замовник:</b> ${esc(project.client || '—')}</p><p><b>Телефон:</b> ${esc(project.phone || '—')}</p><p><b>Адреса:</b> ${esc(project.address || 'Не вказана')}</p>${mapUrl ? `<a class="map" href="${mapUrl}">Відкрити маршрут у Google Maps</a>` : ''}${warningsHtml}<section><h2>ЩО ВЗЯТИ НА ОБ’ЄКТ</h2><ul>${summaryHtml || '<li>Комплектуючі не вказані</li>'}</ul></section>${rows || ceilingCountHtml(0)}<p class="pdf-signature" style="margin-top:28px;color:#667">НСК — Натяжні Стелі Коломия</p>${ceilingCountPagination}</body></html>`
    const win = window.open('', '_blank')
    if (!win) { alert('Дозволь спливаючі вікна, щоб сформувати PDF.'); return }
    win.document.open(); win.document.write(html); win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 350)
  }

  function exportOverallEstimate(format: 'pdf' | 'jpeg') {
    if (!estimateProject) return
    if(unverifiedMeasuredRooms(estimateProject).length){alert('Перевір геометрію стель перед друком кошторису.');return}
    const sections = estimateRows(estimateProject)
    const filename = exportName(estimateProject, 'Кошторис')
    const grouped = new Map<string, { label: string; amount: number }>()
    sections.forEach(section => section.rows.forEach(row => {
      const label = row.label.replace(/\s*\([^)]*\)\s*$/, '').trim()
      const current = grouped.get(label) || { label, amount: 0 }
      current.amount += row.amount
      grouped.set(label, current)
    }))
    const base = sections.reduce((sum, section) => sum + section.total, 0)
    const percent = Math.min(100,num(discountPercent))
    const afterDiscount = base * (1 - percent / 100)
    const total = roundedEstimate ? Math.floor(afterDiscount / 100) * 100 : Math.round(afterDiscount)
    const deposit = num(estimateProject.deposit)
    const final = payment(base,estimateProject).final
    const balance = Math.max(0, total - deposit - final)
    const moneyText = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} грн`
    const rowsHtml = [...grouped.values()].map(row => `<tr><td>${escapeHtml(row.label)}</td><td>${moneyText(row.amount)}</td></tr>`).join('')
    const roomsHtml = `<p>Кількість кімнат: ${estimateProject.rooms.length}</p>`
    const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${escapeHtml(filename)}</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#202a33;background:#fff;padding:32px;max-width:900px;margin:auto}h1{font-size:28px;margin:0 0 8px}p{color:#596675;margin:4px 0 18px}table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:11px 5px;border-bottom:1px solid #e4e8ec}td:last-child{text-align:right;white-space:nowrap;font-weight:700}.total{margin-top:26px;padding:18px;background:#f5f7f9;font-size:23px;font-weight:700;text-align:right}.small{font-size:15px;line-height:1.7}@media print{body{padding:0}}</style></head><body><h1>Загальний кошторис об’єкта</h1><p>НСК — Натяжні Стелі Коломия<br>Замовник: ${escapeHtml(estimateProject.client || '—')} · Телефон: ${escapeHtml(estimateProject.phone || '—')}<br>Адреса: ${escapeHtml(estimateProject.address || '—')}<br>Дата заміру: ${formatMeasurementDate(estimateProject.measurementDate)}<br>${roomsHtml}</p><table>${rowsHtml}</table>${percent > 0 ? `<p>Знижка ${percent}%: −${moneyText(base-afterDiscount)}</p>` : ''}<div class="total">Разом за об’єкт: ${moneyText(total)}<div class="small">Завдаток: ${moneyText(deposit)}<br>${final>0?`Остаточна оплата: ${moneyText(final)}<br>`:''}Залишок до оплати: ${moneyText(balance)}</div></div></body></html>`
    if (format === 'pdf') {
      const win = window.open('', '_blank')
      if (!win) { alert('Дозволь спливаючі вікна для збереження PDF.'); return }
      win.document.open(); win.document.write(html); win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 300)
      return
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;background:white;color:#202a33;padding:38px;width:1200px;min-height:1600px">${html.split('<body>')[1].split('</body>')[0]}</div></foreignObject></svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = Math.max(1600, img.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); alert('Не вдалося створити JPEG.'); return }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(file => { if (file) { const a = document.createElement('a'); const link = URL.createObjectURL(file); a.href = link; a.download = `${filename}.jpg`; a.click(); URL.revokeObjectURL(link) } URL.revokeObjectURL(url) }, 'image/jpeg', 0.94)
    }
    img.onerror = () => { URL.revokeObjectURL(url); alert('Браузер не зміг сформувати JPEG. Спробуй PDF.') }
    img.src = url
  }

  function sk30StockLength(need: number) {
    if (need <= 0) return 0
    const bars = [2, 2.5, 3.2, 3.6]
    let best = Infinity
    const limit = Math.ceil(need / 2) + 2
    for (let a = 0; a <= limit; a++) for (let b = 0; b <= limit; b++)
      for (let c = 0; c <= limit; c++) for (let d = 0; d <= limit; d++) {
        const total = a*bars[0] + b*bars[1] + c*bars[2] + d*bars[3]
        if (total >= need && total < best) best = total
      }
    return best === Infinity ? 0 : best
  }

  function updateDiagonal(room: Room, key: string, value: string) {
    updateRoom(room.id, { diagonals: { ...(room.diagonals || {}), [key]: value } })
  }

  function diagonalKeys(count: number) {
    return Array.from({ length: Math.max(0, count - 3) }, (_, i) => {
      const end = i + 2
      return { key: `A-${String.fromCharCode(65 + end)}`, label: `A–${String.fromCharCode(65 + end)}` }
    })
  }

  function validDiagonal(key: string, count: number) {
    if (!/^[A-Z]-[A-Z]$/.test(key)) return false
    const a = key.charCodeAt(0)-65, b = key.charCodeAt(2)-65
    return a >= 0 && b < count && a < b && b-a > 1 && !(a===0 && b===count-1)
  }

  function extraMeasurements(room: Room) {
    const count = room.shape==='rectangle' ? 4 : room.sides.length
    const values = room.diagonals || {}
    const fixed = new Set(diagonalKeys(count).map(d=>d.key))
    const extras = Object.keys(values).filter(k=>validDiagonal(k,count)&&!fixed.has(k)).sort()
    const choices: string[] = []
    for(let a=0;a<count;a++) for(let b=a+2;b<count;b++) {
      const key=String.fromCharCode(65+a)+'-'+String.fromCharCode(65+b)
      if(validDiagonal(key,count)&&!fixed.has(key)&&!Object.prototype.hasOwnProperty.call(values,key))choices.push(key)
    }
    return <div style={{marginTop:20}}>
      <h3>Додаткові діагоналі</h3>
      <p className="muted">Вибери будь-яку пару несусідніх кутів, наприклад B–H або B–G. У режимі «За розмірами» всі введені діагоналі враховуються та перевіряються. Розміри зберігаються і друкуються у кресленні.</p>
      <label style={labelStyle}>+ Додати діагональ
        <select aria-label="Додати діагональ" style={inputStyle} value="" disabled={!choices.length} onChange={e=>{if(choices.includes(e.target.value))updateDiagonal(room,e.target.value,'')}}>
          <option value="">{choices.length?'Вибрати точки…':'Усі можливі діагоналі додано'}</option>
          {choices.map(k=><option key={k} value={k}>{k.replace('-','–')}</option>)}
        </select>
      </label>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:12}}>
        {extras.map(k=><div key={room.id+k}>
          <label style={labelStyle}>{k.replace('-','–')}, см<CmInput key={room.id+k} value={values[k]} style={inputStyle} onChange={v=>updateDiagonal(room,k,v)} placeholder="0"/></label>
          <button className="button secondary" type="button" onClick={()=>{const next={...values};delete next[k];updateRoom(room.id,{diagonals:next})}}>Видалити {k}</button>
        </div>)}
      </div>
      <h3 style={{marginTop:20}}>Габаритні розміри</h3>
      <p className="muted">Фактичні максимальні габарити стелі. Для складної форми можуть використовуватися для кошторису.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:12}}>
        <label style={labelStyle}>Габаритна ширина, см<CmInput key={room.id+'overallWidth'} style={inputStyle} value={room.overallWidth} onChange={v=>updateRoom(room.id,{overallWidth:v})} placeholder="0"/></label>
        <label style={labelStyle}>Габаритна висота, см<CmInput key={room.id+'overallHeight'} style={inputStyle} value={room.overallHeight} onChange={v=>updateRoom(room.id,{overallHeight:v})} placeholder="0"/></label>
      </div>
    </div>
  }

  function referenceEditor(room:Room){
    if(!room.reference0)return <div style={{marginTop:16}}><button type="button" className="button secondary" onClick={()=>updateRoom(room.id,{reference0:{},geometryMode:'sketch'})}>+ Задати точку 0</button></div>
    const values=room.reference0,letters=room.sides.map((_,i)=>String.fromCharCode(65+i)),ready=Number(room.sides[0]?.length)>0&&Number(values.A)>0&&Number(values.B)>0,anchor=ready?previewReference(room.sides[0]?.length,values.A,values.B,sketchPoints(room)):null
    const patch=(key:string,value:string)=>updateRoom(room.id,{reference0:{...values,[key]:value}})
    const field=(key:string)=><label key={key} style={labelStyle}>{key}0, см<CmInput key={room.id+'ref'+key} style={inputStyle} value={values[key]} onChange={v=>patch(key,v)} placeholder="0"/></label>
    const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(125px,1fr))',gap:10}
    return <div style={{marginTop:16,padding:14,border:'1px solid #647586',borderRadius:10}}><h3 style={{marginTop:0}}>Точка 0 · внутрішня опорна точка</h3><p className="muted">Познач точку на стелі, звідки зручно вимірювати відстані до кутів. AB — та сама сторона, що у списку сторін.</p><div style={grid}><label style={labelStyle}>AB, см<CmInput key={room.id+'refAB'} style={inputStyle} value={room.sides[0]?.length} onChange={v=>updateSide(room,room.sides[0].id,v)} placeholder="0"/></label>{field('A')}{field('B')}</div>
      {ready&&!anchor&&room.geometryMode!=='measured'&&<p style={{color:'#ffd27a'}}>За AB, A0 і B0 не вдалося показати точку всередині приблизного ескізу. Перевір заміри або уточни форму. Можна внести решту відстаней для точного розрахунку.</p>}
      {ready&&<><p className="muted">Відстані від тієї самої точки 0 до решти кутів:</p><div style={grid}>{letters.slice(2).map(field)}</div></>}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="button primary" onClick={()=>updateRoom(room.id,{geometryMode:'measured'})}>Побудувати за точкою 0</button><button type="button" className="button secondary" onClick={()=>updateRoom(room.id,{reference0:undefined,geometryMode:'sketch'})}>Видалити точку 0</button></div><p className="muted">Звичайні діагоналі можна додавати для контролю. Якщо промінь перекритий стіною або вирізом, використовуй доступні контрольні діагоналі або звичайний режим.</p></div>
  }
  function geometryEditor(room: Room) {
    const enabled=room.geometryMode==='measured', result=enabled?measuredGeometry(room):null
    return <div style={{marginTop:14,padding:12,border:'1px solid #647586',borderRadius:10}}>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <button type="button" aria-pressed={!enabled} style={{...buttonStyle,background:!enabled?'#ffb900':'#405263',color:!enabled?'#18222c':'#fff'}} onClick={()=>updateRoom(room.id,{geometryMode:'sketch'})}>Ескіз вручну</button>
        <button type="button" aria-pressed={enabled} style={{...buttonStyle,background:enabled?'#ffb900':'#405263',color:enabled?'#18222c':'#fff'}} onClick={()=>updateRoom(room.id,{geometryMode:'measured'})}>Побудувати за розмірами</button>
      </div>
      {result ? result.ok ? <p style={{color:'#60c692',marginBottom:0}}>✓ Базовий контур за замірами · площа {formatNumber(result.area)} м² · найбільша розбіжність {(result.maxError*100).toFixed(2)} см. Перевір форму візуально.</p> : <p style={{color:'#ffd27a',marginBottom:0}}>Не підтверджено: {result.reason} Поки показано вихідний ескіз, друк і публікація заблоковані.</p> : <p className="muted" style={{marginBottom:0}}>Перетягни точки приблизно за формою стелі. Внеси виміряні сторони та достатньо діагоналей, потім натисни «Побудувати за розмірами».</p>}
    </div>
  }

  function featuresEditor(room:Room){
    const f=room.contourFeatures||{},rounds=f.rounds||[],arcs=f.arcs||[],holes=f.cutouts||[],n=room.shape==='rectangle'?4:room.sides.length,L=(i:number)=>String.fromCharCode(65+i),result=featureResult(room)
    const update=(patch:Partial<Features>)=>updateRoom(room.id,{contourFeatures:{...f,...patch}})
    const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(125px,1fr))',gap:8}
    const choices=Array.from({length:n},(_,i)=>i)
    const freeCorners=choices.filter(i=>!rounds.some(r=>r.corner===i)&&!arcs.some(a=>a.side===i||(a.side+1)%n===i))
    const freeSides=choices.filter(i=>!arcs.some(a=>a.side===i)&&!rounds.some(r=>r.corner===i||r.corner===(i+1)%n))
    const patchHole=(id:string,patch:Partial<Cutout>)=>update({cutouts:holes.map(h=>h.id===id?{...h,...patch}:h)})
    return <div style={{marginTop:18,padding:14,border:'1px solid #647586',borderRadius:10}}>
      <h3 style={{marginTop:0}}>Заокруглення, дуги та внутрішні вирізи</h3>
      <p className="muted">Спочатку задай базовий контур. Для заокруглень вимірюй сторони до умовних гострих кутів, а для дуги — пряму хорду між її кінцями.</p>
      <label style={labelStyle}>+ Заокруглити кут<select style={inputStyle} value="" disabled={!freeCorners.length} onChange={e=>{if(e.target.value!=='')update({rounds:[...rounds,{corner:Number(e.target.value),radius:''}]})}}><option value="">Вибрати кут…</option>{freeCorners.map(i=><option key={i} value={i}>{L(i)}</option>)}</select></label>
      {rounds.map(r=><div key={r.corner} style={grid}><label style={labelStyle}>Кут {L(r.corner)} · R, см<CmInput style={inputStyle} value={r.radius} onChange={v=>update({rounds:rounds.map(x=>x.corner===r.corner?{...x,radius:v}:x)})}/></label><button type="button" className="button secondary" onClick={()=>update({rounds:rounds.filter(x=>x.corner!==r.corner)})}>Видалити {L(r.corner)}</button></div>)}
      <label style={labelStyle}>+ Дуга замість прямої сторони<select style={inputStyle} value="" disabled={!freeSides.length} onChange={e=>{if(e.target.value!=='')update({arcs:[...arcs,{side:Number(e.target.value),rise:'',direction:'out'}]})}}><option value="">Вибрати хорду…</option>{freeSides.map(i=><option key={i} value={i}>{L(i)}–{L((i+1)%n)}</option>)}</select></label>
      {arcs.map(a=><div key={a.side} style={grid}><label style={labelStyle}>Дуга {L(a.side)}–{L((a.side+1)%n)} · стріла, см<CmInput style={inputStyle} value={a.rise} onChange={v=>update({arcs:arcs.map(x=>x.side===a.side?{...x,rise:v}:x)})}/></label><label style={labelStyle}>Напрям<select style={inputStyle} value={a.direction} onChange={e=>update({arcs:arcs.map(x=>x.side===a.side?{...x,direction:e.target.value as 'out'|'in'}:x)})}><option value="out">Назовні</option><option value="in">Всередину</option></select></label><button type="button" className="button secondary" onClick={()=>update({arcs:arcs.filter(x=>x.side!==a.side)})}>Видалити дугу</button></div>)}
      <p className="muted">Стріла — найбільша відстань від хорди до дуги. До половини довжини хорди (півколо).</p>
      <h4>Внутрішні вирізи</h4>
      <p className="muted">Відступи: від точки A уздовж A→B та перпендикулярно від AB усередину. Для прямокутника це його початковий кут, для кола — центр.</p>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{(['rectangle','circle'] as const).map(kind=><button type="button" key={kind} className="button secondary" disabled={holes.length>=6} onClick={()=>update({cutouts:[...holes,{id:makeId(),kind,along:'',inward:'',width:'',height:''}]})}>+ {kind==='rectangle'?'Прямокутний виріз':'Круглий виріз'}</button>)}</div>
      {holes.map((v,i)=><div key={v.id} style={{marginTop:12,padding:10,border:'1px solid #405263',borderRadius:8}}><b>В{i+1} · {v.kind==='rectangle'?'Прямокутник':'Коло'}</b><div style={grid}>
        <label style={labelStyle}>Від A уздовж AB, см<CmInput style={inputStyle} value={v.along} onChange={x=>patchHole(v.id,{along:x})}/></label><label style={labelStyle}>Від AB усередину, см<CmInput style={inputStyle} value={v.inward} onChange={x=>patchHole(v.id,{inward:x})}/></label>
        <label style={labelStyle}>{v.kind==='circle'?'Діаметр':'Ширина (перпендикулярно AB)'}, см<CmInput style={inputStyle} value={v.width} onChange={x=>patchHole(v.id,{width:x})}/></label>{v.kind==='rectangle'&&<label style={labelStyle}>Довжина (уздовж AB), см<CmInput style={inputStyle} value={v.height} onChange={x=>patchHole(v.id,{height:x})}/></label>}
      </div><button type="button" className="button secondary" onClick={()=>update({cutouts:holes.filter(x=>x.id!==v.id)})}>Видалити виріз</button></div>)}
      {result&&(result.ok?<p style={{color:'#60c692'}}>✓ Площа контуру {formatNumber(result.area)} м² · зовнішній периметр {formatNumber(result.outerPerimeter)} м · разом із вирізами {formatNumber(result.perimeter)} м</p>:<p style={{color:'#ffd27a'}}>Не підтверджено: {result.reason} Друк і публікація заблоковані, поки не виправиш розміри.</p>)}
    </div>
  }

  function areaModeEditor(room: Room) {
    const mode = room.estimateAreaMode === 'bounds' ? 'bounds' : 'real'
    const real = actualRoomArea(room), bounds = boundsRoomArea(room), billable = roomArea(room)
    const fmtArea = (value: number | null) => value === null ? '—' : `${formatNumber(value)} м²`
    return <div style={{marginTop:20,padding:14,border:'1px solid #e5a900',borderRadius:10}}>
      <h3 style={{marginTop:0}}>Площа для кошторису</h3>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12}}>
        {([['real','Реальна'],['bounds','По габаритах']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={mode===value} style={{...buttonStyle,background:mode===value?'#ffb900':'#405263',color:mode===value?'#18222c':'#fff'}} onClick={()=>updateRoom(room.id,{estimateAreaMode:value})}>{label}</button>)}
      </div>
      <label style={labelStyle}>Реальна площа вручну, м² (необов’язково)
        <NumericInput key={room.id+'actualAreaOverride'} style={inputStyle} value={room.actualAreaOverride} onChange={v=>updateRoom(room.id,{actualAreaOverride:v})} placeholder="Порожньо — розрахунок за замірами"/>
      </label>
      <p className="muted">Для Г-подібної чи іншої увігнутої стелі можна внести перевірену фактичну площу (наприклад, суму площ прямокутників). Очисти поле, щоб повернути автоматичний розрахунок. У режимі «За розмірами» площа береться з відновленого контуру з урахуванням дуг і вирізів.</p>
      <div className="info-row"><span>Реальна площа {room.actualAreaOverride ? '(вручну)' : '(розрахункова)'}</span><b>{fmtArea(real)}</b></div>
      <div className="info-row"><span>Площа по габаритах (ширина × висота)</span><b>{fmtArea(bounds)}</b></div>
      <div className="room-area"><span>До кошторису</span><strong>{fmtArea(billable)}</strong></div>
      {billable===null && <p style={{color:'#ffd27a'}}>{mode==='bounds'?'Введи обидва габарити вище.':'Введи сторони й діагоналі або реальну площу вручну.'}</p>}
      <p className="muted">Вибір впливає на вартість полотна в кошторисі. Креслення та фактичний периметр не змінюються.</p>
    </div>
  }

  function heron(a: number, b: number, c: number) {
    const sem = (a + b + c) / 2
    const value = sem * (sem-a) * (sem-b) * (sem-c)
    return value > 0 ? Math.sqrt(value) : 0
  }

  function polygonArea(room: Room) {
    const n = room.sides.length
    if (n < 3 || room.sides.some(side => !(Number(side.length) > 0))) return null
    const diagonals = room.diagonals || {}
    let area = 0
    for (let i = 1; i < n - 1; i++) {
      const left = i === 1 ? Number(room.sides[0].length) : Number(diagonals[`A-${String.fromCharCode(65+i)}`])
      const right = Number(room.sides[i].length)
      const base = i === n - 2
        ? Number(room.sides[n-1].length)
        : Number(diagonals[`A-${String.fromCharCode(65+i+1)}`])
      if (!(left > 0 && right > 0 && base > 0)) return null
      const triangle = heron(left, right, base)
      if (!triangle) return null
      area += triangle
    }
    return area
  }

  function changeSideCount(room: Room, count: number) {
    const safeCount = Math.max(3, Math.min(12, count))
    if((roomHasFeatures(room)||room.reference0)&&!confirm('Зміна кількості кутів скине точку 0, дуги, заокруглення та внутрішні вирізи. Продовжити?'))return
    const old = room.sides
    const next = makeSides(safeCount).map((s, i) => ({
      ...s,
      length: old[i]?.length || ''
    }))
    updateRoom(room.id, { shape: 'polygon', sides: next, vertices: regularVertices(safeCount), diagonals: room.diagonals || {}, geometryMode:'sketch', contourFeatures:undefined, reference0:undefined })
  }

  const panelStyle = {
    background: '#263442',
    border: '1px solid #425365',
    borderRadius: 14,
    padding: 22
  } as const

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box' as const,
    background: '#17232e',
    border: '1px solid #647586',
    color: '#fff',
    borderRadius: 9,
    padding: '12px 13px',
    fontSize: 15,
    outline: 'none'
  }

  const labelStyle = {
    display: 'grid',
    gap: 8,
    color: '#dce5ed',
    fontSize: 13,
    fontWeight: 600 as const,
    marginBottom: 16
  }

  const buttonStyle = {
    border: 0,
    borderRadius: 9,
    padding: '11px 15px',
    cursor: 'pointer',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  } as const

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">НСК</div>
          <div><b>CEILING DESIGNER</b><span>LITE · КОЛОМИЯ</span></div>
        </div>
        <nav>
          <button className={`nav-item ${!ownerPage&&!catalogPage&&projectView==='active'?'active':''}`} onClick={() => navigateProjects('active')}><House size={18}/>Об’єкти</button>
          <button className={`nav-item ${!ownerPage&&!catalogPage&&projectView==='archive'?'active':''}`} onClick={() => navigateProjects('archive')}><Archive size={18}/>Архів</button>
          <button className={`nav-item ${!ownerPage&&!catalogPage&&projectView==='calendar'?'active':''}`} onClick={() => navigateProjects('calendar')}><CalendarDays size={18}/>Календар замірів</button>
          <button className={`nav-item ${catalogPage?'active':''}`} onClick={() => { setOwnerPage(null);setCatalogPage(true); setActive(null); setActiveRoomId(null); setCreating(false); setEstimateProject(null) }}><Layers3 size={18}/>Каталог</button>
          <button className={`nav-item ${ownerPage==='mounts'?'active':''}`} onClick={()=>navigateOwner('mounts')}><CalendarDays size={18}/>Календар монтажів</button>
          <button className={`nav-item ${ownerPage==='staff'?'active':''}`} onClick={()=>navigateOwner('staff')}><ClipboardList size={18}/>Працівники</button>
          <button className={`nav-item ${ownerPage==='finance'?'active':''}`} onClick={()=>navigateOwner('finance')}><ClipboardList size={18}/>Фінанси</button>
          <button className="nav-item" disabled><ClipboardList size={18}/>Кошториси</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="company">НСК — Натяжні Стелі Коломия</div>
          <button className="nav-item" disabled><Settings size={18}/>Налаштування</button>
          <button className="nav-item" onClick={downloadLocalBackup}><Download size={18}/>Резервна копія</button>
          <small>Версія 0.7.45</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">НСК <span>CEILING DESIGNER</span></div>
          <div className="topbar-right" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span className="status-dot" style={{ background: networkOnline && cloud.status === 'Синхронізовано' ? '#60c692' : '#ffb900' }}/>
            <span>{networkOnline ? cloud.status : 'Офлайн · локальна робота'}</span>
            <small>v0.7.45</small>
            {offlineReady && <small title="Файли програми збережено на пристрої">Офлайн-запуск готовий</small>}
            {cloud.session ? <><button className="button secondary" disabled={!networkOnline || cloud.busy || !!cloud.conflict} onClick={() => void cloud.sync()}>Синхронізувати</button><button className="button secondary" disabled={cloud.busy} onClick={async () => { if (!confirm('Вийти з хмарного облікового запису? Локальні дані залишаться в браузері.')) return; setLoginError(''); try { await cloud.logout() } catch (e) { setLoginError(String(e)) } }}>Вийти</button></> : <button className="button" disabled={!networkOnline || !cloud.ready} onClick={() => { setLoginError(''); setLoginOpen(v => !v) }}>Увійти</button>}
          </div>
        </header>
        {updateAvailable && <div className="panel" style={{margin:12,borderColor:'#ffb900'}} role="status"><b>Доступне оновлення програми</b><p className="muted">Заверши редагування та збережи об’єкт перед перезапуском.</p><button className="button primary" disabled={!!storageWarning || cloud.busy} onClick={()=>{if(confirm('Перезапустити програму? Незбережені чернетки можуть бути втрачені.'))window.location.reload()}}>Оновити програму</button></div>}
        {(storageWarning || cloud.error || loginError && !loginOpen) && <div className="panel" style={{ margin: '12px', color: '#ffd4a3' }} role="alert">{storageWarning && <p>{storageWarning}</p>}{cloud.error && <p>{!networkOnline && /fetch|network/i.test(cloud.error) ? 'Немає інтернету. Дані залишаються на пристрої до синхронізації.' : cloud.error}</p>}{loginError && !loginOpen && <p>{loginError}</p>}</div>}
        {loginOpen && !cloud.session && <form className="panel form-panel" style={{ margin: '12px auto', maxWidth: 440 }} onSubmit={submitCloudLogin}>
          <h2>Вхід до Ceiling Designer Lite</h2>
          <label>Електронна пошта<input type="email" autoComplete="username" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)}/></label>
          <label>Пароль<input type="password" autoComplete="current-password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)}/></label>
          {loginError && <p role="alert" style={{ color: '#ffb4b4' }}>{loginError}</p>}
          <div className="form-actions"><button type="button" className="button secondary" onClick={() => { setLoginPassword(''); setLoginOpen(false) }}>Скасувати</button><button type="submit" className="button" disabled={loginBusy}>{loginBusy ? 'Вхід…' : 'Увійти'}</button></div>
        </form>}
        {cloud.conflict && <div className="panel form-panel" style={{ margin: '12px', borderColor: '#ffb900' }} role="alert">
          <h2>Вибір версії даних</h2>
          <p>Версії об’єктів або каталогу відрізняються. Автоматичний запис призупинено. Збережи резервну копію перед вибором.</p>
          <button className="button secondary" onClick={downloadLocalBackup}>Завантажити локальну копію (JSON)</button>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {cloud.conflict.revision !== null && <button className="button secondary" disabled={cloud.busy} onClick={() => { if (confirm('Замінити локальні об’єкти й каталог версією з хмари?')) void cloud.sync('cloud') }}>Завантажити з хмари</button>}
            <button className="button" disabled={cloud.busy} onClick={() => { if (confirm('Записати локальні об’єкти й каталог у хмару? Попередня хмарна версія буде замінена.')) void cloud.sync('local') }}>Зберегти локальну версію в хмарі</button>
          </div>
        </div>}

        {ownerPage ? (cloud.session ? (ownerPage==='finance' ? <Finance key={cloud.session.user.id} owner={cloud.session.user.id} projects={projects.map(p=>({...p,...projectPayment(p)}))} syncStatus={cloud.status} onOpen={openFinanceProject} onDate={dateLegacyPayment}/> : ownerPage==='staff' ? <StaffManager key={cloud.session.user.id} owner={cloud.session.user.id} estimate={payrollEstimate} labels={[...availableCatalog.map(v=>v.name),'Блоки живлення','Магнітні решітки','Монтаж світильників']}/> : <OwnerCalendar owner={cloud.session.user.id} onOpen={id=>{const p=projects.find(p=>p.id===id);if(!p){alert('Об’єкта немає в локальних даних. Спочатку синхронізуй програму.');return}setOwnerPage(null);setProjectView(p.archivedAt?'archive':'active');setActiveRoomId(null);setActive(p)}}/>) : <section className="content narrow"><p>Для цього розділу потрібен вхід у хмарний акаунт.</p></section>) : catalogPage ? (
          <section className="content narrow">
            <div className="page-heading"><div><div className="eyebrow">ДОВІДНИК ВИРОБІВ</div><h1>Каталог комплектуючих</h1><p className="muted">Керування цінами продажу та закупівлі. Закупівельні ціни не змінюють кошторис клієнта. Дані зберігаються локально та синхронізуються після входу.</p></div></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {categories.map(cat => <button key={cat} style={{ ...buttonStyle, background: !consumablesPage && catalogCategory === cat ? '#ffb900' : '#405263', color: !consumablesPage && catalogCategory === cat ? '#18222c' : '#fff' }} onClick={() => { setConsumablesPage(false); setCatalogCategory(cat); setEditingCatalogId(null); setCatalogDraft({ ...emptyCatalogDraft, category: cat, unit: cat==='Полотна'?'м²':'м' }) }}>{cat}</button>)}
              <button style={{...buttonStyle,background:consumablesPage?'#ffb900':'#405263',color:consumablesPage?'#18222c':'#fff'}} onClick={()=>setConsumablesPage(true)}>Розхідні матеріали</button>
            </div>
            {consumablesPage?<Consumables rules={consumableRules} catalog={availableCatalog} onChange={saveConsumables}/>:<>
            <div className="panel form-panel">
              <h2>{editingCatalogId ? 'Редагувати позицію' : 'Додати позицію'}</h2>
              <label>Назва<input value={catalogDraft.name} onChange={e => setCatalogDraft(v => ({ ...v, name: e.target.value }))} placeholder="Назва виробу"/></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>Ціна для клієнта<NumericInput value={catalogDraft.price} onChange={value => setCatalogDraft(v => ({ ...v, price: value }))}/></label>
                <label>Одиниця<select value={catalogDraft.unit} disabled={catalogCategory==='Полотна'||editingCatalogId==='standard-profile'||editingCatalogId==='decorative-insert'} onChange={e => setCatalogDraft(v => ({ ...v, unit: e.target.value as Unit }))}><option value="м">За метр</option><option value="шт.">За штуку</option><option value="м²">За м²</option></select></label>
              </div>
              <label>Довжина заводської планки / варіанти довжин<input value={catalogDraft.stockLength} onChange={e => setCatalogDraft(v => ({ ...v, stockLength: e.target.value }))} placeholder="Наприклад, 2 або 2; 2,5; 3,2"/></label>
              <h3 style={{ margin: '8px 0 0' }}>Оплата кутів</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>Ціна за один кут, грн<NumericInput value={catalogDraft.cornerPrice} onChange={value => setCatalogDraft(v => ({ ...v, cornerPrice: value }))}/></label>
                <label>Безкоштовних кутів<NumericInput integer value={catalogDraft.freeCorners} onChange={value => setCatalogDraft(v => ({ ...v, freeCorners: value }))}/></label>
              </div>
              <label>Розрахунок ціни за довжиною<select value={catalogDraft.billStock?'stock':'actual'} onChange={e=>setCatalogDraft(v=>({...v,billStock:e.target.value==='stock'}))}><option value="actual">Фактична довжина</option><option value="stock">Закуплена довжина (цілі планки)</option></select></label>
              {(['Профілі','Карнизи','Освітлення основне'].includes(catalogCategory))&&<>
                <label>LED-підсвітка, грн/м (порожньо — не передбачено)<NumericInput value={catalogDraft.ledPrice} onChange={value=>setCatalogDraft(v=>({...v,ledPrice:value}))}/></label>
                <label>Блок живлення, грн/шт. (порожньо — не передбачено)<NumericInput value={catalogDraft.powerPrice} onChange={value=>setCatalogDraft(v=>({...v,powerPrice:value}))}/></label>
                <label>Магнітна решітка, грн/шт. (порожньо — не передбачено)<NumericInput value={catalogDraft.grillePrice} onChange={value=>setCatalogDraft(v=>({...v,grillePrice:value}))}/></label>
              </>}
              <section style={{border:'1px solid #647586',borderRadius:10,padding:12,display:'grid',gap:10}}>
                <h3 style={{margin:0}}>Закупівельні ціни · тільки для адміністратора</h3>
                <p className="muted" style={{margin:0}}>Порожнє поле — ціна не задана. 0 — нульова закупівельна вартість. Вкажи фактичну закупівельну ціну за одиницю, а не націнку.</p>
                <label>Основна позиція, грн/{catalogDraft.unit}<NumericInput value={catalogDraft.purchasePrice} onChange={value=>setCatalogDraft(v=>({...v,purchasePrice:value}))}/></label>
                {(['Профілі','Карнизи','Освітлення основне'].includes(catalogCategory))&&<>
                  <label>Кут (матеріал), грн/шт.<NumericInput value={catalogDraft.cornerPurchasePrice} onChange={value=>setCatalogDraft(v=>({...v,cornerPurchasePrice:value}))}/></label>
                  <p className="muted">Закупівельна ціна LED-стрічки — у розділі «Розхідні матеріали».</p>
                  <label>Блок живлення, грн/шт.<NumericInput value={catalogDraft.powerPurchasePrice} onChange={value=>setCatalogDraft(v=>({...v,powerPurchasePrice:value}))}/></label>
                  <label>Магнітна решітка, грн/шт.<NumericInput value={catalogDraft.grillePurchasePrice} onChange={value=>setCatalogDraft(v=>({...v,grillePurchasePrice:value}))}/></label>
                </>}
              </section>
              <label>Примітки та додаткові тарифи<textarea value={catalogDraft.description} onChange={e => setCatalogDraft(v => ({ ...v, description: e.target.value }))} rows={3}/></label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="button" disabled={!catalogDraft.name.trim()||catalogDraft.price.trim()===''||Number(catalogDraft.price)<0} onClick={() => {
                  const {consumables:_rules,...productDraft}=catalogDraft as typeof catalogDraft & {consumables?:Consumable[]}
                  const draft={...productDraft,category:catalogCategory,unit:catalogCategory==='Полотна'?'м²' as const:editingCatalogId==='standard-profile'||editingCatalogId==='decorative-insert'?'м' as const:catalogDraft.unit}
                  if (editingCatalogId) setCatalog(items => effectiveCatalog(items).map(item => item.id === editingCatalogId ? { ...item, ...draft } : item))
                  else setCatalog(items => [...effectiveCatalog(items), { id: makeId(), ...draft }])
                  setEditingCatalogId(null); setCatalogDraft({ ...emptyCatalogDraft, category: catalogCategory, unit: catalogCategory==='Полотна'?'м²':'м' })
                }}>{editingCatalogId ? 'Зберегти зміни' : 'Додати до каталогу'}</button>
                {editingCatalogId && <button className="button secondary" onClick={() => { setEditingCatalogId(null); setCatalogDraft({ ...emptyCatalogDraft, category: catalogCategory, unit: catalogCategory==='Полотна'?'м²':'м' }) }}>Скасувати</button>}
              </div>
            </div>
            <div className="panel" style={{ marginTop: 16 }}>
              <h2>{catalogCategory}</h2>
              {availableCatalog.filter(item => categoryOf(item) === catalogCategory).map(item => <div key={item.id} className="info-row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}><b>{item.name}</b><div className="muted">Продаж: {item.price} ₴/{item.unit} {item.stockLength ? `· Планки: ${item.stockLength} м` : ''}{Number(item.cornerPrice || 0) > 0 ? ` · Кут: ${item.cornerPrice} ₴` : ''}{Number(item.freeCorners || 0) > 0 ? ` · Безкоштовно: ${item.freeCorners}` : ''}</div>{item.billStock&&<div className="muted">Ціна за закуплену довжину</div>}{item.ledPrice&&<div className="muted">LED: {item.ledPrice} ₴/м</div>}{item.powerPrice&&<div className="muted">БЖ: {item.powerPrice} ₴/шт.</div>}{item.grillePrice&&<div className="muted">Решітка: {item.grillePrice} ₴/шт.</div>}<div style={{color:'#ffd87a',marginTop:5}}>Закупівля: {item.purchasePrice==null||item.purchasePrice===''?'не задано':`${item.purchasePrice} ₴/${item.unit}`}</div>{([['Кут',item.cornerPurchasePrice,'шт.'],['БЖ',item.powerPurchasePrice,'шт.'],['Решітка',item.grillePurchasePrice,'шт.']] as const).filter(([,value])=>value!=null&&value!=='').map(([label,value,unit])=><div key={label} className="muted">Закупівля · {label}: {value} ₴/{unit}</div>)}{item.description && <small className="muted">Примітка: {item.description}</small>}</div>
                <button className="button secondary" onClick={() => { setEditingCatalogId(item.id); setCatalogDraft({ ...emptyCatalogDraft, ...item, cornerPrice: item.cornerPrice ?? '0', freeCorners: item.freeCorners ?? '0', billStock:item.billStock??false,ledPrice:item.ledPrice??'',powerPrice:item.powerPrice??'',grillePrice:item.grillePrice??'',purchasePrice:item.purchasePrice??'',cornerPurchasePrice:item.cornerPurchasePrice??'',ledPurchasePrice:item.ledPurchasePrice??'',powerPurchasePrice:item.powerPurchasePrice??'',grillePurchasePrice:item.grillePurchasePrice??'' }) }}>Редагувати</button>
                <button className="icon-button" aria-label="Видалити" disabled={['fabric-msd','standard-profile','decorative-insert'].includes(item.id)} onClick={() => { if (confirm(`Видалити «${item.name}» з каталогу?`)) setCatalog(items => effectiveCatalog(items).filter(v => v.id !== item.id)) }}><Trash2 size={16}/></button>
              </div>)}
              {availableCatalog.filter(item => categoryOf(item) === catalogCategory).length === 0 && <p className="muted">У цій категорії поки немає позицій.</p>}
            </div>
            </>}
          </section>
        ) : estimateProject ? (
          <section className="content narrow">
            <button className="back-link" onClick={() => { setEstimateProject(null); if (estimateReturnToCreate) setCreating(true) }}><ArrowLeft size={16}/> Назад</button>
            <div className="page-heading"><div><div className="eyebrow">КОШТОРИС ОБ’ЄКТА · {estimateProject.id}</div><h1>{projectObjectName(estimateProject)}</h1><p className="muted">Замовник: {estimateProject.client || 'Не вказано'} · {estimateProject.address || 'Адресу не вказано'} · {estimateProject.rooms.length} кімнат · Дата заміру: {formatMeasurementDate(estimateProject.measurementDate)}</p></div></div>
            <div className="panel" style={{ marginBottom: 16, border: '2px solid #e5a900' }}>
              {(() => {
                const sections = estimateRows(estimateProject)
                const base = sections.reduce((sum, section) => sum + section.total, 0)
                const percent = Math.min(100,num(discountPercent))
                const afterDiscount = base * (1 - percent / 100)
                const payable = roundedEstimate ? Math.floor(afterDiscount / 100) * 100 : Math.round(afterDiscount)
                const deposit = num(estimateProject.deposit)
                const rooms = estimateProject.rooms
                const legacyRooms = rooms.filter(room=>!room.pricing)
                const sum = (fn: (room: Room) => number) => legacyRooms.reduce((v, room) => v + fn(room), 0)
                const area = rooms.reduce((v,room)=>v+(roomArea(room)||0),0)
                const perimeter = rooms.reduce((v,room)=>v+(roomPerimeter(room)||0),0)
                const insertLength = sum(room => Number(room.components?.insertLength || 0))
                const flyLength = sum(room => Number(room.components?.flyLength || 0))
                const udLength = sum(room => Number(room.components?.udLength || 0))
                const fnLength = sum(room => Number(room.components?.fn27Length || 0))
                const skLength = sum(room => (room.components?.sk30Items || []).reduce((v, item) => v + Number(item.length || 0), 0))
                const ledLength = sum(room => (room.components?.sk30Items || []).reduce((v, item) => v + ((item.ledEnabled ?? Number(item.ledLength || 0) > 0) ? Number(item.ledLength || 0) : 0), 0))
                const count = (fn: (room: Room) => number) => sum(fn)
                const metric = (label: string, value: number, unit: string) => value > 0 ? <div className="info-row" key={label}><span>{label}</span><b>{formatNumber(value)} {unit}</b></div> : null
                const qty = (label: string, value: number) => value > 0 ? <div className="info-row" key={label}><span>{label}</span><b>{formatNumber(value)} шт.</b></div> : null
                return <>
                  <h2 style={{ marginTop: 0 }}>Загальні обсяги об’єкта</h2>
                  {metric('Полотно, площа для кошторису', area, 'м²')}
                  {missingBounds(estimateProject)&&<p style={{color:'#ffd27a'}}>У деяких кімнатах не введено габарити для розрахунку полотна. Кошторис неповний.</p>}
                  {metric('Периметр кімнат', perimeter, 'пог. м')}
                  {metric('Декоративна вставка', insertLength, 'пог. м')}
                  {metric('ALUTAT FLY', flyLength, 'пог. м')}
                  {metric('Тіньовий профіль UD', udLength, 'пог. м')}
                  {metric('Карнизи SK 3.0', skLength, 'пог. м')}
                  {metric('Підсвітка карнизів', ledLength, 'пог. м')}
                  {metric('LED-профіль FN-27', fnLength, 'пог. м')}
                  {qty('Блоки живлення FLY', count(room => Number(room.components?.flyPower || 0)))}
                  {qty('Блоки живлення FN-27', count(room => Number(room.components?.fn27Power || 0)))}
                  {qty('Блоки живлення SK 3.0', count(room => (room.components?.sk30Items || []).reduce((v, item) => v + Number(item.power || 0), 0)))}
                  {qty('Магнітні решітки FLY', count(room => Number(room.components?.flyGrilles || 0)))}
                  {qty('Магнітні решітки FN-27', count(room => Number(room.components?.fn27Grilles || 0)))}
                  {qty('Магнітні решітки SK 3.0', count(room => (room.components?.sk30Items || []).reduce((v, item) => v + Number(item.grilles || 0), 0)))}
                  {(()=>{const totals=new Map<string,{label:string;quantity:number;unit:string}>();for(const room of rooms){if(!room.pricing)continue;for(const m of calculate(room.pricing,roomArea(room)||0,roomPerimeter(room)||0).materials){if(m.unit==='м²')continue;const key=m.label+'|'+m.unit;const old=totals.get(key);totals.set(key,{...m,quantity:(old?.quantity||0)+m.quantity})}}return [...totals.values()].map(m=>metric(m.label,m.quantity,m.unit))})()}
                  <h2 style={{ marginTop: 22 }}>Оплата</h2>
                  <div className="info-row"><b>Загальна сума</b><b>{money(payable)}</b></div>
                  {percent > 0 && <div className="info-row"><span>Знижка ({percent}%)</span><b>−{money(base-afterDiscount)}</b></div>}
                  <label style={{ ...labelStyle, marginTop: 8 }}>Внесений завдаток, грн
                    <NumericInput key={estimateProject.id + "-deposit"} style={inputStyle} integer commitOnBlur value={estimateProject.deposit || ''} onChange={updateEstimateDeposit} placeholder="Введи суму завдатку" />
                    <p className="muted">Зміна суми зберігається після виходу з поля. Додана сума отримує сьогоднішню дату; зменшення виправляє останні записи. Старі дати можна вказати у «Фінансах».</p>
                  </label>
                  <div className="info-row" style={{ fontSize: 18 }}><b>Залишок до оплати</b><b style={{ color: '#ffc247' }}>{money(payment(base,estimateProject).balance)}</b></div>
                  {payment(base,estimateProject).final>0 && <div className="info-row"><span>Остаточна оплата</span><b>{money(payment(base,estimateProject).final)}</b></div>}
                  {deposit+payment(base,estimateProject).final > payable && <p className="muted">Увага: отримана оплата перевищує суму кошторису.</p>}
                  <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 14 }}>
                    <button className="button secondary" onClick={() => updateEstimateTerms(discountPercent,!roundedEstimate)}>{roundedEstimate ? 'Скасувати заокруглення' : 'Заокруглити до сотень'}</button>
                    <button className="button secondary" onClick={() => setDiscountOpen(v => !v)}>Коригування</button>
                  </div>
                  {discountOpen && <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', padding: 12, background: '#1a2834', borderRadius: 10, marginTop: 14 }}>
                    <label style={{ ...labelStyle, flex: '1 1 150px', marginBottom: 0 }}>Знижка, %<NumericInput style={inputStyle} max={100} value={discountPercent} onChange={value => updateEstimateTerms(value,false)}/></label>
                    <span className="muted">Застосовується до загальної суми</span>
                  </div>}
                </>
              })()}
            </div>
            <div className="panel" style={{ marginTop: 12 }}>
              <h2 style={{ marginTop: 0 }}>Збереження та експорт</h2>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 18 }}>
                <button className="button primary" onClick={() => {
                  if (estimateProject.id === 'Чернетка') {
                    alert('Спочатку збережи об’єкт, тоді кошторис можна буде зберегти разом із ним.')
                    return
                  }
                  const updated = estimateProject
                  setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
                  setActive(prev => prev?.id === updated.id ? updated : prev)
                  alert('Об’єкт і кошторис збережено.')
                }}>Зберегти об’єкт</button>
                <button className="button secondary" onClick={() => exportEstimate('pdf')}>Кошторис по кімнатах PDF</button>
                <button className="button primary" onClick={() => exportEstimate('pdf', true)}>Детальний кошторис PDF</button>
                <button className="button secondary" onClick={() => exportEstimate('jpeg')}>Кошторис по кімнатах JPEG</button>
                <button className="button secondary" onClick={() => exportOverallEstimate('pdf')}>Загальний кошторис PDF</button>
                <button className="button secondary" onClick={() => exportOverallEstimate('jpeg')}>Загальний кошторис JPEG</button>
              </div>
            </div>
            <div className="panel" id="estimate-print-area">
              {estimateRows(estimateProject).map(section => <div key={section.room.id} style={{ marginBottom: 22 }}>
                <h2 style={{ borderBottom: '1px solid #647586', paddingBottom: 10 }}>{section.room.name}</h2>
                {section.rows.length ? section.rows.map((row, i) => <div className="info-row" key={i}><span>{row.label}</span><b>{money(row.amount)}</b></div>) : <p className="muted">Позиції ще не додані.</p>}
                <div className="info-row"><b>Разом за кімнату</b><b>{money(section.total)}</b></div>
              </div>)}
            </div>
          </section>
        ) : active && activeRoom ? (
          <section key={`room-${active.id}-${activeRoom.id}`} className="content narrow" style={roomSection === 'visualization' ? { maxWidth: 'none', width: '100%' } : undefined}>
            <button className="back-link" onClick={() => setActiveRoomId(null)}>
              <ArrowLeft size={16}/> До об’єкта {projectObjectName(active)}
            </button>
            <div className="page-heading">
              <div>
                <div className="eyebrow">КІМНАТА · {active.id}</div>
                <h1>{activeRoom.name}</h1>
                <p className="muted">Розміри та креслення стелі</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              <button style={{ ...buttonStyle, background: roomSection === 'measurements' ? '#ffb900' : '#405263', color: roomSection === 'measurements' ? '#18222c' : '#fff' }}
                onClick={() => setRoomSection('measurements')}><Ruler size={16}/> Розміри та креслення</button>
              <button style={{ ...buttonStyle, background: roomSection === 'components' ? '#ffb900' : '#405263', color: roomSection === 'components' ? '#18222c' : '#fff' }}
                onClick={() => setRoomSection('components')}><Layers3 size={16}/> Комплектуючі</button>
              <button style={{ ...buttonStyle, background: roomSection === 'visualization' ? '#ffb900' : '#405263', color: roomSection === 'visualization' ? '#18222c' : '#fff' }}
                onClick={() => setRoomSection('visualization')}><ImagePlus size={16}/> Візуалізація</button>
            </div>

            {roomSection === 'visualization' ? (() => {
              const viz = activeRoom.visualization || { wallLength: activeRoom.length?.toString() || '', roomHeight: '2.70', ceilingColor: 'Білий матовий', fabric: 'Матова', brightness: 80, marks: [] }
              const photos: VizPhoto[] = viz.photos?.length ? viz.photos : (viz.photo ? [{ id: 'legacy-photo', name: 'Фото 1', data: viz.photo, marks: viz.marks || [] }] : [])
              const activePhoto = photos.find(photo => photo.id === viz.activePhotoId) || photos[0]
              const marks = activePhoto?.marks || []
              const updateViz = (patch: Partial<NonNullable<Room['visualization']>>) => {
                const next = { ...viz, ...patch }
                if (patch.marks) {
                  const updatedPhotos = photos.length ? photos.map(photo => photo.id === activePhoto?.id ? { ...photo, marks: patch.marks || [] } : photo) : photos
                  updateRoom(activeRoom.id, { visualization: { ...next, photos: updatedPhotos, marks: patch.marks } })
                } else updateRoom(activeRoom.id, { visualization: next })
              }
              const addPhoto = (data: string, name: string) => {
                const photo: VizPhoto = { id: makeId(), name, data, marks: [] }
                const updated = [...photos, photo]
                updateRoom(activeRoom.id, { visualization: { ...viz, photos: updated, activePhotoId: photo.id, photo: data, marks: [] } })
                setPendingVizPoint(null); setEditingVizMarkId(null)
              }
              const updatePhotoList = (nextPhotos: VizPhoto[], nextActiveId?: string) => {
                const selected = nextPhotos.find(photo => photo.id === nextActiveId) || nextPhotos[0]
                updateRoom(activeRoom.id, { visualization: { ...viz, photos: nextPhotos, activePhotoId: selected?.id, photo: selected?.data || '', marks: selected?.marks || [] } })
                setPendingVizPoint(null); setEditingVizMarkId(null)
              }
              const tools = ['Паряща стеля (FLY)', 'Тіньовий профіль (UD)', 'Карниз / ніша SK 3.0', 'LED-лінія FN-27', 'Трекова система', 'Точковий світильник', 'Люстра', 'Штори']
              return <div className="viz-workspace" style={{ display: 'grid', gap: 14 }}>
                <style>{`.viz-columns{display:grid;grid-template-columns:minmax(300px,340px) minmax(0,1fr);gap:18px;align-items:start;min-width:0;width:100%}.viz-left,.viz-center,.viz-right{display:grid;gap:16px;min-width:0;align-content:start}.viz-left{grid-column:1;grid-row:1 / span 2}.viz-right{position:relative;grid-template-columns:repeat(2,minmax(0,1fr));grid-column:2}.viz-center{min-width:0;grid-column:2;grid-row:1}.viz-left .panel,.viz-right .panel,.viz-center .panel{padding:18px!important}.viz-mark-row{display:grid;grid-template-columns:16px minmax(120px,1fr) repeat(3,minmax(120px,auto));gap:10px;align-items:center;background:#17232d;border:1px solid #344756;border-radius:12px;padding:13px 14px;min-width:0}.viz-mark-row button{min-height:42px!important;padding:9px 12px!important;font-size:13px!important;justify-content:center}.viz-delete{background:#512d32!important;border:1px solid #a84d57!important;color:#ffd9dc!important}.viz-edit{background:#263c50!important;border:1px solid #54728d!important;color:#e6f2ff!important}.viz-mark-name{font-size:13px;line-height:1.35;overflow-wrap:anywhere}.viz-panel-title{font-size:16px;margin:0 0 11px}.viz-step{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.viz-step .pill{white-space:normal;line-height:1.25;min-height:46px;display:grid;place-items:center;border-radius:12px;font-weight:700}.viz-photo{aspect-ratio:16/9;min-height:360px}.viz-photo img{object-fit:contain}@media(max-width:1050px){.viz-columns{grid-template-columns:minmax(260px,310px) minmax(0,1fr)}.viz-right{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.viz-columns{grid-template-columns:minmax(0,1fr)}.viz-left,.viz-center,.viz-right{grid-column:1;grid-row:auto}.viz-right{grid-template-columns:minmax(0,1fr)}.viz-step{grid-template-columns:repeat(2,minmax(0,1fr))}.viz-photo{min-height:240px}.viz-mark-row{grid-template-columns:14px minmax(0,1fr);}.viz-mark-row button{grid-column:span 1}.viz-mark-name{font-size:12px}}`}</style>
                <div className="viz-step" aria-label="Етапи візуалізації">
                  {['Фото','Розміри','Розмітка','Параметри','Результат'].map((step, i) => <button type="button" key={step} className="pill" aria-current={vizStep === i ? 'step' : undefined} onClick={() => {
                    setVizStep(i)
                    const targets = ['viz-photo-upload','viz-dimensions','viz-photo-work','viz-parameters','viz-result']
                    window.setTimeout(() => document.getElementById(targets[i])?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
                  }} style={{ cursor: 'pointer', textAlign: 'center', padding: '12px 9px', minHeight: 46, border: vizStep === i ? '2px solid #ffd27a' : '1px solid #52687a', background: vizStep === i ? '#ff9f1c' : '#263746', color: vizStep === i ? '#18222c' : '#dce5ec', fontSize: 14, fontWeight: 700 }}>{i+1} · {step}</button>)}
                </div>
                <div className="viz-columns">
                  <div className="viz-left">
                    <div className="panel" id="viz-elements">
                      <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Елементи</h2>
                      <div style={{ display: 'grid', gap: 7 }}>
                        {tools.map(tool => { const colors: Record<string,string> = { 'Паряща стеля (FLY)':'#ffb52e', 'Тіньовий профіль (UD)':'#ff7777', 'Карниз / ніша SK 3.0':'#20d7e8', 'LED-лінія FN-27':'#ffffff', 'Трекова система':'#d9a7ff', 'Точковий світильник':'#65d98a', 'Люстра':'#65d98a', 'Штори':'#c28cff' }; return <button key={tool} className="button secondary" style={{ justifyContent: 'flex-start', fontSize: 12, padding: '9px 8px', border: selectedVizTool === tool ? `2px solid ${colors[tool]}` : '1px solid #405263', color: colors[tool], background: selectedVizTool === tool ? '#263746' : '#192630' }} onClick={() => { setSelectedVizTool(tool); setPendingVizPoint(null) }}><span style={{ width: 9, height: 9, borderRadius: 8, background: colors[tool], display: 'inline-block', flexShrink: 0 }}/>{tool}</button> })}
                      </div>
                    </div>
                    <div className="panel" id="viz-dimensions">
                      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Розміри приміщення</h2>
                      <label style={labelStyle}>Скільки стін на фото?
                        <select style={inputStyle} value={viz.wallMode || 'one'} onChange={e => updateViz({ wallMode: e.target.value as 'one' | 'two' })}><option value="one">Одна стіна</option><option value="two">Дві стіни — ліва та права</option></select>
                      </label>
                      {viz.wallMode === 'two' ? <>
                        <label style={labelStyle}>Довжина лівої стіни, м<input style={inputStyle} value={viz.leftWallLength || ''} onChange={e => updateViz({ leftWallLength: e.target.value })} placeholder="4,20"/></label>
                        <label style={labelStyle}>Довжина правої стіни, м<input style={inputStyle} value={viz.rightWallLength || ''} onChange={e => updateViz({ rightWallLength: e.target.value })} placeholder="3,60"/></label>
                      </> : <label style={labelStyle}>Довжина стіни, м<input style={inputStyle} value={viz.wallLength || ''} onChange={e => updateViz({ wallLength: e.target.value })} placeholder="4,20"/></label>}
                      <label style={labelStyle}>Висота приміщення, м<input style={inputStyle} value={viz.roomHeight || ''} onChange={e => updateViz({ roomHeight: e.target.value })} placeholder="2,70"/></label>
                      <h3 style={{ margin: '16px 0 8px', fontSize: 15 }}>Вікна та карнизи</h3>
                      <label style={labelStyle}>Вікна лівої стіни — ширина, м<input style={inputStyle} value={viz.leftWindowWidths ?? (viz.wallMode === 'one' ? viz.windowWidths || '' : '')} onChange={e => updateViz({ leftWindowWidths: e.target.value })} placeholder="1,50; 1,20"/></label>
                      {viz.wallMode === 'two' && <label style={labelStyle}>Вікна правої стіни — ширина, м<input style={inputStyle} value={viz.rightWindowWidths || ''} onChange={e => updateViz({ rightWindowWidths: e.target.value })} placeholder="1,30"/></label>}
                      <label style={labelStyle}>Розташування карнизів<select style={inputStyle} value={viz.curtainLayout || 'straight'} onChange={e => updateViz({ curtainLayout: e.target.value as 'straight' | 'L' | 'two' })}><option value="straight">Один прямий</option><option value="L">Г-подібний</option><option value="two">Два окремі</option></select></label>
                      <label style={labelStyle}>Довжина карниза SK 3.0, м<input style={inputStyle} inputMode="decimal" value={viz.curtainLength || ''} onChange={e => updateViz({ curtainLength: e.target.value })} placeholder="Наприклад, 1,80"/></label>
                      <p className="muted" style={{ fontSize: 11, margin: '-3px 0 8px' }}>На фото приблизно познач карниз над вікном. Потім у списку розмітки натисни «Підігнати за розміром».</p>
                      <div style={{ height: 1, background: '#344756', margin: '8px 0 12px' }}/>
                      <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Оздоблення стін і підлоги</h3>
                      <label style={labelStyle}>Колір стін<input style={inputStyle} value={viz.wallColor || ''} onChange={e => updateViz({ wallColor: e.target.value })} placeholder="Світло-бежеві"/></label>
                      <label style={labelStyle}>Колір / матеріал підлоги<input style={inputStyle} value={viz.floorColor || ''} onChange={e => updateViz({ floorColor: e.target.value })} placeholder="Дуб натуральний"/></label>
                      <label style={labelStyle}>Колір штор<input style={inputStyle} value={viz.curtainColor || 'Світло-сірі'} onChange={e => updateViz({ curtainColor: e.target.value })} placeholder="Бежеві, оливкові"/></label>
                      <label id="viz-photo-upload" style={{ ...labelStyle, marginBottom: 0 }}>Фото кімнати<input type="file" accept="image/*" style={{ ...inputStyle, marginTop: 6, padding: 9, cursor: 'pointer', fontSize: 13 }} onChange={e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        if (!file.type.startsWith('image/')) { alert('Обери файл зображення.'); e.currentTarget.value = ''; return }
                        const reader = new FileReader()
                        reader.onerror = () => alert('Не вдалося прочитати фото. Спробуй інше зображення.')
                        reader.onload = () => {
                          const image = new Image()
                          image.onerror = () => alert('Не вдалося відкрити це зображення.')
                          image.onload = () => {
                            const scale = Math.min(1, 1600 / Math.max(image.width, image.height))
                            const canvas = document.createElement('canvas')
                            canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
                            const ctx = canvas.getContext('2d')
                            if (!ctx) { alert('Не вдалося обробити фото.'); return }
                            ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
                            addPhoto(canvas.toDataURL('image/jpeg', 0.82), file.name.replace(/\.[^.]+$/, '') || `Фото ${photos.length + 1}`)
                          }
                          image.src = String(reader.result)
                        }
                        reader.readAsDataURL(file); e.currentTarget.value = ''
                      }}/></label>
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}><strong style={{ fontSize: 13 }}>Фотографії · {photos.length}</strong><span className="muted" style={{ fontSize: 11 }}>Кожен ракурс має власну розмітку</span></div>
                        {photos.length > 0 ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(105px,1fr))', gap: 8 }}>{photos.map((photo, index) => <div key={photo.id} style={{ border: activePhoto?.id === photo.id ? '2px solid #ffb900' : '1px solid #405263', borderRadius: 10, padding: 5, background: '#17232d', minWidth: 0 }}><button type="button" onClick={() => updatePhotoList(photos, photo.id)} style={{ display: 'block', width: '100%', border: 0, padding: 0, background: 'transparent', color: '#fff', cursor: 'pointer', textAlign: 'left' }}><img src={photo.data} alt={photo.name} style={{ width: '100%', aspectRatio: '16/10', objectFit: 'cover', borderRadius: 6, display: 'block' }}/><span style={{ display: 'block', fontSize: 11, fontWeight: 700, padding: '5px 2px 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{index + 1}. {photo.name}</span><span className="muted" style={{ fontSize: 10 }}>{photo.marks.length} елементів {activePhoto?.id === photo.id ? '· активне' : ''}</span></button><button type="button" className="button secondary viz-delete" style={{ width: '100%', minHeight: 32, marginTop: 5, fontSize: 11 }} onClick={() => { if (window.confirm(`Видалити фото «${photo.name}» разом із його розміткою?`)) updatePhotoList(photos.filter(item => item.id !== photo.id), activePhoto?.id === photo.id ? photos.find(item => item.id !== photo.id)?.id : activePhoto?.id) }}>Видалити фото</button></div>)}</div> : <p className="muted" style={{ fontSize: 12, margin: '7px 0 0' }}>Додай перше фото. Можна завантажити кілька ракурсів цієї кімнати.</p>}
                      </div>
                    </div>
                  </div>

                  <div className="viz-center">
                    <div className="panel" id="viz-photo-work" style={{ padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                        <div><div className="eyebrow">ОБ’ЄКТ · {activeRoom.name}</div><h2 style={{ margin: '3px 0 0', fontSize: 17 }}>Розмітка · {activePhoto?.name || 'Фото не вибране'}</h2></div>
                        <span className="pill" style={{ background: '#174b3b', color: '#8ce5b8' }}>{marks.length} елементів · ракурс {Math.max(0, photos.findIndex(photo => photo.id === activePhoto?.id) + 1)}/{photos.length}</span>
                      </div>
                      <div className="viz-photo" style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', minHeight: 280, background: '#101820', borderRadius: 10, overflow: 'hidden', border: '1px solid #536575' }}>
                        {activePhoto ? <img src={activePhoto.data} alt="Фото кімнати для розмітки" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}/> : <div style={{ height: '100%', minHeight: 220, display: 'grid', placeItems: 'center', color: '#aebdca', textAlign: 'center', padding: 25 }}><div><ImagePlus size={38}/><p style={{ marginBottom: 5 }}>Завантаж фото кімнати</p><span className="muted" style={{ fontSize: 12 }}>Після цього можна наносити лінії та позначки</span></div></div>}
                        {activePhoto && <div style={{ position: 'absolute', inset: 0, cursor: 'crosshair', touchAction: 'none' }} onClick={e => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          const point = { x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)), y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)) }
                          const pointTools = ['Точковий світильник', 'Люстра']
                          const colors: Record<string, string> = { 'Паряща стеля (FLY)': '#ffb52e', 'Тіньовий профіль (UD)': '#ff7777', 'Карниз / ніша SK 3.0': '#20d7e8', 'LED-лінія FN-27': '#ffffff', 'Трекова система': '#d9a7ff', 'Точковий світильник': '#65d98a', 'Люстра': '#65d98a', 'Штори': '#c28cff' }
                          if (pointTools.includes(selectedVizTool)) {
                            if (editingVizMarkId) { updateViz({ marks: marks.map(m => m.id === editingVizMarkId ? { ...m, x: point.x, y: point.y, x2: undefined, y2: undefined } : m) }); setEditingVizMarkId(null) }
                            else updateViz({ marks: [...marks, { id: makeId(), type: selectedVizTool, x: point.x, y: point.y, label: selectedVizTool, color: colors[selectedVizTool] }] });
                            setPendingVizPoint(null); return
                          }
                          if (!pendingVizPoint) { setPendingVizPoint(point); return }
                          if (editingVizMarkId) { updateViz({ marks: marks.map(m => m.id === editingVizMarkId ? { ...m, x: pendingVizPoint.x, y: pendingVizPoint.y, x2: point.x, y2: point.y } : m) }); setEditingVizMarkId(null); setPendingVizPoint(null); return }
                          updateViz({ marks: [...marks, { id: makeId(), type: selectedVizTool, x: pendingVizPoint.x, y: pendingVizPoint.y, x2: point.x, y2: point.y, label: selectedVizTool, color: colors[selectedVizTool] || '#ffb52e', ledEnabled: ['Паряща стеля (FLY)', 'Тіньовий профіль (UD)', 'Карниз / ніша SK 3.0', 'LED-лінія FN-27'].includes(selectedVizTool), ledColor: 'Теплий 3000K', ledPower: '14' }] }); setPendingVizPoint(null)
                        }}>
                          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
                            {marks.filter(mark => !hiddenVizTypes.includes(mark.type)).map(mark => mark.x2 !== undefined && mark.y2 !== undefined ? <g key={mark.id}>{mark.type === 'Штори' && marks.some(m => m.type === 'Карниз / ніша SK 3.0') && <rect x={Math.min(mark.x, mark.x2)} y={Math.min(mark.y, mark.y2)} width={Math.max(1, Math.abs(mark.x2 - mark.x))} height={Math.max(0, 100 - Math.min(mark.y, mark.y2))} fill="#c9b4a2" opacity="0.32"/>}<line x1={mark.x} y1={mark.y} x2={mark.x2} y2={mark.y2} stroke="#101820" strokeWidth="11" vectorEffect="non-scaling-stroke" strokeLinecap="round"/><line x1={mark.x} y1={mark.y} x2={mark.x2} y2={mark.y2} stroke={mark.color || '#ffb52e'} strokeWidth="6" vectorEffect="non-scaling-stroke" strokeLinecap="round"/><circle cx={mark.x} cy={mark.y} r="0.8" fill={mark.color || '#ffb52e'}/><circle cx={mark.x2} cy={mark.y2} r="0.8" fill={mark.color || '#ffb52e'}/></g> : <g key={mark.id}><circle cx={mark.x} cy={mark.y} r={mark.type === 'Люстра' ? '2.2' : '1.7'} fill="#101820" stroke={mark.color || '#ffb52e'} strokeWidth="0.7"/><circle cx={mark.x} cy={mark.y} r="0.65" fill={mark.color || '#ffb52e'}/><text x={mark.x} y={mark.y + 0.35} textAnchor="middle" fontSize="1.7" fill="#101820">{mark.type === 'Люстра' ? 'Л' : '•'}</text></g>)}
                            {pendingVizPoint && <circle cx={pendingVizPoint.x} cy={pendingVizPoint.y} r="1.4" fill="#fff" stroke="#ff9f1c" strokeWidth="0.6"/>}
                          </svg>
                        </div>}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 9 }}>
                        <span className="muted" style={{ fontSize: 12 }}>{editingVizMarkId ? (pendingVizPoint ? 'Нова початкова точка задана — натисни нову кінцеву точку.' : 'Редагування: вкажи нову початкову та кінцеву точки лінії.') : pendingVizPoint ? 'Початок задано — натисни кінцеву точку.' : `Активний інструмент: ${selectedVizTool}. ${selectedVizTool.includes('FLY') || selectedVizTool.includes('UD') ? 'Веди лінію вздовж самого краю стіни.' : selectedVizTool === 'Карниз / ніша SK 3.0' ? 'Карниз: 12 см від стіни, по центру вікна.' : selectedVizTool === 'Штори' ? 'Познач лінію карниза; штори будуть показані за наявності карниза.' : 'Натисни дві точки на фото.'}`}</span>
                        <button className="button secondary" style={{ padding: '6px 10px', fontSize: 12 }} disabled={!pendingVizPoint} onClick={() => { setPendingVizPoint(null); setEditingVizMarkId(null) }}>Скасувати</button>
                      </div>
                    </div>
                    <div className="panel" style={{ padding: 15 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><h3 style={{ margin: 0, fontSize: 16 }}>Розмітка та елементи</h3><span className="muted" style={{ fontSize: 11 }}>Лінії зберігаються в кімнаті</span></div>
                      {marks.length ? <div style={{ display: 'grid', gap: 6, marginTop: 9 }}>{marks.map((mark, index) => <div key={mark.id} className="viz-mark-row" style={{ borderColor: editingVizMarkId === mark.id ? (mark.color || '#ffb52e') : '#344756', background: editingVizMarkId === mark.id ? '#263746' : '#17232d' }}><span style={{ width: 12, height: 12, borderRadius: 8, background: mark.color || '#ffb52e' }}/><span className="viz-mark-name">{index + 1}. {mark.label}</span>{['Паряща стеля (FLY)','Тіньовий профіль (UD)','Карниз / ніша SK 3.0','LED-лінія FN-27'].includes(mark.type) && <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '5px 0' }}><label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={mark.ledEnabled ?? true} onChange={e => updateViz({ marks: marks.map(m => m.id === mark.id ? { ...m, ledEnabled: e.target.checked } : m) })}/> LED-підсвітка</label>{(mark.ledEnabled ?? true) && <><select aria-label="Колір LED" value={mark.ledColor || 'Теплий 3000K'} onChange={e => updateViz({ marks: marks.map(m => m.id === mark.id ? { ...m, ledColor: e.target.value } : m) })} style={{ ...inputStyle, width: 'auto', minWidth: 130, margin: 0, padding: '6px 8px' }}><option>Теплий 3000K</option><option>Нейтральний 4000K</option><option>Холодний 6000K</option></select><select aria-label="Потужність LED" value={mark.ledPower || '14'} onChange={e => updateViz({ marks: marks.map(m => m.id === mark.id ? { ...m, ledPower: e.target.value as '10' | '14' } : m) })} style={{ ...inputStyle, width: 'auto', minWidth: 105, margin: 0, padding: '6px 8px' }}><option value="10">10 Вт/м</option><option value="14">14 Вт/м</option></select></>}</div>}{mark.type === 'Карниз / ніша SK 3.0' && <button className="button secondary" style={{ background: '#174b49', border: '1px solid #20b8aa', color: '#c8fff7', minHeight: 42, padding: '8px 10px', fontSize: 12 }} onClick={() => {
                          const parseNum = (v: string | undefined) => Number(String(v || '').replace(',', '.').trim())
                          const targetLength = parseNum(viz.curtainLength)
                          const windowValues = String(viz.leftWindowWidths ?? viz.windowWidths ?? '').split(/[;,]/).map(v => parseNum(v)).filter(v => v > 0)
                          const curtainIndex = marks.filter(m => m.type === 'Карниз / ніша SK 3.0').findIndex(m => m.id === mark.id)
                          const windowWidth = windowValues[curtainIndex] || windowValues[0]
                          if (!targetLength || !windowWidth || mark.x2 === undefined || mark.y2 === undefined) { alert('Вкажи довжину карниза та ширину відповідного вікна. Для цього карниза познач приблизну горизонтальну лінію над вікном.'); return }
                          const factor = targetLength / windowWidth
                          const centerX = (mark.x + mark.x2) / 2
                          const centerY = (mark.y + mark.y2) / 2
                          const half = Math.abs(mark.x2 - mark.x) * factor / 2
                          const height = parseNum(viz.roomHeight) || 2.7
                          const offsetY = Math.min(12, (0.12 / height) * 100)
                          const next = { ...mark, x: Math.max(0, Math.min(100, centerX - half)), x2: Math.max(0, Math.min(100, centerX + half)), y: Math.max(0, centerY - offsetY), y2: Math.max(0, centerY - offsetY), label: `${mark.label} · ${targetLength.toFixed(2)} м` }
                          updateViz({ marks: marks.map(m => m.id === mark.id ? next : m) })
                        }}>↔ Підігнати за розміром</button>}<button className="button secondary viz-edit" onClick={() => { setEditingVizMarkId(mark.id); setPendingVizPoint(null); setHiddenVizTypes(prev => prev.filter(v => v !== mark.type)); }}>✎ Редагувати</button><button className="button secondary viz-delete" onClick={() => { if (window.confirm('Видалити цей елемент розмітки?')) { updateViz({ marks: marks.filter(m => m.id !== mark.id) }); if (editingVizMarkId === mark.id) { setEditingVizMarkId(null); setPendingVizPoint(null) } } }}>✕ Видалити</button></div>)}</div> : <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Поки немає нанесених елементів.</p>}
                    </div>
                  </div>

                  <div className="viz-right">
                    <div className="panel" id="viz-parameters">
                      <h2 className="viz-panel-title">Параметри</h2>
                      <label style={labelStyle}>Колір полотна<select style={inputStyle} value={viz.ceilingColor || 'Білий матовий'} onChange={e => updateViz({ ceilingColor: e.target.value })}><option>Білий матовий</option><option>Білий глянець</option><option>Чорний матовий</option><option>Айворі</option><option>Інший</option></select></label>
                      <label style={labelStyle}>Фактура<select style={inputStyle} value={viz.fabric || 'Матова'} onChange={e => updateViz({ fabric: e.target.value })}><option>Матова</option><option>Сатинова</option><option>Глянцева</option></select></label>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Яскравість: {viz.brightness ?? 80}%<input style={inputStyle} type="range" min="10" max="100" value={viz.brightness ?? 80} onChange={e => updateViz({ brightness: Number(e.target.value) })}/></label>
                    </div>
                    <div className="panel" id="viz-result" style={{ background: '#172630', gridColumn: '1 / -1' }}>
                      <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Результат · керування освітленням</h3>
                      {(() => { const state = viz.lightingVisibility || { led: true, chandelier: true, spots: true }; const toggle = (key: 'led' | 'chandelier' | 'spots') => updateViz({ lightingVisibility: { ...state, [key]: !state[key] } }); return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>{([{key:'led',label:'LED-підсвітка'},{key:'chandelier',label:'Люстри'},{key:'spots',label:'Точкові'}] as const).map(item => <label key={item.key} style={{ display:'flex',alignItems:'center',gap:7,padding:'9px 12px',border:'1px solid #405263',borderRadius:9,fontSize:13 }}><input type="checkbox" checked={state[item.key]} onChange={() => toggle(item.key)}/>{item.label}</label>)}</div> })()}
                      <p className="muted" style={{ fontSize: 11, margin: 0 }}>Перемикачі зберігають бажаний стан освітлення для майбутньої AI-візуалізації. Реалістичний AI-рендер ще не підключений — фото поки не змінюється автоматично.</p>
                    </div>
                  </div>
                </div>
              </div>
            })() : roomSection === 'components' ? (
              activeRoom.pricing ? <RoomComponents pricing={activeRoom.pricing} catalog={availableCatalog} area={roomArea(activeRoom)} perimeter={roomPerimeter(activeRoom)} onChange={pricing=>updateRoom(activeRoom.id,{pricing})}/> :
              <div className="panel form-panel"><h2>Комплектуючі · попередня версія</h2><p>Старий кошторис збережено за попередніми тарифами. Для редагування комплектуючих переведи кімнату на новий каталог. Перевір суму після переходу.</p>
              {estimateRows({...active,rooms:[activeRoom]})[0].rows.map((r,i)=><div className="info-row" key={i}><span>{r.label}</span><b>{money(r.amount)}</b></div>)}
              <div className="room-area"><span>Старий кошторис</span><strong>{money(componentEstimate(activeRoom).total)}</strong></div>
              <button className="button" onClick={()=>{const pricing=convertLegacyRoom(activeRoom);const total=calculate(pricing,roomArea(activeRoom)||0,roomPerimeter(activeRoom)||0).total;if(confirm(`Перейти на новий каталог? Старий кошторис: ${money(componentEstimate(activeRoom).total)}. Після переходу: ${money(total)}. Перевір кількості та ціни.`))updateRoom(activeRoom.id,{pricing})}}>Перейти до нового каталогу</button></div>
            ) : (
            <>
            <div style={{ ...panelStyle, marginBottom: 18 }}>
              <h2 style={{ marginTop: 0 }}>Тип приміщення</h2>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  style={{ ...buttonStyle, background: activeRoom.shape === 'rectangle' ? '#ffb900' : '#405263', color: activeRoom.shape === 'rectangle' ? '#18222c' : '#fff' }}
                  onClick={() => {if(activeRoom.shape==='rectangle')return;if((roomHasFeatures(activeRoom)||activeRoom.reference0)&&!confirm('Зміна форми скине точку 0, заокруглення, дуги та вирізи. Продовжити?'))return;updateRoom(activeRoom.id,{shape:'rectangle',sides:activeRoom.sides.length===4?activeRoom.sides:makeSides(4),contourFeatures:undefined,reference0:undefined})}}
                >Прямокутник</button>
                <button
                  style={{ ...buttonStyle, background: activeRoom.shape === 'polygon' ? '#ffb900' : '#405263', color: activeRoom.shape === 'polygon' ? '#18222c' : '#fff' }}
                  onClick={() => {if(activeRoom.shape==='polygon')return;if((roomHasFeatures(activeRoom)||activeRoom.reference0)&&!confirm('Зміна форми скине точку 0, заокруглення, дуги та вирізи. Продовжити?'))return;updateRoom(activeRoom.id,{shape:'polygon',sides:activeRoom.sides.length>=3?activeRoom.sides:makeSides(4),vertices:activeRoom.vertices||regularVertices(activeRoom.sides.length||4),contourFeatures:undefined})}}
                >Складна форма</button>
              </div>
            </div>

            <div style={{ ...panelStyle, marginBottom: 18 }}>
              <h2 style={{ marginTop: 0 }}>Позначення полотна</h2>
              <label style={labelStyle}>Номер / назва полотна
                <input style={inputStyle} type="text"
                  value={activeRoom.canvasNumber || ''}
                  onChange={e => updateRoom(activeRoom.id, { canvasNumber: e.target.value })}
                  placeholder="Наприклад, Білий мат 1303"/>
              </label>
              <p className="muted">Цей напис з’явиться в центрі креслення та в завданні монтажникам.</p>
            </div>

            {activeRoom.shape === 'rectangle' ? (
              <div style={panelStyle}>
                <h2 style={{ marginTop: 0 }}>Розміри приміщення</h2>
                <label style={labelStyle}>Довжина, см
                  <CmInput key={activeRoom.id + '-length'} style={inputStyle}
                    value={activeRoom.length}
                    onChange={value => updateRoom(activeRoom.id, { length: value === '' ? undefined : Number(value) })}
                    placeholder="Наприклад, 520"/>
                </label>
                <label style={labelStyle}>Ширина, см
                  <CmInput key={activeRoom.id + '-width'} style={inputStyle}
                    value={activeRoom.width}
                    onChange={value => updateRoom(activeRoom.id, { width: value === '' ? undefined : Number(value) })}
                    placeholder="Наприклад, 360"/>
                </label>
                <div className="room-area">
                  <span>Площа</span>
                  <strong>{actualRoomArea(activeRoom)!==null ? `${formatNumber(actualRoomArea(activeRoom)!)} м²` : '—'}</strong>
                </div>
                <details style={{marginTop:20}} open={Object.values(activeRoom.diagonals||{}).some(v=>Number(v)>0)||undefined}><summary style={{fontWeight:700,cursor:'pointer'}}>+ Контрольні діагоналі від A</summary>
                <p className="muted">Внеси виміряні діагоналі. Додаткові пари кутів можна вибрати нижче.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 12 }}>
                  {diagonalKeys(activeRoom.sides.length).map(diagonal => (
                    <label key={diagonal.key} style={labelStyle}>
                      {diagonal.label}, см
                      <CmInput key={activeRoom.id + diagonal.key} style={inputStyle}
                        value={(activeRoom.diagonals || {})[diagonal.key] || ''}
                        onChange={value => updateDiagonal(activeRoom, diagonal.key, value)}
                        placeholder="0"/>
                    </label>
                  ))}
                </div>
                </details>
                {extraMeasurements(activeRoom)}
                {featuresEditor(activeRoom)}
                {roomHasFeatures(activeRoom)&&areaModeEditor(activeRoom)}
                <div className="room-area">
                  <span>Периметр</span>
                  <strong>{roomPerimeter(activeRoom)!==null ? `${formatNumber(roomPerimeter(activeRoom)!)} м` : '—'}</strong>
                </div>
                <div style={{ marginTop: 22, padding: 14, background: '#1a2834', borderRadius: 10 }}>
                  <svg viewBox="0 0 360 230" width="100%" role="img" aria-label="Креслення прямокутної кімнати">
                    {(()=>{const feature=featureDrawing(activeRoom),pts=drawingPoints(activeRoom);return <>
                      {feature?<path d={feature.path} fillRule="evenodd" fill="#33495b" stroke="#ffb900" strokeWidth="3"/>:<polygon points={pts.map(v=>`${v.x},${v.y}`).join(' ')} fill="#33495b" stroke="#ffb900" strokeWidth="3"/>}{feature?.centers.map((p,i)=><text key={i} x={p.x} y={p.y} fill="#fff" textAnchor="middle" fontSize="12">В{i+1}</text>)}
                      {pts.map((v,i)=><g key={i}><circle cx={v.x} cy={v.y} r="5" fill="#ffb900"/><text x={v.x+8} y={v.y-8} fill="#ffcf52" fontSize="14" fontWeight="bold">{String.fromCharCode(65+i)}</text></g>)}
                    </>})()}
                  </svg>
                  {rectangleMismatch(activeRoom)&&<p style={{color:'#ffd27a'}}>{geometryNote(activeRoom)}</p>}
                </div>
                <p className="muted">Площа та периметр обчислюються автоматично за фактичним контуром, включно з вирізами.</p>
              </div>
            ) : (
              <div style={panelStyle}>
                <h2 style={{ marginTop: 0 }}>Креслення складної форми</h2>
                <p className="muted">Намалюй приблизний контур точками, внеси фактичні довжини та діагоналі. У режимі «За розмірами» малюнок автоматично оновлюється при зміні замірів.</p>
                <label style={labelStyle}>Кількість кутів
                  <select style={inputStyle} value={activeRoom.sides.length || 4}
                    onChange={e => changeSideCount(activeRoom, Number(e.target.value))}>
                    {Array.from({length:10},(_,i)=>i+3).map(n=><option key={n} value={n}>{n} кутів</option>)}
                  </select>
                </label>

                {geometryEditor(activeRoom)}
                <div style={{ margin: '12px 0', padding: 12, background: '#1a2834', borderRadius: 10, touchAction: 'none' }}>
                  <svg
                    viewBox="0 0 360 230"
                    width="100%"
                    role="img"
                    aria-label="Редаговане креслення кімнати"
                    style={{ display: 'block', touchAction: 'none', userSelect: 'none' }}
                  >
                    {(()=>{const feature=featureDrawing(activeRoom);return feature?<><path d={feature.path} fillRule="evenodd" fill="#33495b" stroke="#ffb900" strokeWidth="3"/>{feature.centers.map((p,i)=><text key={i} x={p.x} y={p.y} fill="#fff" textAnchor="middle" fontSize="12">В{i+1}</text>)}</>:<polygon points={editorPoints.map(v=>`${v.x},${v.y}`).join(' ')} fill="#33495b" stroke="#ffb900" strokeWidth="3" strokeLinejoin="round"/>})()}
                    {(()=>{const p=referenceDrawing(activeRoom,editorPoints,true);return p?<g pointerEvents="none">{editorPoints.map((v,i)=>Number(activeRoom.reference0?.[String.fromCharCode(65+i)])>0?<line key={i} x1={p.x} y1={p.y} x2={v.x} y2={v.y} stroke="#80c9ff" strokeWidth="1.2" strokeDasharray="5 4"/>:null)}<circle cx={p.x} cy={p.y} r="6" fill="#ff4545" stroke="#fff"/><text x={p.x+8} y={p.y-8} fontSize="16" fontWeight="bold" fill="#ff7777">0</text></g>:null})()}
                    {editorPoints.map((v, i, arr) => {
                      const next = arr[(i + 1) % arr.length]
                      const label = `${String.fromCharCode(65+i)}–${String.fromCharCode(65+((i+1)%arr.length))}`
                      return <g key={`side-${i}`}>
                        <text x={(v.x+next.x)/2} y={(v.y+next.y)/2-8} textAnchor="middle" fill="#ffffff" fontSize="11">{label}</text>
                      </g>
                    })}
                    {editorPoints.map((v, i) => (
                      <g key={`point-${i}`}>
                        <circle
                          cx={v.x} cy={v.y} r="13"
                          fill="#ffb900" stroke="#fff2bd" strokeWidth="2"
                          style={{ cursor: activeRoom.geometryMode==='measured'?'default':'grab', touchAction: 'none' }}
                          onPointerDown={e => {
                            if(activeRoom.geometryMode==='measured')return
                            e.preventDefault()
                            e.stopPropagation()
                            const svg = e.currentTarget.ownerSVGElement
                            if (!svg) return
                            e.currentTarget.setPointerCapture(e.pointerId)
                          }}
                          onPointerMove={e => {
                            if(activeRoom.geometryMode==='measured')return
                            if (!(e.buttons || e.pressure > 0)) return
                            const svg = e.currentTarget.ownerSVGElement
                            if (!svg) return
                            const matrix=svg.getScreenCTM();if(!matrix)return
                            const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY
                            const local=p.matrixTransform(matrix.inverse())
                            const x = Math.max(12, Math.min(348, local.x))
                            const y = Math.max(12, Math.min(218, local.y))
                            updateVertex(activeRoom, i, { x, y })
                          }}
                        />
                        <text x={v.x+11} y={v.y-11} fill="#ffcf52" fontSize="14" fontWeight="bold">{String.fromCharCode(65+i)}</text>
                      </g>
                    ))}
                  </svg>
                </div>

                <h3 style={{ marginTop: 20 }}>Довжини сторін</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 12 }}>
                  {activeRoom.sides.map(side => (
                    <label key={side.id} style={labelStyle}>
                      {side.label}, см
                      <CmInput key={activeRoom.id + side.id} style={inputStyle} value={side.length}
                        onChange={value => updateSide(activeRoom, side.id, value)} placeholder="0"/>
                    </label>
                  ))}
                </div>
                {referenceEditor(activeRoom)}
                <details style={{marginTop:20}} open={Object.values(activeRoom.diagonals||{}).some(v=>Number(v)>0)||undefined}><summary style={{fontWeight:700,cursor:'pointer'}}>+ Контрольні діагоналі від A</summary>
                <p className="muted">Внеси виміряні діагоналі. Додаткові пари кутів можна вибрати нижче.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 12 }}>
                  {diagonalKeys(activeRoom.sides.length).map(diagonal => (
                    <label key={diagonal.key} style={labelStyle}>
                      {diagonal.label}, см
                      <CmInput key={activeRoom.id + diagonal.key} style={inputStyle}
                        value={(activeRoom.diagonals || {})[diagonal.key] || ''}
                        onChange={value => updateDiagonal(activeRoom, diagonal.key, value)}
                        placeholder="0"/>
                    </label>
                  ))}
                </div>
                </details>
                {extraMeasurements(activeRoom)}
                {featuresEditor(activeRoom)}
                {areaModeEditor(activeRoom)}
                <div className="room-area">
                  <span>Периметр</span>
                  <strong>{roomPerimeter(activeRoom)!==null?`${formatNumber(roomPerimeter(activeRoom)!)} м`:'Перевір розміри'}</strong>
                </div>
                <p style={{ color: '#ffd27a', fontSize: 13, lineHeight: 1.5 }}>
                  Для точного контуру потрібні всі сторони та достатньо діагоналей. У режимі «За розмірами» площа розраховується за відновленим контуром, зокрема увігнутим. У ручному режимі старий розрахунок площі трикутниками від A не гарантує точності для увігнутих стель. Перевір форму та контрольні розміри перед виготовленням.
                </p>
              </div>
            )}
            </>
            )}
          </section>
        ) : active ? (
          <section key={`project-${active.id}`} className="content">
            <button className="back-link" onClick={() => setActive(null)}><ArrowLeft size={16}/> До списку об’єктів</button>
            <div className="page-heading">
              <div><div className="eyebrow">ОБ’ЄКТ · {active.id}</div><h1>{projectObjectName(active)}</h1><p className="muted">Замовник: {active.client || 'Не вказано'} · Створено {new Date(active.created).toLocaleDateString('uk-UA')}</p></div>
              <span className="pill">{active.archivedAt?'Архів · ':''}{active.status}</span>
            </div>
            <div className="panel" style={{ marginBottom: 18, border: '2px solid #e5a900' }}>
              <h2 style={{ marginTop: 0 }}>Керування об’єктом</h2>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="button primary" onClick={saveActiveProject}>Зберегти об’єкт</button>
                <button className="button secondary" onClick={() => openEstimate(active)}>Відкрити кошторис</button>
                <button className="button secondary" onClick={()=>setFinanceProjectId(id=>id===active.id?null:active.id)}>Фінанси об’єкта</button>
                <button className="button secondary" onClick={openLocation}><MapPin size={15}/> Локація об’єкта</button>
                <button className="button secondary" onClick={exportCuttingPlan}>Креслення для закрійника PDF</button>
                <button className="button secondary" onClick={exportWorkerTask}><ClipboardList size={15}/> Завдання монтажникам PDF</button>
                {active.archivedAt ? <button className="button secondary" onClick={()=>{if(confirm('Повернути об’єкт до активних?')){syncProject(restore(active));setProjectView('active')}}}><RotateCcw size={15}/> Відновити з архіву</button> : <><button className="button primary" onClick={()=>archiveActive(true)}>Виконано</button><button className="button secondary" onClick={()=>archiveActive(false)}><Archive size={15}/> Заархівувати</button></>}
                <button className="button" style={{ background: '#7f2525', color: '#fff' }} onClick={() => deleteProject(active.id)}><Trash2 size={15}/> Видалити об’єкт</button>
              </div>
            </div>
            {cloud.session && <ObserverEstimateButton key={`observer-estimate-${active.id}`} projectId={active.id} disabled={cloud.status!=='Синхронізовано'||cloud.busy||!!cloud.conflict} build={()=>({total:projectPayment(active).total,lines:estimateRows(active).flatMap(section=>section.detailedRows.map(row=>({room:section.room.name,label:row.label,quantity:row.quantity,unit:row.unit,unitPrice:row.unitPrice,amount:row.amount})))})}/>}
            {cloud.session && <JobAssignment key={`assignment-${active.id}`} owner={cloud.session.user.id} projectId={active.id} disabled={(!!active.archivedAt && !active.completedAt) || cloud.status!=='Синхронізовано' || cloud.busy || !!cloud.conflict} build={()=>{if(unverifiedMeasuredRooms(active).length)throw new Error('Перевір геометрію стель перед публікацією: '+unverifiedMeasuredRooms(active).map(r=>r.name).join(', '));if(missingBounds(active))throw new Error('Введи габаритні розміри для кошторису перед публікацією.');return {payload:buildWorkerTask(active).payload,balance:projectPayment(active).balance,final:projectPayment(active).final,project:active}}} onAcceptCompletion={()=>archiveActive(true)} onPaymentSync={()=>void cloud.sync()}/>}
            {cloud.session && <JobPhotos key={`photos-${active.id}`} owner={cloud.session.user.id} project={active.id} admin/>}
            {active.completedAt && <div className="panel" style={{marginBottom:18}}>
              <h2>Оплата виконаного об’єкта</h2>
              {(()=>{const info=projectPayment(active);return <><div className="info-row"><span>Статус оплати</span><b style={{color:info.paid?'#60c692':'#ffc247'}}>{info.paid?'Оплачено':'Не оплачено'}</b></div><div className="info-row"><span>Вартість замовлення</span><b>{money(info.total)}</b></div><div className="info-row"><span>Завдаток</span><b>{money(info.deposit)}</b></div>{info.final>0&&<div className="info-row"><span>Остаточна оплата</span><b>{money(info.final)}</b></div>}<div className="info-row"><span>Залишок до оплати</span><b>{money(info.balance)}</b></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><button className="button primary" disabled={info.paid||info.total<=0} onClick={()=>markPayment(active,true)}>Оплачено</button><button className="button secondary" disabled={!info.final||!!active.workerReceiptId} onClick={()=>markPayment(active,false)}>Скасувати остаточну оплату</button></div>{info.total<=0&&<p className="muted">Спочатку сформуй кошторис.</p>}</>})()}
            </div>}
            {financeProjectId===active.id&&(()=>{const info=projectPayment(active),costs=projectCostNeeds(active);return <ObjectFinance key={active.id} {...costs} rules={consumableRules} catalog={availableCatalog} revenue={info.total} received={info.deposit+info.final} balance={info.balance} value={active.objectCosts||{}} onChange={objectCosts=>syncProject({...active,objectCosts})}/>})()}
            <div className="detail-grid">
              <div className="panel">
                <h2>Інформація про об’єкт</h2>
                <label style={labelStyle}>Місто / населений пункт (назва об’єкта)<input style={inputStyle} value={active.city ?? projectCity(active)} onChange={e=>syncProject({...active,city:e.target.value})} placeholder="Наприклад, Коломия"/></label>
                <label style={labelStyle}>Дата заміру<input type="date" style={inputStyle} value={projectDate(active)} onChange={e=>{if(e.target.value)syncProject({...active,measurementDate:e.target.value})}}/></label>
                {!active.completedAt && <label style={labelStyle}>Статус об’єкта<select style={inputStyle} value={active.status} onChange={e=>syncProject({...active,status:e.target.value})}>{[...new Set([active.status,...activeStatuses])].map(status=><option key={status}>{status}</option>)}</select></label>}
                <div className="info-row"><span>Телефон</span><b>{active.phone || 'Не вказано'}</b></div>
                <div className="info-row"><span>Адреса</span><b>{active.address || 'Не вказано'}</b></div>
                <div className="info-row"><span>Кількість кімнат</span><b>{active.rooms.length}</b></div>
              </div>
              <div className="panel">
                <h2>Кімнати / стелі</h2>
                {active.rooms.length ? active.rooms.map((r,i)=><button className="room-row room-row-button" key={r.id} onClick={()=>setActiveRoomId(r.id)}>
                  <div className="room-number">{String(i+1).padStart(2,'0')}</div>
                  <div><b>{r.name}</b><small>{r.shape === 'rectangle' && r.length && r.width ? `${formatNumber(r.length*r.width)} м²` : r.shape === 'polygon' ? 'Складна форма' : 'Розміри ще не внесені'}</small></div>
                  <ChevronRight size={18}/>
                </button>) : <p className="muted">Кімнати ще не додані.</p>}
                <button className="button secondary full" onClick={addRoomToActiveProject}><Plus size={16}/> Додати кімнату</button>
              </div>
            </div>
          </section>
        ) : creating ? (
          <section className="content narrow">
            <button className="back-link" onClick={()=>{setCreating(false);resetForm()}}><ArrowLeft size={16}/> Назад</button>
            <div className="page-heading"><div><div className="eyebrow">НОВИЙ ЗАПИС</div><h1>Створити об’єкт</h1><p className="muted">Додай дані клієнта та приміщення.</p></div></div>
            <div className="panel form-panel">
              <label>Ім’я клієнта <em>*</em><input autoFocus value={client} onChange={e=>setClient(e.target.value)} placeholder="Наприклад, Іван Петренко"/></label>
              <label>Телефон<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="0XX-XXX-XX-XX"/></label>
              <label>Дата заміру<input type="date" value={measurementDate} onChange={e=>setMeasurementDate(e.target.value)}/></label>
              <label>Місто / населений пункт (назва об’єкта)<input value={city} onChange={e=>setCity(e.target.value)} placeholder="Наприклад, Коломия"/></label>
              <label>Адреса об’єкта<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Місто, вулиця, номер будинку"/></label>
              <div className="field-label">Кімнати / стелі</div>
              <div className="add-room"><input value={roomName} onChange={e=>setRoomName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addRoom()} placeholder="Назва кімнати, наприклад Вітальня"/><button className="icon-button" onClick={addRoom} aria-label="Додати кімнату"><Plus size={19}/></button></div>
              {rooms.map((r,i)=><div className="added-room" key={r.id}><span>{i+1}. {r.name}</span><button onClick={()=>setRooms(prev=>prev.filter(x=>x.id!==r.id))}><X size={15}/></button></div>)}
              <div className="form-actions" style={{ flexWrap: 'wrap' }}>
                <button className="button secondary" onClick={()=>{setCreating(false);resetForm()}}>Скасувати</button>
                <button className="button secondary" disabled={!rooms.length} onClick={() => openEstimate({ id: 'Чернетка', client: client.trim(), phone: phone.trim(), address: address.trim(), city: city.trim(), status: 'Чернетка', created: new Date().toISOString(), measurementDate: measurementDate || localDate(), rooms }, true)}>Кошторис без збереження</button>
                <button className="button primary" disabled={!client.trim()} onClick={saveProject}>Зберегти проєкт</button>
              </div>
            </div>
          </section>
        ) : (
          <section className="content">
            <div className="page-heading">
              <div><div className="eyebrow">РОБОЧИЙ ПРОСТІР</div><h1>{projectView==='archive'?'Архів об’єктів':projectView==='calendar'?'Календар замірів':'Об’єкти'}</h1><p className="muted">{projectView==='archive'?'Виконані та заархівовані замовлення':projectView==='calendar'?'Об’єкти за датою заміру':'Керування замовленнями та приміщеннями'}</p></div>
              {projectView==='active'&&<button className="button primary" onClick={()=>{resetForm();setCreating(true)}}><Plus size={18}/> Створити об’єкт</button>}
            </div>
            {projectView==='active'&&<div className="stats">
              <div className="stat-card"><span>Активні об’єкти</span><strong>{liveProjects.length}</strong></div>
              <div className="stat-card"><span>Кімнат / стель</span><strong>{liveProjects.reduce((n,p)=>n+p.rooms.length,0)}</strong></div>
              <div className="stat-card"><span>Нові об’єкти</span><strong>{liveProjects.filter(p=>p.status==='Новий').length}</strong></div>
            </div>}
            {projectView==='archive'&&<><div className="stats"><div className="stat-card"><span>В архіві</span><strong>{archivedProjects.length}</strong></div><div className="stat-card"><span>Виконані, не оплачені</span><strong>{unpaidProjects.length}</strong></div><div className="stat-card"><span>Залишок до оплати</span><strong style={{fontSize:21}}>{money(debts)}</strong></div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>{([['all','Усі'],['paid','Оплачено'],['unpaid','Не оплачено']] as const).map(([id,label])=><button key={id} className={`button ${archiveFilter===id?'primary':'secondary'}`} onClick={()=>setArchiveFilter(id)}>{label}</button>)}</div></>}
            {projectView==='calendar'&&<div className="panel" style={{marginBottom:18}}>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>{([['day','День'],['month','Місяць'],['year','Рік']] as const).map(([id,label])=><button key={id} className={`button ${calendarScope===id?'primary':'secondary'}`} onClick={()=>{if(calendarScope==='year'&&id!=='year'){const m=calendarYear+calendarMonth.slice(4);setCalendarMonth(m);setCalendarDate(m+'-01')}else if(id==='day'&&!calendarDate.startsWith(calendarMonth))setCalendarDate(calendarMonth+'-01');if(id==='year'&&calendarScope!=='year')setCalendarYear(calendarMonth.slice(0,4));setCalendarScope(id)}}>{label}</button>)}</div>
              {calendarScope==='year'?<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}><button className="button secondary" onClick={()=>setCalendarYear(String(Number(calendarYear)-1))}>‹</button><b style={{flex:1,textAlign:'center'}}>{calendarYear}</b><button className="button secondary" onClick={()=>setCalendarYear(String(Number(calendarYear)+1))}>›</button></div>:<><div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}><button className="button secondary" onClick={()=>{const m=shiftMonth(calendarMonth,-1);setCalendarMonth(m);setCalendarDate(m+'-01')}}>‹</button><b style={{flex:1,textAlign:'center'}}>{new Date(calendarMonth+'-15T12:00:00').toLocaleDateString('uk-UA',{month:'long',year:'numeric'})}</b><button className="button secondary" onClick={()=>{const m=shiftMonth(calendarMonth,1);setCalendarMonth(m);setCalendarDate(m+'-01')}}>›</button></div>
              <div className="calendar-grid">{['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map(day=><small key={day} className="muted" style={{textAlign:'center'}}>{day}</small>)}{calendarDays(calendarMonth).map((day,i)=>{const count=day?projects.filter(p=>projectDate(p)===day&&(calendarFilter==='all'||(calendarFilter==='archive'?!!p.archivedAt:!p.archivedAt))).length:0;return day?<button key={day} className={`calendar-day ${calendarScope==='day'&&calendarDate===day?'selected':''}`} onClick={()=>{setCalendarDate(day);setCalendarScope('day')}} aria-label={`${day}: ${count} об’єктів`}><b>{Number(day.slice(-2))}</b>{count>0&&<small>{count}</small>}</button>:<span key={'blank'+i}/>})}</div></>}
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginTop:12}}><button className="button secondary" onClick={()=>{const d=localDate();setCalendarDate(d);setCalendarMonth(d.slice(0,7));setCalendarYear(d.slice(0,4));setCalendarScope('day')}}>Сьогодні</button><select aria-label="Об’єкти в календарі" value={calendarFilter} onChange={e=>setCalendarFilter(e.target.value as typeof calendarFilter)}><option value="all">Усі об’єкти</option><option value="active">Активні</option><option value="archive">Архівні</option></select></div>
            </div>}
            <div className="list-toolbar"><h2>{projectView==='calendar'?(calendarScope==='day'?formatMeasurementDate(calendarDate):calendarScope==='month'?calendarMonth:calendarYear):projectView==='archive'?'Архів':'Активні об’єкти'}</h2><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Пошук за містом, клієнтом, телефоном або ID"/></div></div>
            <div className="project-list">
              {filtered.length ? filtered.map(p=><button className="project-card" key={p.id} onClick={()=>setActive(p)}>
                <div className="project-icon"><House size={21}/></div>
                <div className="project-main"><b>{projectObjectName(p)}</b>{p.client && p.client!==projectObjectName(p) && <span>Замовник: {p.client}</span>}<span>{p.address || 'Адресу не вказано'} · {p.rooms.length} кімн.</span><small>{p.phone || p.id}</small></div>
                <div className="project-meta"><span className="pill">{p.completedAt?(projectPayment(p).paid?'Оплачено':'Не оплачено'):p.status}</span>{p.archivedAt&&<small>Архів</small>}{p.completedAt&&projectPayment(p).balance>0&&<small>{money(projectPayment(p).balance)}</small>}<small>{formatMeasurementDate(projectDate(p))}</small></div>
                <ChevronRight className="project-chevron" size={19}/>
              </button>) : <div className="empty"><div className="empty-icon"><House size={25}/></div><b>Нічого не знайдено</b><span>За вибраними умовами об’єктів немає.</span></div>}
            </div>
            <div className="prototype-note"><span className="status-dot"/> Дані зберігаються на цьому пристрої. Після входу доступна хмарна синхронізація.</div>
          </section>
        )}
        {locationOpen && active && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div className="panel" style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #e5a900', boxShadow: '0 20px 70px rgba(0,0,0,.45)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div><div className="eyebrow">ОБ’ЄКТ · {active.id}</div><h2 style={{ margin: '5px 0 0' }}>Локація об’єкта</h2></div>
                <button className="icon-button" onClick={() => setLocationOpen(false)} aria-label="Закрити"><X size={18}/></button>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>{projectObjectName(active)} · {active.client}</p>
              <label style={{ display: 'block', marginTop: 18 }}>Адреса об’єкта
                <input style={{ width: '100%', marginTop: 7 }} value={locationAddress} onChange={e => setLocationAddress(e.target.value)} placeholder="Місто, вулиця, номер будинку" />
              </label>
              <button className="button secondary full" style={{ marginTop: 12 }} onClick={captureLocation} disabled={locationLoading}>
                <Navigation size={16}/>{locationLoading ? 'Визначаємо місцезнаходження…' : 'Визначити моє місцезнаходження'}
              </button>
              {locationLat !== null && locationLng !== null && <p className="muted" style={{ fontSize: 12, marginTop: 9 }}>Координати збережені: {locationLat.toFixed(6)}, {locationLng.toFixed(6)}</p>}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                <button className="button primary" onClick={saveLocation}>Зберегти локацію</button>
                <button className="button secondary" disabled={!locationAddress.trim() && (locationLat === null || locationLng === null)} onClick={() => window.open(locationMapUrl(), '_blank', 'noopener,noreferrer')}><MapPin size={15}/> Відкрити в Google Maps</button>
                <button className="button secondary" onClick={() => setLocationOpen(false)}>Закрити</button>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Адреса та координати зберігаються в картці об’єкта на цьому пристрої.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
