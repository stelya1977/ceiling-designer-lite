import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Search, ChevronRight, House, ClipboardList, Layers3, Settings,
  X, ArrowLeft, Trash2, Ruler, RotateCcw, MapPin, Navigation, ImagePlus, Pencil, Sparkles, Download
} from 'lucide-react'

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
  diagonals?: Record<string, string>
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

type CatalogCategory = 'Профілі' | 'Карнизи' | 'LED-профілі' | 'Інше'
type CatalogItem = { id: string; category: CatalogCategory; name: string; price: string; unit: 'м' | 'шт.'; stockLength: string; cornerPrice: string; freeCorners: string; description: string }
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

type Project = {
  id: string
  client: string
  phone: string
  address: string
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

function readProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return demo
    const parsed = JSON.parse(raw) as Project[]
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
  } catch {
    return demo
  }
}

function formatNumber(n: number) {
  return n.toFixed(2).replace('.', ',')
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>(readProjects)
  const [catalog, setCatalog] = useState<CatalogItem[]>(readCatalog)
  const [catalogPage, setCatalogPage] = useState(false)
  const [catalogCategory, setCatalogCategory] = useState<CatalogCategory>('Профілі')
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null)
  const emptyCatalogDraft = { category: 'Профілі' as CatalogCategory, name: '', price: '', unit: 'м' as 'м' | 'шт.', stockLength: '', cornerPrice: '0', freeCorners: '0', description: '' }
  const [catalogDraft, setCatalogDraft] = useState(emptyCatalogDraft)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [active, setActive] = useState<Project | null>(null)
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [roomSection, setRoomSection] = useState<'measurements' | 'components' | 'visualization'>('measurements')
  const [selectedVizTool, setSelectedVizTool] = useState('Карниз / ніша SK 3.0')
  const [pendingVizPoint, setPendingVizPoint] = useState<{ x: number; y: number } | null>(null)
  const [editingVizMarkId, setEditingVizMarkId] = useState<string | null>(null)
  const [hiddenVizTypes, setHiddenVizTypes] = useState<string[]>([])
  const [vizStep, setVizStep] = useState(2)
  const [standardOpen, setStandardOpen] = useState(true)
  const [flyOpen, setFlyOpen] = useState(false)
  const [udOpen, setUdOpen] = useState(false)
  const [fn27Open, setFn27Open] = useState(false)
  const [sk30Open, setSk30Open] = useState(true)
  const [client, setClient] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
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
  const [discountPercent, setDiscountPercent] = useState('0')
  const [roundedEstimate, setRoundedEstimate] = useState(false)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)) }, [projects])
  useEffect(() => { localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog)) }, [catalog])

  const filtered = useMemo(
    () => projects.filter(p =>
      `${p.client} ${p.phone} ${p.address} ${p.id}`.toLowerCase().includes(query.toLowerCase())
    ),
    [projects, query]
  )

  function resetForm() {
    setClient('')
    setPhone('')
    setAddress('')
    setRooms([])
    setRoomName('')
  }

  function addRoom() {
    const name = roomName.trim()
    if (!name) return
    setRooms(prev => [...prev, {
      id: makeId(), name, shape: 'rectangle', sides: makeSides(4), vertices: regularVertices(4), diagonals: {}, components: defaultComponents()
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
      status: 'Новий',
      created: new Date().toISOString(),
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

  function deleteProject(id: string) {
    if (!confirm('Видалити цей об’єкт разом з усіма кімнатами та розрахунками?')) return
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
      components: defaultComponents()
    }
    const updated: Project = { ...active, rooms: [...active.rooms, newRoom] }
    syncProject(updated)
    setActiveRoomId(newRoom.id)
  }

  function updateEstimateDeposit(value: string) {
    if (!estimateProject) return
    const updated = { ...estimateProject, deposit: value }
    setEstimateProject(updated)
    if (estimateProject.id !== 'Чернетка') {
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
      setActive(prev => prev?.id === updated.id ? updated : prev)
    }
  }

  const activeRoom = active?.rooms.find(r => r.id === activeRoomId)

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

  function roomArea(room: Room) {
    if (room.shape === 'rectangle') return room.length && room.width ? room.length * room.width : null
    return polygonArea(room)
  }

  function roomPerimeter(room: Room) {
    if (room.shape === 'rectangle') return room.length && room.width ? 2 * (room.length + room.width) : null
    return room.sides.length && room.sides.every(side => Number(side.length) > 0)
      ? room.sides.reduce((sum, side) => sum + Number(side.length), 0)
      : null
  }

  function money(value: number) {
    return `${Math.round(value).toLocaleString('uk-UA')} ₴`
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
      return { room, rows, total: rows.reduce((sum, row) => sum + row.amount, 0) }
    })
  }

  function openEstimate(project: Project, fromCreate = false) {
    const today = new Date()
    const measurementDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    setEstimateProject({ ...project, measurementDate })
    setEstimateReturnToCreate(fromCreate)
    setDiscountOpen(false)
    setDiscountPercent('0')
    setRoundedEstimate(false)
  }

  function formatMeasurementDate(value?: string) {
    if (!value) return new Date().toLocaleDateString('uk-UA')
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('uk-UA')
  }

  function exportEstimate(format: 'pdf' | 'jpeg') {
    if (!estimateProject) return
    const sections = estimateRows(estimateProject)
    const base = sections.reduce((sum, section) => sum + section.total, 0)
    const discounted = base * (1 - Math.max(0, Math.min(100, Number(discountPercent || 0))) / 100)
    const total = roundedEstimate ? Math.floor(discounted / 100) * 100 : Math.round(discounted)
    const deposit = Math.max(0, Number(estimateProject.deposit || 0))
    const balance = Math.max(0, total - deposit)
    const moneyText = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} грн`
    const rowsHtml = sections.map(section => `<section class="room"><h2>${section.room.name}</h2><table>${section.rows.map(row => `<tr><td>${row.label}</td><td>${moneyText(row.amount)}</td></tr>`).join('')}<tr class="subtotal"><td>Разом за кімнату</td><td>${moneyText(section.total)}</td></tr></table></section>`).join('')
    const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#202a33;background:#fff;padding:32px;max-width:900px;margin:auto}h1{font-size:28px;margin:0 0 8px}p{color:#596675;margin:4px 0 24px}.room{margin:22px 0;page-break-inside:avoid}h2{font-size:19px;border-bottom:2px solid #e4a900;padding-bottom:8px}table{width:100%;border-collapse:collapse}td{padding:9px 4px;border-bottom:1px solid #e4e8ec}td:last-child{text-align:right;white-space:nowrap;font-weight:600}.subtotal td{font-weight:700;background:#f5f7f9}.total{margin-top:26px;padding:18px;background:#f5f7f9;font-size:24px;font-weight:700;text-align:right}.discount{text-align:right;color:#596675}@media print{body{padding:0}}</style></head><body><h1>Кошторис · НСК — Натяжні Стелі Коломия</h1><p>Замовник: ${estimateProject.client || '—'} · Телефон: ${estimateProject.phone || '—'}<br>Об’єкт: ${estimateProject.address || '—'}<br>Дата заміру: ${formatMeasurementDate(estimateProject.measurementDate)}</p>${rowsHtml}${Number(discountPercent)>0 ? `<p class="discount">Знижка ${discountPercent}%: −${moneyText(base-discounted)}</p>` : ''}<div class="total">Вартість замовлення: ${moneyText(total)}<br><small>Завдаток: ${moneyText(deposit)}<br>Залишок до оплати: ${moneyText(balance)}</small></div></body></html>`
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
      canvas.toBlob(file => { if (file) { const a = document.createElement('a'); const link = URL.createObjectURL(file); a.href = link; a.download = `koshtorys-${estimateProject.id}.jpg`; a.click(); URL.revokeObjectURL(link) } URL.revokeObjectURL(url) }, 'image/jpeg', 0.94)
    }
    img.onerror = () => { URL.revokeObjectURL(url); alert('Браузер не зміг сформувати JPEG. Спробуй PDF.') }
    img.src = url
  }


  function exportCuttingPlan() {
    const project = estimateProject || active
    if (!project) return
    const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    const fmt = (value: unknown) => {
      const n = Number(value)
      return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} м` : '—'
    }
    const roomPages = project.rooms.map((room, index) => {
      let drawing = ''
      if (room.shape === 'rectangle') {
        drawing = `<svg class="drawing" viewBox="0 0 600 420" role="img" aria-label="Полотно ${index + 1}">
          <polygon points="130,330 130,90 470,90 470,330" fill="#fff" stroke="#111" stroke-width="3"/>
          <g fill="#111" font-size="22" font-family="Arial"><text x="112" y="350">A</text><text x="112" y="82">B</text><text x="480" y="82">C</text><text x="480" y="350">D</text><text x="300" y="215" text-anchor="middle" font-size="24" font-weight="bold">${esc(room.canvasNumber || `Полотно №${index + 1}`)}</text></g></svg>`
      } else {
        const rawPts = room.vertices || regularVertices(room.sides.length || 4)
        const lowerLeftTarget = { x: Math.min(...rawPts.map(point => point.x)), y: Math.max(...rawPts.map(point => point.y)) }
        const startIndex = rawPts.reduce((best, point, i) => Math.hypot(point.x - lowerLeftTarget.x, point.y - lowerLeftTarget.y) < Math.hypot(rawPts[best].x - lowerLeftTarget.x, rawPts[best].y - lowerLeftTarget.y) ? i : best, 0)
        const signedArea = rawPts.reduce((sum, point, i) => { const next = rawPts[(i + 1) % rawPts.length]; return sum + point.x * next.y - next.x * point.y }, 0)
        const clockwise = signedArea >= 0
        const pts = rawPts.map((_, i) => rawPts[(startIndex + (clockwise ? i : -i) + rawPts.length * 2) % rawPts.length])
        const orderedSides = pts.map((_, i) => room.sides[(clockwise ? startIndex + i : startIndex - i - 1 + room.sides.length * 2) % room.sides.length])
        const poly = pts.map(v => `${v.x},${v.y}`).join(' ')
        const sideTexts = pts.map((v, i) => {
          const next = pts[(i + 1) % pts.length]
          const side = orderedSides[i]
          const label = `${String.fromCharCode(65+i)}${String.fromCharCode(65+((i+1)%pts.length))} = ${fmt(side?.length)}`
          const mx = (v.x + next.x) / 2
          const my = (v.y + next.y) / 2 - 9
          return `<text x="${mx}" y="${my}" text-anchor="middle" font-size="11" fill="#111">${esc(label)}</text>`
        }).join('')
        const vertices = pts.map((v, i) => `<text x="${v.x+10}" y="${v.y-10}" font-size="14" font-weight="bold" fill="#111">${String.fromCharCode(65+i)}</text>`).join('')
        drawing = `<svg class="drawing" viewBox="0 0 360 230"><polygon points="${poly}" fill="#fff" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>${vertices}<text x="180" y="115" text-anchor="middle" font-size="15" font-weight="bold" fill="#111">${esc(room.canvasNumber || `Полотно №${index + 1}`)}</text></svg>`
      }
      const diagonals = Object.entries(room.diagonals || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${key} = ${fmt(value)}`).join(' · ')
      return `<section class="sheet"><div class="sheet-head"><div><h2>Полотно: ${esc(room.canvasNumber || `№${index + 1}`)}</h2><p>${esc(room.name || `Приміщення ${index + 1}`)}</p></div><div class="sheet-number">№ ${index + 1}</div></div>${drawing}<div class="measurements"><h3>Розміри сторін</h3><div class="side-grid">${(room.shape === 'rectangle' ? [`AB = ${fmt(room.width)}`, `BC = ${fmt(room.length)}`, `CD = ${fmt(room.width)}`, `DA = ${fmt(room.length)}`] : orderedSides.map((side, i) => `${String.fromCharCode(65+i)}${String.fromCharCode(65+((i+1)%orderedSides.length))} = ${fmt(side.length)}`)).map(item => `<div>${esc(item)}</div>`).join('')}</div>${diagonals ? `<p class="diagonals">Діагоналі: ${esc(diagonals)}</p>` : ''}</div></section>`
    }).join('')
    const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Креслення для закрійника</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;padding:22px}.header{border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}.header h1{font-size:25px;margin:0 0 10px}.header p{font-size:17px;margin:4px 0}.sheet{page-break-after:always;break-after:page;min-height:0;padding:8px 0;page-break-inside:avoid;break-inside:avoid}.sheet:last-child{page-break-after:auto;break-after:auto}.sheet-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #aaa;padding-bottom:8px}.sheet-head h2{font-size:23px;margin:0 0 5px}.sheet-head p{margin:0;color:#444}.sheet-number{font-size:25px;font-weight:bold}.drawing{display:block;width:100%;height:470px;margin:25px auto 10px}.measurements{margin-top:10px}.measurements h3{font-size:18px;margin-bottom:12px}.side-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.side-grid div{border:1px solid #bbb;padding:12px;font-size:18px;font-weight:bold}.diagonals{margin-top:15px;font-size:15px}@page{size:A4;margin:15mm}@media print{body{padding:0}.sheet{min-height:0;page-break-inside:avoid;break-inside:avoid}.sheet:last-child{page-break-after:auto;break-after:auto}}</style></head><body><header class="header"><h1>Креслення для закрійника</h1><p><b>Об’єкт:</b> ${esc(project.client || '—')}</p><p><b>Телефон:</b> ${esc(project.phone || '—')}</p></header>${roomPages || '<p>У цьому об’єкті немає полотен.</p>'}</body></html>`
    const win = window.open('', '_blank')
    if (!win) { alert('Дозволь спливаючі вікна, щоб відкрити креслення та зберегти його в PDF.'); return }
    win.document.open()
    win.document.write(html)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 350)
  }

  function exportWorkerTask() {
    const project = active
    if (!project) return
    const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    const qty = (value: unknown, unit = 'м') => {
      const n = Number(value || 0)
      return n > 0 ? `${n.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} ${unit}` : '—'
    }
    const totals: Record<string, { value: number; unit: string }> = {}
    const skPurchases: Record<string, number> = {}
    const rows = project.rooms.map((room, index) => {
      const c = { ...defaultComponents(), ...(room.components || {}) }
      const e = componentEstimate(room)
      const items: string[] = []
      const addTotal = (label: string, value: number, unit = 'м') => {
        if (!(value > 0)) return
        const key = `${label} (${unit})`
        if (!totals[key]) totals[key] = { value: 0, unit }
        totals[key].value += value
      }
      if (e.insertLength > 0) {
        items.push(`Декоративна вставка (${c.insertColor === 'black' ? 'чорна' : 'біла'}) — ${qty(e.insertLength)}`)
        addTotal(`Декоративна вставка (${c.insertColor === 'black' ? 'чорна' : 'біла'})`, e.insertLength)
        items.push(`Профіль пластиковий — ${qty(e.insertLength)}`)
        addTotal('Профіль пластиковий', e.insertLength)
      }
      if (c.flyEnabled && Number(c.flyLength) > 0) { const stockCount = Math.ceil(Number(c.flyLength) / 2); items.push(`ALUTAT FLY — ${qty(c.flyLength)} (планок по 2 м: ${stockCount} шт.)`); addTotal('ALUTAT FLY — планки по 2 м', stockCount, 'шт.') }
      if (c.flyEnabled && Number(c.flyPower) > 0) { items.push(`Блоки живлення FLY — ${qty(c.flyPower, 'шт.')}`); addTotal('Блоки живлення FLY', Number(c.flyPower), 'шт.') }
      if (c.flyEnabled && Number(c.flyGrilles) > 0) { items.push(`Магнітні решітки FLY — ${qty(c.flyGrilles, 'шт.')}`); addTotal('Магнітні решітки FLY', Number(c.flyGrilles), 'шт.') }
      if (c.udEnabled && Number(c.udLength) > 0) { items.push(`Тіньовий профіль UD — ${qty(c.udLength)}`); addTotal('Тіньовий профіль UD', Number(c.udLength)) }
      if (c.udEnabled && Number(c.udCorners) > 0) items.push(`Кути UD — ${qty(c.udCorners, 'шт.')}`)
      e.skDetails.forEach((item, i) => {
        if (Number(item.length) > 0) {
          items.push(`Карниз SK 3.0 №${i+1} (${item.color === 'white' ? 'білий' : 'чорний'}) — ${qty(item.length)} (закупівля: ${qty(item.stock)})`); {
            const color = item.color === 'white' ? 'білий' : 'чорний'
            const stock = Number(item.stock)
            const key = `${color}|${stock}`
            skPurchases[key] = (skPurchases[key] || 0) + 1
          }
          if ((item.ledEnabled ?? Number(item.ledLength || 0) > 0) && Number(item.ledLength) > 0) { items.push(`LED ${item.ledColor || ''} для SK 3.0 №${i+1} — ${qty(item.ledLength)}`); addTotal(`LED ${item.ledColor || ''} для SK 3.0`, Number(item.ledLength)) }
          if (Number(item.power) > 0) { items.push(`Блоки живлення SK 3.0 №${i+1} — ${qty(item.power, 'шт.')}`); addTotal('Блоки живлення SK 3.0', Number(item.power), 'шт.') }
          if (Number(item.grilles) > 0) { items.push(`Магнітні решітки SK 3.0 №${i+1} — ${qty(item.grilles, 'шт.')}`); addTotal('Магнітні решітки SK 3.0', Number(item.grilles), 'шт.') }
        }
      })
      if (Number(c.fn27Length) > 0) { items.push(`LED-профіль FN-27 — ${qty(c.fn27Length)} (планок по 2 м: ${Math.ceil(Number(c.fn27Length) / 2) + 1} шт.)`); addTotal(`FN-27 — ${Math.ceil(Number(c.fn27Length) / 2) + 1} × 2 м`, Math.ceil(Number(c.fn27Length) / 2) + 1, 'шт.') }
      if (Number(c.fn27Power) > 0) { items.push(`Блоки живлення FN-27 — ${qty(c.fn27Power, 'шт.')}`); addTotal('Блоки живлення FN-27', Number(c.fn27Power), 'шт.') }
      if (Number(c.fn27Grilles) > 0) { items.push(`Магнітні решітки FN-27 — ${qty(c.fn27Grilles, 'шт.')}`); addTotal('Магнітні решітки FN-27', Number(c.fn27Grilles), 'шт.') }
      e.catalogItems.filter(item => Number(item.quantity || 0) > 0).forEach(item => { items.push(`${item.name} — ${qty(item.quantity, item.unit || 'шт.')}`); addTotal(item.name, Number(item.quantity), item.unit || 'шт.') })
      if (Number(c.standardCorners) > 4) items.push(`Додаткові кути стандартного профілю — ${qty(Number(c.standardCorners) - 4, 'шт.')}`)
      let pts: Point[]
      if (room.shape === 'rectangle') {
        const length = Math.max(0.01, Number(room.length) || 1)
        const width = Math.max(0.01, Number(room.width) || 1)
        const ratio = length / width
        const boxW = ratio >= 1 ? 280 : 280 * ratio
        const boxH = ratio >= 1 ? 150 / ratio : 150
        const left = (360 - boxW) / 2
        const top = (190 - boxH) / 2 + 8
        pts = [
          { x: left, y: top },
          { x: left + boxW, y: top },
          { x: left + boxW, y: top + boxH },
          { x: left, y: top + boxH }
        ]
      } else {
        pts = room.vertices || regularVertices(room.sides?.length || 4)
      }
      const polygon = pts.map(p => `${p.x},${p.y}`).join(' ')
      const drawing = `<svg class="mini" viewBox="0 0 360 224" role="img" aria-label="Креслення ${esc(room.name)}"><polygon points="${polygon}" fill="#f7f9fb" stroke="#263746" stroke-width="3"/><text x="180" y="112" text-anchor="middle" font-size="13" font-weight="bold" fill="#222">${esc(room.canvasNumber || `Полотно №${index + 1}`)}</text><text x="180" y="215" text-anchor="middle" font-size="12" fill="#667">Схема контуру</text></svg>`
      return `<section class="room"><h2>${esc(room.name)}</h2><div class="roomgrid"><ul>${items.length ? items.map(item => `<li>${esc(item)}</li>`).join('') : '<li>Комплектуючі не вказані</li>'}</ul>${drawing}</div></section>`
    }).join('')
    Object.entries(skPurchases).forEach(([key, count]) => {
      const [color, stockText] = key.split('|')
      const stock = Number(stockText)
      const label = `Карниз SK 3.0 (${color}), планка ${String(stock).replace('.', ',')} м`
      totals[label] = { value: count, unit: 'шт.' }
    })
    const summaryHtml = Object.entries(totals).map(([label, item]) => `<li><b>${esc(label)}</b> — ${qty(item.value, item.unit)}</li>`).join('')
    const mapUrl = project.locationLat != null && project.locationLng != null
      ? `https://www.google.com/maps?q=${project.locationLat},${project.locationLng}`
      : project.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.address)}` : ''
    const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Завдання монтажникам</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#202a33;padding:28px;max-width:900px;margin:auto}h1{font-size:26px;margin:0 0 14px}h2{font-size:19px;border-bottom:2px solid #e4a900;padding-bottom:7px;margin-top:24px}p{margin:7px 0}ul{padding-left:22px}li{padding:5px 0;font-size:16px}.roomgrid{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:14px;align-items:start}.mini{width:100%;max-height:145px;border:1px solid #d8dee5;border-radius:6px;background:#fff}.map{display:inline-block;margin-top:10px;padding:10px 14px;background:#eef3f8;border-radius:6px;color:#174c83;text-decoration:none;font-weight:bold}.room{page-break-inside:avoid} @page{size:A4;margin:15mm}@media print{body{padding:0}.roomgrid{grid-template-columns:minmax(0,1fr) 190px}.mini{max-height:130px}}</style></head><body><h1>Завдання монтажникам</h1><p><b>Об'єкт:</b> ${esc(project.client || '—')}</p><p><b>Телефон:</b> ${esc(project.phone || '—')}</p><p><b>Адреса:</b> ${esc(project.address || 'Не вказана')}</p>${mapUrl ? `<a class="map" href="${mapUrl}">Відкрити маршрут у Google Maps</a>` : ''}${rows}<section><h2>ЗІБРАТИ НА ОБ'ЄКТ — ЗАГАЛЬНИЙ СПИСОК</h2><ul>${summaryHtml || '<li>Комплектуючі не вказані</li>'}</ul></section><p style="margin-top:28px;color:#667">НСК — Натяжні Стелі Коломия</p></body></html>`
    const win = window.open('', '_blank')
    if (!win) { alert('Дозволь спливаючі вікна, щоб сформувати PDF.'); return }
    win.document.open(); win.document.write(html); win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 350)
  }

  function exportOverallEstimate(format: 'pdf' | 'jpeg') {
    if (!estimateProject) return
    const sections = estimateRows(estimateProject)
    const grouped = new Map<string, { label: string; amount: number }>()
    sections.forEach(section => section.rows.forEach(row => {
      const label = row.label.replace(/\s*\([^)]*\)\s*$/, '').trim()
      const current = grouped.get(label) || { label, amount: 0 }
      current.amount += row.amount
      grouped.set(label, current)
    }))
    const base = sections.reduce((sum, section) => sum + section.total, 0)
    const percent = Math.max(0, Math.min(100, Number(discountPercent || 0)))
    const afterDiscount = base * (1 - percent / 100)
    const total = roundedEstimate ? Math.floor(afterDiscount / 100) * 100 : Math.round(afterDiscount)
    const deposit = Math.max(0, Number(estimateProject.deposit || 0))
    const balance = Math.max(0, total - deposit)
    const moneyText = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} грн`
    const rowsHtml = [...grouped.values()].map(row => `<tr><td>${row.label}</td><td>${moneyText(row.amount)}</td></tr>`).join('')
    const roomsHtml = `<p>Кількість кімнат: ${estimateProject.rooms.length}</p>`
    const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#202a33;background:#fff;padding:32px;max-width:900px;margin:auto}h1{font-size:28px;margin:0 0 8px}p{color:#596675;margin:4px 0 18px}table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:11px 5px;border-bottom:1px solid #e4e8ec}td:last-child{text-align:right;white-space:nowrap;font-weight:700}.total{margin-top:26px;padding:18px;background:#f5f7f9;font-size:23px;font-weight:700;text-align:right}.small{font-size:15px;line-height:1.7}@media print{body{padding:0}}</style></head><body><h1>Загальний кошторис об’єкта</h1><p>НСК — Натяжні Стелі Коломия<br>Замовник: ${estimateProject.client || '—'} · Телефон: ${estimateProject.phone || '—'}<br>Адреса: ${estimateProject.address || '—'}<br>Дата заміру: ${formatMeasurementDate(estimateProject.measurementDate)}<br>${roomsHtml}</p><table>${rowsHtml}</table>${percent > 0 ? `<p>Знижка ${percent}%: −${moneyText(base-afterDiscount)}</p>` : ''}<div class="total">Разом за об’єкт: ${moneyText(total)}<div class="small">Завдаток: ${moneyText(deposit)}<br>Залишок до оплати: ${moneyText(balance)}</div></div></body></html>`
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
      canvas.toBlob(file => { if (file) { const a = document.createElement('a'); const link = URL.createObjectURL(file); a.href = link; a.download = `koshtorys-objekt-${estimateProject.id}.jpg`; a.click(); URL.revokeObjectURL(link) } URL.revokeObjectURL(url) }, 'image/jpeg', 0.94)
    }
    img.onerror = () => { URL.revokeObjectURL(url); alert('Браузер не зміг сформувати JPEG. Спробуй PDF.') }
    img.src = url
  }

  function addCatalogItemToRoom(room: Room, catalogId: string) {
    const item = catalog.find(v => v.id === catalogId)
    if (!item) return
    const current = room.components || defaultComponents()
    const existing = current.catalogItems || []
    updateComponents(room, { catalogItems: [...existing, { id: makeId(), catalogId: item.id, name: item.name, price: item.price, unit: item.unit, quantity: '1' }] })
  }
  function updateRoomCatalogItem(room: Room, id: string, patch: Partial<{ quantity: string }>) {
    const current = room.components || defaultComponents()
    updateComponents(room, { catalogItems: (current.catalogItems || []).map(item => item.id === id ? { ...item, ...patch } : item) })
  }
  function removeRoomCatalogItem(room: Room, id: string) {
    const current = room.components || defaultComponents()
    updateComponents(room, { catalogItems: (current.catalogItems || []).filter(item => item.id !== id) })
  }

  function addSK30(room: Room) {
    const current = room.components || defaultComponents()
    updateComponents(room, { sk30Items: [...(current.sk30Items || []), { id: crypto.randomUUID(), color: 'white', length: '', ledLength: '', ledEnabled: false, ledColor: 'Тепле 3000K', power: '0', grilles: '0' }] })
  }
  function updateSK30(room: Room, id: string, patch: Partial<{ color: 'white' | 'black'; length: string; ledLength: string; ledEnabled: boolean; ledColor: string; power: string; grilles: string }>) {
    const current = room.components || defaultComponents()
    updateComponents(room, { sk30Items: (current.sk30Items || []).map(item => item.id === id ? { ...item, ...patch } : item) })
  }
  function removeSK30(room: Room, id: string) {
    const current = room.components || defaultComponents()
    updateComponents(room, { sk30Items: (current.sk30Items || []).filter(item => item.id !== id) })
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
    const old = room.sides
    const next = makeSides(safeCount).map((s, i) => ({
      ...s,
      length: old[i]?.length || ''
    }))
    updateRoom(room.id, { shape: 'polygon', sides: next, vertices: regularVertices(safeCount), diagonals: room.diagonals || {} })
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
          <button className="nav-item active" onClick={() => setCatalogPage(false)}><House size={18}/>Об’єкти</button>
          <button className="nav-item" disabled><ClipboardList size={18}/>Кошториси</button>
          <button className="nav-item" onClick={() => { setCatalogPage(true); setActive(null); setActiveRoomId(null); setCreating(false) }}><Layers3 size={18}/>Каталог</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="company">НСК — Натяжні Стелі Коломия</div>
          <button className="nav-item" disabled><Settings size={18}/>Налаштування</button>
          <small>Прототип 0.7.9</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">НСК <span>CEILING DESIGNER</span></div>
          <div className="topbar-right"><span className="status-dot"/> Локальний режим</div>
        </header>


        {catalogPage ? (
          <section className="content narrow">
            <div className="page-heading"><div><div className="eyebrow">ДОВІДНИК ВИРОБІВ</div><h1>Каталог комплектуючих</h1><p className="muted">Керування позиціями та базовими цінами. Поки що дані зберігаються локально в цьому браузері.</p></div></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {(['Профілі','Карнизи','LED-профілі','Інше'] as CatalogCategory[]).map(cat => <button key={cat} style={{ ...buttonStyle, background: catalogCategory === cat ? '#ffb900' : '#405263', color: catalogCategory === cat ? '#18222c' : '#fff' }} onClick={() => { setCatalogCategory(cat); setEditingCatalogId(null); setCatalogDraft({ ...emptyCatalogDraft, category: cat }) }}>{cat}</button>)}
            </div>
            <div className="panel form-panel">
              <h2>{editingCatalogId ? 'Редагувати позицію' : 'Додати позицію'}</h2>
              <label>Назва<input value={catalogDraft.name} onChange={e => setCatalogDraft(v => ({ ...v, name: e.target.value }))} placeholder="Назва виробу"/></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>Ціна<input type="number" min="0" value={catalogDraft.price} onChange={e => setCatalogDraft(v => ({ ...v, price: e.target.value }))}/></label>
                <label>Одиниця<select value={catalogDraft.unit} onChange={e => setCatalogDraft(v => ({ ...v, unit: e.target.value as 'м' | 'шт.' }))}><option value="м">За метр</option><option value="шт.">За штуку</option></select></label>
              </div>
              <label>Довжина заводської планки / варіанти довжин<input value={catalogDraft.stockLength} onChange={e => setCatalogDraft(v => ({ ...v, stockLength: e.target.value }))} placeholder="Наприклад, 2 або 2; 2,5; 3,2"/></label>
              <h3 style={{ margin: '8px 0 0' }}>Оплата кутів</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>Ціна за один кут, грн<input type="number" min="0" value={catalogDraft.cornerPrice} onChange={e => setCatalogDraft(v => ({ ...v, cornerPrice: e.target.value }))}/></label>
                <label>Безкоштовних кутів<input type="number" min="0" step="1" value={catalogDraft.freeCorners} onChange={e => setCatalogDraft(v => ({ ...v, freeCorners: e.target.value }))}/></label>
              </div>
              <label>Примітки та додаткові тарифи<textarea value={catalogDraft.description} onChange={e => setCatalogDraft(v => ({ ...v, description: e.target.value }))} rows={3}/></label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="button" disabled={!catalogDraft.name.trim()} onClick={() => {
                  if (editingCatalogId) setCatalog(items => items.map(item => item.id === editingCatalogId ? { ...item, ...catalogDraft } : item))
                  else setCatalog(items => [...items, { id: makeId(), ...catalogDraft, category: catalogCategory }])
                  setEditingCatalogId(null); setCatalogDraft({ ...emptyCatalogDraft, category: catalogCategory })
                }}>{editingCatalogId ? 'Зберегти зміни' : 'Додати до каталогу'}</button>
                {editingCatalogId && <button className="button secondary" onClick={() => { setEditingCatalogId(null); setCatalogDraft({ ...emptyCatalogDraft, category: catalogCategory }) }}>Скасувати</button>}
              </div>
            </div>
            <div className="panel" style={{ marginTop: 16 }}>
              <h2>{catalogCategory}</h2>
              {catalog.filter(item => item.category === catalogCategory).map(item => <div key={item.id} className="info-row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}><b>{item.name}</b><div className="muted">{item.price} ₴/{item.unit} {item.stockLength ? `· Планки: ${item.stockLength} м` : ''}{Number(item.cornerPrice || 0) > 0 ? ` · Кут: ${item.cornerPrice} ₴` : ''}{Number(item.freeCorners || 0) > 0 ? ` · Безкоштовно: ${item.freeCorners}` : ''}</div>{item.description && <small className="muted">{item.description}</small>}</div>
                <button className="button secondary" onClick={() => { setEditingCatalogId(item.id); setCatalogDraft({ ...emptyCatalogDraft, ...item, cornerPrice: item.cornerPrice ?? '0', freeCorners: item.freeCorners ?? '0' }) }}>Редагувати</button>
                <button className="icon-button" aria-label="Видалити" onClick={() => { if (confirm(`Видалити «${item.name}» з каталогу?`)) setCatalog(items => items.filter(v => v.id !== item.id)) }}><Trash2 size={16}/></button>
              </div>)}
              {catalog.filter(item => item.category === catalogCategory).length === 0 && <p className="muted">У цій категорії поки немає позицій.</p>}
            </div>
          </section>
        ) : estimateProject ? (
          <section className="content narrow">
            <button className="back-link" onClick={() => { setEstimateProject(null); if (estimateReturnToCreate) setCreating(true) }}><ArrowLeft size={16}/> Назад</button>
            <div className="page-heading"><div><div className="eyebrow">КОШТОРИС ОБ’ЄКТА · {estimateProject.id}</div><h1>{estimateProject.client || 'Новий об’єкт'}</h1><p className="muted">{estimateProject.address || 'Адресу не вказано'} · {estimateProject.rooms.length} кімнат · Дата заміру: {formatMeasurementDate(estimateProject.measurementDate)}</p></div></div>
            <div className="panel" style={{ marginBottom: 16, border: '2px solid #e5a900' }}>
              {(() => {
                const sections = estimateRows(estimateProject)
                const base = sections.reduce((sum, section) => sum + section.total, 0)
                const percent = Math.max(0, Math.min(100, Number(discountPercent || 0)))
                const afterDiscount = base * (1 - percent / 100)
                const payable = roundedEstimate ? Math.floor(afterDiscount / 100) * 100 : Math.round(afterDiscount)
                const deposit = Math.max(0, Number(estimateProject.deposit || 0))
                const rooms = estimateProject.rooms
                const sum = (fn: (room: Room) => number) => rooms.reduce((v, room) => v + fn(room), 0)
                const area = sum(room => Number(roomArea(room) || 0))
                const perimeter = sum(room => Number(roomPerimeter(room) || 0))
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
                  {metric('Полотно, площа', area, 'м²')}
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
                  <h2 style={{ marginTop: 22 }}>Оплата</h2>
                  <div className="info-row"><b>Загальна сума</b><b>{money(payable)}</b></div>
                  {percent > 0 && <div className="info-row"><span>Знижка ({percent}%)</span><b>−{money(base-afterDiscount)}</b></div>}
                  <label style={{ ...labelStyle, marginTop: 8 }}>Внесений завдаток, грн
                    <input style={inputStyle} type="number" min="0" step="1" value={estimateProject.deposit || ''} onChange={e => updateEstimateDeposit(e.target.value)} placeholder="Введи суму завдатку" />
                  </label>
                  <div className="info-row" style={{ fontSize: 18 }}><b>Залишок до оплати</b><b style={{ color: '#ffc247' }}>{money(Math.max(0, payable - deposit))}</b></div>
                  {deposit > payable && <p className="muted">Увага: завдаток перевищує суму кошторису.</p>}
                  <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 14 }}>
                    <button className="button secondary" onClick={() => setRoundedEstimate(v => !v)}>{roundedEstimate ? 'Скасувати заокруглення' : 'Заокруглити до сотень'}</button>
                    <button className="button secondary" onClick={() => setDiscountOpen(v => !v)}>Коригування</button>
                  </div>
                  {discountOpen && <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', padding: 12, background: '#1a2834', borderRadius: 10, marginTop: 14 }}>
                    <label style={{ ...labelStyle, flex: '1 1 150px', marginBottom: 0 }}>Знижка, %<input style={inputStyle} type="number" min="0" max="100" step="0.5" value={discountPercent} onChange={e => { setDiscountPercent(e.target.value); setRoundedEstimate(false) }}/></label>
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
          <section className="content narrow" style={roomSection === 'visualization' ? { maxWidth: 'none', width: '100%' } : undefined}>
            <button className="back-link" onClick={() => setActiveRoomId(null)}>
              <ArrowLeft size={16}/> До об’єкта {active.client}
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
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={panelStyle}>
                  <h2 style={{ marginTop: 0 }}>Базова стеля</h2>
                  <div className="info-row"><span>Полотно</span><b>MSD Premium — 700 ₴/м²</b></div>
                  <div className="info-row"><span>Площа приміщення</span><b>{roomArea(activeRoom) === null ? 'Спочатку внеси розміри' : `${formatNumber(roomArea(activeRoom)!)} м²`}</b></div>
                  <div className="info-row"><span>Вартість полотна</span><b>{money((roomArea(activeRoom) || 0) * 700)}</b></div>
                </div>

                <div style={panelStyle}>
                  <h2 style={{ marginTop: 0 }}>Комплектуючі профілі</h2>
                  <button type="button" className="button secondary" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}
                    onClick={() => setStandardOpen(v => !v)}>
                    <span>Стандартний профіль</span><span>{standardOpen ? '−' : '+'}</span>
                  </button>
                  {standardOpen && <div style={{ padding: '4px 8px 12px' }}>
                    <label style={labelStyle}>Колір декоративної вставки
                      <select style={inputStyle} value={(activeRoom.components || defaultComponents()).insertColor}
                        onChange={e => updateComponents(activeRoom, { insertColor: e.target.value as 'white' | 'black' })}>
                        <option value="white">Біла</option><option value="black">Чорна</option>
                      </select>
                    </label>
                    <label style={labelStyle}>Довжина декоративної вставки, пог. м
                      <input style={inputStyle} type="number" min="0" step="0.1"
                        value={(activeRoom.components || defaultComponents()).insertLength}
                        onChange={e => updateComponents(activeRoom, { insertLength: e.target.value })}
                        placeholder="Введи фактичну довжину"/>
                    </label>
                    <label style={labelStyle}>Загальна кількість кутів стандартного профілю
                      <input style={inputStyle} type="number" min="0" step="1"
                        value={(activeRoom.components || defaultComponents()).standardCorners}
                        onChange={e => updateComponents(activeRoom, { standardCorners: e.target.value })}/>
                      <span className="muted">Перші 4 безкоштовні; кожен наступний — 400 ₴.</span>
                    </label>
                  </div>}
                  <button type="button" className="button secondary" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}
                    onClick={() => {
                      setFlyOpen(v => !v)
                      if (!(activeRoom.components || defaultComponents()).flyEnabled) updateComponents(activeRoom, { flyEnabled: true })
                    }}>
                    <span>ALUTAT FLY — 1200 ₴/м</span><span>{flyOpen ? '−' : '+'}</span>
                  </button>
                  {flyOpen && <div style={{ padding: '4px 8px 12px' }}>
                    <label style={labelStyle}>Довжина ALUTAT FLY, пог. м
                      <input style={inputStyle} type="number" min="0" step="0.1"
                        value={(activeRoom.components || defaultComponents()).flyLength}
                        onChange={e => updateComponents(activeRoom, { flyLength: e.target.value })}/>
                    </label>
                    <label style={labelStyle}>Кількість кутів FLY (500 ₴ кожен)
                      <input style={inputStyle} type="number" min="0" step="1"
                        value={(activeRoom.components || defaultComponents()).flyCorners}
                        onChange={e => updateComponents(activeRoom, { flyCorners: e.target.value })}/>
                    </label>
                    <label style={labelStyle}>Блоки живлення FLY, шт.
                      <input style={inputStyle} type="number" min="0" step="1"
                        value={(activeRoom.components || defaultComponents()).flyPower}
                        onChange={e => updateComponents(activeRoom, { flyPower: e.target.value })}/>
                    </label>
                    <label style={labelStyle}>Магнітні решітки FLY, шт. (900 ₴ кожна)
                      <input style={inputStyle} type="number" min="0" step="1"
                        value={(activeRoom.components || defaultComponents()).flyGrilles}
                        onChange={e => updateComponents(activeRoom, { flyGrilles: e.target.value })}/>
                    </label>
                  </div>}
                  <button type="button" className="button secondary" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}
                    onClick={() => {
                      setUdOpen(v => !v)
                      if (!(activeRoom.components || defaultComponents()).udEnabled) updateComponents(activeRoom, { udEnabled: true })
                    }}>
                    <span>Тіньовий профіль UD — 500 ₴/м</span><span>{udOpen ? '−' : '+'}</span>
                  </button>
                  {udOpen && <div style={{ padding: '4px 8px 12px' }}>
                    <label style={labelStyle}>Довжина тіньового UD, пог. м
                      <input style={inputStyle} type="number" min="0" step="0.1"
                        value={(activeRoom.components || defaultComponents()).udLength}
                        onChange={e => updateComponents(activeRoom, { udLength: e.target.value })}/>
                    </label>
                    <label style={labelStyle}>Кількість кутів UD (400 ₴ кожен)
                      <input style={inputStyle} type="number" min="0" step="1"
                        value={(activeRoom.components || defaultComponents()).udCorners}
                        onChange={e => updateComponents(activeRoom, { udCorners: e.target.value })}/>
                    </label>
                  </div>}
                  <button type="button" className="button secondary" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}
                    onClick={() => setFn27Open(v => !v)}>
                    <span>LED-профіль FN-27 — 2100 ₴/м</span><span>{fn27Open ? '−' : '+'}</span>
                  </button>
                  {fn27Open && <div style={{ padding: '4px 8px 12px' }}>
                    <label style={labelStyle}>Загальна довжина FN-27, пог. м
                      <input style={inputStyle} type="number" min="0" step="0.1"
                        value={(activeRoom.components || defaultComponents()).fn27Length}
                        onChange={e => updateComponents(activeRoom, { fn27Length: e.target.value })}
                        placeholder="Введи сумарну довжину"/>
                    </label>
                    <label style={labelStyle}>Блоки живлення FN-27, шт. (1000 ₴ кожен)
                      <input style={inputStyle} type="number" min="0" step="1"
                        value={(activeRoom.components || defaultComponents()).fn27Power}
                        onChange={e => updateComponents(activeRoom, { fn27Power: e.target.value })}/>
                    </label>
                    <label style={labelStyle}>Магнітні решітки FN-27, шт. (900 ₴ кожна)
                      <input style={inputStyle} type="number" min="0" step="1"
                        value={(activeRoom.components || defaultComponents()).fn27Grilles}
                        onChange={e => updateComponents(activeRoom, { fn27Grilles: e.target.value })}/>
                    </label>
                    <p className="muted">Закупівля планками по 2 м. Розрахунок — 2100 ₴ за погонний метр закупленої довжини. Блок живлення — 1000 ₴/шт.; магнітна решітка — 900 ₴/шт.</p>
                  </div>}
                  <p className="muted">Розрахункова довжина периметра: {roomPerimeter(activeRoom) === null ? 'не визначена' : `${formatNumber(roomPerimeter(activeRoom)!)} м`}</p>
                </div>

                <div style={panelStyle}>
                  <h2 style={{ marginTop: 0 }}>Карнизи</h2>
                  <button type="button" className="button secondary" style={{ width: '100%', justifyContent: 'space-between' }}
                    onClick={() => setSk30Open(v => !v)}>
                    <span>ALUTAT SK 3.0 — прихований карниз</span><span>{sk30Open ? '−' : '+'}</span>
                  </button>
                  {sk30Open && <>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                      <button className="button secondary" onClick={() => addSK30(activeRoom)}><Plus size={16}/> Додати карниз</button>
                    </div>
                  {(activeRoom.components?.sk30Items || []).length === 0 && <p className="muted">Карнизи ще не додані. Можна додати декілька карнизів із різною довжиною та кольором.</p>}
                  {(activeRoom.components?.sk30Items || []).map((item, index) => (
                    <div key={item.id} style={{ border: '1px solid #60778a', borderRadius: 12, padding: 14, marginTop: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <b>Карниз №{index + 1}</b>
                        <button className="icon-button" onClick={() => removeSK30(activeRoom, item.id)} aria-label="Видалити карниз"><X size={16}/></button>
                      </div>
                      <label style={labelStyle}>Колір
                        <select style={inputStyle} value={item.color} onChange={e => updateSK30(activeRoom, item.id, { color: e.target.value as 'white' | 'black' })}>
                          <option value="white">Білий</option><option value="black">Чорний</option>
                        </select>
                      </label>
                      <label style={labelStyle}>Потрібна довжина, м
                        <input style={inputStyle} type="number" min="0" step="0.1" value={item.length}
                          onChange={e => updateSK30(activeRoom, item.id, { length: e.target.value })} placeholder="Наприклад, 3,0"/>
                      </label>
                      <label style={labelStyle}>Підсвітка
                        <select style={inputStyle} value={(item.ledEnabled ?? Number(item.ledLength || 0) > 0) ? 'yes' : 'no'}
                          onChange={e => updateSK30(activeRoom, item.id, { ledEnabled: e.target.value === 'yes', ...(e.target.value === 'no' ? { ledLength: '0' } : {}) })}>
                          <option value="no">Без підсвітки</option><option value="yes">З підсвіткою</option>
                        </select>
                      </label>
                      {(item.ledEnabled ?? Number(item.ledLength || 0) > 0) && <>
                        <label style={labelStyle}>Колір світла
                          <select style={inputStyle} value={item.ledColor || 'Тепле 3000K'} onChange={e => updateSK30(activeRoom, item.id, { ledColor: e.target.value })}>
                            <option>Тепле 3000K</option><option>Нейтральне 4000K</option><option>Холодне 6000K</option><option>RGB</option>
                          </select>
                        </label>
                        <label style={labelStyle}>Довжина LED-підсвітки, м
                          <input style={inputStyle} type="number" min="0" step="0.1" value={item.ledLength}
                            onChange={e => updateSK30(activeRoom, item.id, { ledLength: e.target.value })} placeholder="0"/>
                        </label>
                      </>}
                      <label style={labelStyle}>Блоки живлення, шт.
                        <input style={inputStyle} type="number" min="0" step="1" value={item.power}
                          onChange={e => updateSK30(activeRoom, item.id, { power: e.target.value })}/>
                      </label>
                      <label style={labelStyle}>Магнітні решітки, шт.
                        <input style={inputStyle} type="number" min="0" step="1" value={item.grilles}
                          onChange={e => updateSK30(activeRoom, item.id, { grilles: e.target.value })}/>
                      </label>
                    </div>
                  ))}
                  <p className="muted">Профіль 2200 ₴/м. Підбір стандартних відрізків: 2; 2,5; 3,2 або 3,6 м — програма підбирає найменшу сумарну довжину, достатню для замовлення. LED — 250 ₴/м; колір світла обирається окремо; блок живлення — 600 ₴; магнітна решітка — 900 ₴.</p>
                  </>}
                </div>

                <div style={panelStyle}>
                  <h2 style={{ marginTop: 0 }}>Інші комплектуючі з каталогу</h2>
                  <p className="muted">Додавай решітки, вентиляцію та інші позиції з категорії «Інше». Ціна й назва фіксуються на момент додавання.</p>
                  <select style={inputStyle} defaultValue="" onChange={e => { if (e.target.value) { addCatalogItemToRoom(activeRoom, e.target.value); e.target.value = '' } }}>
                    <option value="">Обрати позицію з каталогу…</option>
                    {catalog.filter(item => item.category === 'Інше').map(item => <option key={item.id} value={item.id}>{item.name} — {item.price} ₴/{item.unit === 'м' ? 'м' : 'шт.'}</option>)}
                  </select>
                  {(activeRoom.components?.catalogItems || []).map(item => <div key={item.id} style={{ border: '1px solid #60778a', borderRadius: 10, padding: 12, marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><b>{item.name}</b><button className="icon-button" onClick={() => removeRoomCatalogItem(activeRoom, item.id)} aria-label="Видалити позицію"><X size={16}/></button></div>
                    <div className="muted">{money(Number(item.price || 0))} / {item.unit}</div>
                    <label style={labelStyle}>Кількість, {item.unit}
                      <input style={inputStyle} type="number" min="0" step={item.unit === 'м' ? '0.1' : '1'} value={item.quantity} onChange={e => updateRoomCatalogItem(activeRoom, item.id, { quantity: e.target.value })}/>
                    </label>
                    <div className="info-row"><span>Сума</span><b>{money(Number(item.price || 0) * Number(item.quantity || 0))}</b></div>
                  </div>)}
                  {!(activeRoom.components?.catalogItems || []).length && <p className="muted">Поки що позиції не додані.</p>}
                </div>

                <div style={panelStyle}>
                  <h2 style={{ marginTop: 0 }}>Попередній кошторис кімнати</h2>
                  {(() => {
                    const e = componentEstimate(activeRoom)
                    return <>
                      <div className="info-row"><span>Полотно MSD Premium ({formatNumber(e.area)} м²)</span><b>{money(e.fabric)}</b></div>
                      {e.insertLength > 0 && <div className="info-row"><span>Декоративна вставка ({formatNumber(e.insertLength)} пог. м)</span><b>{money(e.insert)}</b></div>}
                      {e.fly > 0 && <div className="info-row"><span>ALUTAT FLY ({formatNumber(Number((activeRoom.components || defaultComponents()).flyLength || 0))} пог. м; планки по 2 м)</span><b>{money(e.fly)}</b></div>}
                      {e.ud > 0 && <div className="info-row"><span>Тіньовий профіль UD ({formatNumber(Number((activeRoom.components || defaultComponents()).udLength || 0))} пог. м)</span><b>{money(e.ud)}</b></div>}
                      {e.standardCorners > 0 && <div className="info-row"><span>Додаткові кути стандартного профілю</span><b>{money(e.standardCorners)}</b></div>}
                      {e.flyCornersCost > 0 && <div className="info-row"><span>Кути FLY ({(activeRoom.components || defaultComponents()).flyCorners} × 500 ₴)</span><b>{money(e.flyCornersCost)}</b></div>}
                      {e.udCornersCost > 0 && <div className="info-row"><span>Кути UD ({(activeRoom.components || defaultComponents()).udCorners} × 400 ₴)</span><b>{money(e.udCornersCost)}</b></div>}
                      {e.skDetails.filter(item => item.total > 0).map((item, index) => <div key={item.id} className="info-row"><span>SK 3.0 №{index + 1} ({item.color === 'white' ? 'білий' : 'чорний'}{(item.ledEnabled ?? Number(item.ledLength || 0) > 0) ? `, з підсвіткою ${item.ledColor || 'Тепле 3000K'}` : ', без підсвітки'}) та аксесуари</span><b>{money(item.total)}</b></div>)}
                      {e.fn27 > 0 && <div className="info-row"><span>FN-27</span><b>{money(e.fn27)}</b></div>}
                      {e.fn27Power > 0 && <div className="info-row"><span>Блоки живлення FN-27 ({(activeRoom.components || defaultComponents()).fn27Power} × 1000 ₴)</span><b>{money(e.fn27Power)}</b></div>}
                      {e.fn27Grilles > 0 && <div className="info-row"><span>Магнітні решітки FN-27 ({(activeRoom.components || defaultComponents()).fn27Grilles} × 900 ₴)</span><b>{money(e.fn27Grilles)}</b></div>}
                      {e.flyPower > 0 && <div className="info-row"><span>Живлення FLY</span><b>{money(e.flyPower)}</b></div>}
                      {e.flyGrilles > 0 && <div className="info-row"><span>Магнітні решітки FLY ({(activeRoom.components || defaultComponents()).flyGrilles} × 900 ₴)</span><b>{money(e.flyGrilles)}</b></div>}
                      {e.catalogItems.filter(item => Number(item.quantity || 0) > 0).map(item => <div key={item.id} className="info-row"><span>{item.name} ({item.quantity} {item.unit})</span><b>{money(Number(item.price || 0) * Number(item.quantity || 0))}</b></div>)}
                      <div className="room-area"><span>Разом попередньо</span><strong>{money(e.total)}</strong></div>
                    </>
                  })()}
                </div>
              </div>
            ) : (
            <>
            <div style={{ ...panelStyle, marginBottom: 18 }}>
              <h2 style={{ marginTop: 0 }}>Тип приміщення</h2>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  style={{ ...buttonStyle, background: activeRoom.shape === 'rectangle' ? '#ffb900' : '#405263', color: activeRoom.shape === 'rectangle' ? '#18222c' : '#fff' }}
                  onClick={() => updateRoom(activeRoom.id, { shape: 'rectangle', sides: activeRoom.sides.length === 4 ? activeRoom.sides : makeSides(4) })}
                >Прямокутник</button>
                <button
                  style={{ ...buttonStyle, background: activeRoom.shape === 'polygon' ? '#ffb900' : '#405263', color: activeRoom.shape === 'polygon' ? '#18222c' : '#fff' }}
                  onClick={() => updateRoom(activeRoom.id, { shape: 'polygon', sides: activeRoom.sides.length >= 3 ? activeRoom.sides : makeSides(4), vertices: activeRoom.vertices || regularVertices(activeRoom.sides.length || 4) })}
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
                <label style={labelStyle}>Довжина, м
                  <input style={inputStyle} type="number" min="0" step="0.01"
                    value={activeRoom.length ?? ''}
                    onChange={e => updateRoom(activeRoom.id, { length: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
                    placeholder="Наприклад, 5,20"/>
                </label>
                <label style={labelStyle}>Ширина, м
                  <input style={inputStyle} type="number" min="0" step="0.01"
                    value={activeRoom.width ?? ''}
                    onChange={e => updateRoom(activeRoom.id, { width: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
                    placeholder="Наприклад, 3,60"/>
                </label>
                <div className="room-area">
                  <span>Площа</span>
                  <strong>{activeRoom.length && activeRoom.width ? `${formatNumber(activeRoom.length * activeRoom.width)} м²` : '—'}</strong>
                </div>
                <h3 style={{ marginTop: 20 }}>Діагоналі для розрахунку площі</h3>
                <p className="muted">Виміряй діагоналі від точки A до внутрішніх кутів. Для чотирикутника потрібна A–C; для більшої кількості кутів — A–C, A–D тощо.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 12 }}>
                  {diagonalKeys(activeRoom.sides.length).map(diagonal => (
                    <label key={diagonal.key} style={labelStyle}>
                      {diagonal.label}, м
                      <input style={inputStyle} type="number" min="0" step="0.01"
                        value={(activeRoom.diagonals || {})[diagonal.key] || ''}
                        onChange={e => updateDiagonal(activeRoom, diagonal.key, e.target.value)}
                        placeholder="0,00"/>
                    </label>
                  ))}
                </div>
                <div className="room-area">
                  <span>Розрахункова площа</span>
                  <strong>{polygonArea(activeRoom) === null ? 'Введи сторони й діагоналі' : `${formatNumber(polygonArea(activeRoom)!)} м²`}</strong>
                </div>
                <div className="room-area">
                  <span>Периметр</span>
                  <strong>{activeRoom.length && activeRoom.width ? `${formatNumber(2 * (activeRoom.length + activeRoom.width))} м` : '—'}</strong>
                </div>
                <div style={{ marginTop: 22, padding: 14, background: '#1a2834', borderRadius: 10 }}>
                  <svg viewBox="0 0 360 190" width="100%" role="img" aria-label="Креслення прямокутної кімнати">
                    <polygon points="70,35 290,35 290,145 70,145" fill="#33495b" stroke="#ffb900" strokeWidth="3"/>
                    <text x="25" y="95" fill="#fff" fontSize="13">A — B</text>
                    <text x="180" y="25" textAnchor="middle" fill="#fff" fontSize="13">B — C</text>
                    <text x="305" y="95" fill="#fff" fontSize="13">C — D</text>
                    <text x="180" y="165" textAnchor="middle" fill="#fff" fontSize="13">D — A</text>
                    {['A','B','C','D'].map((v,i) => {
                      const pts = [[70,145],[70,35],[290,35],[290,145]]
                      return <g key={v}><circle cx={pts[i][0]} cy={pts[i][1]} r="5" fill="#ffb900"/><text x={pts[i][0] + (i===0||i===1?-15:8)} y={pts[i][1] + (i===1||i===2?-9:17)} fill="#ffcf52" fontSize="14" fontWeight="bold">{v}</text></g>
                    })}
                  </svg>
                </div>
                <p className="muted">Для прямокутної кімнати площа та периметр обчислюються автоматично.</p>
              </div>
            ) : (
              <div style={panelStyle}>
                <h2 style={{ marginTop: 0 }}>Креслення складної форми</h2>
                <p className="muted">Перетягни жовті точки мишкою або пальцем, щоб задати контур. Потім внеси фактичну довжину кожної сторони.</p>
                <label style={labelStyle}>Кількість кутів
                  <select style={inputStyle} value={activeRoom.sides.length || 4}
                    onChange={e => changeSideCount(activeRoom, Number(e.target.value))}>
                    {Array.from({length:10},(_,i)=>i+3).map(n=><option key={n} value={n}>{n} кутів</option>)}
                  </select>
                </label>

                <div style={{ margin: '12px 0', padding: 12, background: '#1a2834', borderRadius: 10, touchAction: 'none' }}>
                  <svg
                    viewBox="0 0 360 230"
                    width="100%"
                    role="img"
                    aria-label="Редаговане креслення кімнати"
                    style={{ display: 'block', touchAction: 'none', userSelect: 'none' }}
                  >
                    <polygon
                      points={(activeRoom.vertices || regularVertices(activeRoom.sides.length || 4)).map(v => `${v.x},${v.y}`).join(' ')}
                      fill="#33495b"
                      stroke="#ffb900"
                      strokeWidth="3"
                      strokeLinejoin="round"
                    />
                    {(activeRoom.vertices || regularVertices(activeRoom.sides.length || 4)).map((v, i, arr) => {
                      const next = arr[(i + 1) % arr.length]
                      const label = `${String.fromCharCode(65+i)}–${String.fromCharCode(65+((i+1)%arr.length))}`
                      return <g key={`side-${i}`}>
                        <text x={(v.x+next.x)/2} y={(v.y+next.y)/2-8} textAnchor="middle" fill="#ffffff" fontSize="11">{label}</text>
                      </g>
                    })}
                    {(activeRoom.vertices || regularVertices(activeRoom.sides.length || 4)).map((v, i) => (
                      <g key={`point-${i}`}>
                        <circle
                          cx={v.x} cy={v.y} r="13"
                          fill="#ffb900" stroke="#fff2bd" strokeWidth="2"
                          style={{ cursor: 'grab', touchAction: 'none' }}
                          onPointerDown={e => {
                            e.preventDefault()
                            e.stopPropagation()
                            const svg = e.currentTarget.ownerSVGElement
                            if (!svg) return
                            e.currentTarget.setPointerCapture(e.pointerId)
                          }}
                          onPointerMove={e => {
                            if (!(e.buttons || e.pressure > 0)) return
                            const svg = e.currentTarget.ownerSVGElement
                            if (!svg) return
                            const rect = svg.getBoundingClientRect()
                            const x = Math.max(12, Math.min(348, (e.clientX-rect.left)/rect.width*360))
                            const y = Math.max(12, Math.min(218, (e.clientY-rect.top)/rect.height*230))
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
                      {side.label}, м
                      <input style={inputStyle} type="number" min="0" step="0.01" value={side.length}
                        onChange={e => updateSide(activeRoom, side.id, e.target.value)} placeholder="0,00"/>
                    </label>
                  ))}
                </div>
                <h3 style={{ marginTop: 20 }}>Діагоналі для розрахунку площі</h3>
                <p className="muted">Виміряй діагоналі від точки A до внутрішніх кутів. Для чотирикутника потрібна A–C; для більшої кількості кутів — A–C, A–D тощо.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 12 }}>
                  {diagonalKeys(activeRoom.sides.length).map(diagonal => (
                    <label key={diagonal.key} style={labelStyle}>
                      {diagonal.label}, м
                      <input style={inputStyle} type="number" min="0" step="0.01"
                        value={(activeRoom.diagonals || {})[diagonal.key] || ''}
                        onChange={e => updateDiagonal(activeRoom, diagonal.key, e.target.value)}
                        placeholder="0,00"/>
                    </label>
                  ))}
                </div>
                <div className="room-area">
                  <span>Розрахункова площа</span>
                  <strong>{polygonArea(activeRoom) === null ? 'Введи сторони й діагоналі' : `${formatNumber(polygonArea(activeRoom)!)} м²`}</strong>
                </div>
                <div className="room-area">
                  <span>Периметр</span>
                  <strong>{activeRoom.sides.every(s => s.length.trim() !== '' && Number(s.length) > 0)
                    ? `${formatNumber(activeRoom.sides.reduce((sum,s)=>sum+Number(s.length),0))} м`
                    : 'Введи всі сторони'}</strong>
                </div>
                <p style={{ color: '#ffd27a', fontSize: 13, lineHeight: 1.5 }}>
                  Контур можна пересувати для наочного креслення. Довжини сторін вводяться окремо за фактичними замірами. Площа розраховується розбиттям контуру на трикутники за формулою Герона після введення всіх сторін і діагоналей від точки A.
                </p>
              </div>
            )}
            </>
            )}
          </section>
        ) : active ? (
          <section className="content">
            <button className="back-link" onClick={() => setActive(null)}><ArrowLeft size={16}/> До списку об’єктів</button>
            <div className="page-heading">
              <div><div className="eyebrow">ОБ’ЄКТ · {active.id}</div><h1>{active.client}</h1><p className="muted">Створено {new Date(active.created).toLocaleDateString('uk-UA')}</p></div>
              <span className="pill">{active.status}</span>
            </div>
            <div className="panel" style={{ marginBottom: 18, border: '2px solid #e5a900' }}>
              <h2 style={{ marginTop: 0 }}>Керування об’єктом</h2>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="button primary" onClick={saveActiveProject}>Зберегти об’єкт</button>
                <button className="button secondary" onClick={() => openEstimate(active)}>Відкрити кошторис</button>
                <button className="button secondary" onClick={openLocation}><MapPin size={15}/> Локація об’єкта</button>
                <button className="button secondary" onClick={exportCuttingPlan}>Креслення для закрійника PDF</button>
                <button className="button secondary" onClick={exportWorkerTask}><ClipboardList size={15}/> Завдання монтажникам PDF</button>
                <button className="button" style={{ background: '#7f2525', color: '#fff' }} onClick={() => deleteProject(active.id)}><Trash2 size={15}/> Видалити об’єкт</button>
              </div>
            </div>
            <div className="detail-grid">
              <div className="panel">
                <h2>Інформація про об’єкт</h2>
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
              <label>Адреса об’єкта<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Місто, вулиця, номер будинку"/></label>
              <div className="field-label">Кімнати / стелі</div>
              <div className="add-room"><input value={roomName} onChange={e=>setRoomName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addRoom()} placeholder="Назва кімнати, наприклад Вітальня"/><button className="icon-button" onClick={addRoom} aria-label="Додати кімнату"><Plus size={19}/></button></div>
              {rooms.map((r,i)=><div className="added-room" key={r.id}><span>{i+1}. {r.name}</span><button onClick={()=>setRooms(prev=>prev.filter(x=>x.id!==r.id))}><X size={15}/></button></div>)}
              <div className="form-actions" style={{ flexWrap: 'wrap' }}>
                <button className="button secondary" onClick={()=>{setCreating(false);resetForm()}}>Скасувати</button>
                <button className="button secondary" disabled={!rooms.length} onClick={() => openEstimate({ id: 'Чернетка', client: client.trim(), phone: phone.trim(), address: address.trim(), status: 'Чернетка', created: new Date().toISOString(), rooms }, true)}>Кошторис без збереження</button>
                <button className="button primary" disabled={!client.trim()} onClick={saveProject}>Зберегти проєкт</button>
              </div>
            </div>
          </section>
        ) : (
          <section className="content">
            <div className="page-heading">
              <div><div className="eyebrow">РОБОЧИЙ ПРОСТІР</div><h1>Об’єкти</h1><p className="muted">Керування замовленнями та приміщеннями</p></div>
              <button className="button primary" onClick={()=>setCreating(true)}><Plus size={18}/> Створити об’єкт</button>
            </div>
            <div className="stats">
              <div className="stat-card"><span>Усього об’єктів</span><strong>{projects.length}</strong></div>
              <div className="stat-card"><span>Кімнат / стель</span><strong>{projects.reduce((n,p)=>n+p.rooms.length,0)}</strong></div>
              <div className="stat-card"><span>Нові об’єкти</span><strong>{projects.filter(p=>p.status==='Новий').length}</strong></div>
            </div>
            <div className="list-toolbar"><h2>Усі об’єкти</h2><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Пошук за клієнтом, телефоном або ID"/></div></div>
            <div className="project-list">
              {filtered.length ? filtered.map(p=><button className="project-card" key={p.id} onClick={()=>setActive(p)}>
                <div className="project-icon"><House size={21}/></div>
                <div className="project-main"><b>{p.client}</b><span>{p.address || 'Адресу не вказано'} · {p.rooms.length} кімн.</span><small>{p.phone || p.id}</small></div>
                <div className="project-meta"><span className="pill">{p.status}</span><small>{new Date(p.created).toLocaleDateString('uk-UA')}</small></div>
                <ChevronRight className="project-chevron" size={19}/>
              </button>) : <div className="empty"><div className="empty-icon"><House size={25}/></div><b>Нічого не знайдено</b><span>Зміни пошуковий запит або створи новий об’єкт.</span></div>}
            </div>
            <div className="prototype-note"><span className="status-dot"/> Локальний прототип. Дані зберігаються в цьому браузері на цьому пристрої.</div>
          </section>
        )}
        {locationOpen && active && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div className="panel" style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #e5a900', boxShadow: '0 20px 70px rgba(0,0,0,.45)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div><div className="eyebrow">ОБ’ЄКТ · {active.id}</div><h2 style={{ margin: '5px 0 0' }}>Локація об’єкта</h2></div>
                <button className="icon-button" onClick={() => setLocationOpen(false)} aria-label="Закрити"><X size={18}/></button>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>{active.client}</p>
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
