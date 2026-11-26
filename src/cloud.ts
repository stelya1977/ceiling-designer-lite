import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient, type Session } from '@supabase/supabase-js'

// The publishable key is intended for browser use. Row-level security is required.
export const supabase = createClient(
  'https://geusdieajvcnuzgbaygj.supabase.co',
  'sb_publishable_kwJarKeqWLeGlSgVU8ToIA_MUHUHHnb'
)
const META = 'nsk-ceiling-cloud-v1'
type Workspace<P, C> = { projects: P[]; catalog: C[] }
type Remote<P, C> = Workspace<P, C> & { revision: number; updated_at: string }
type Meta = { uid: string; revision: number; fingerprint: string }
type Conflict = { revision: number | null }

// Stable across JSONB object-key reordering. Metadata does not duplicate large photos.
function fingerprint(value: unknown): string {
  const s = JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
  let a = 2166136261, b = 0x9e3779b9
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 16777619)
    b = Math.imul(b ^ s.charCodeAt(i), 2246822519)
  }
  return `${s.length}:${a >>> 0}:${b >>> 0}`
}
function readMeta(): Meta | null {
  try { return JSON.parse(localStorage.getItem(META) || 'null') } catch { return null }
}
function errorText(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e)
}

export function useCloud<P, C>(workspace: Workspace<P, C>, apply: (w: Workspace<P, C>) => void, pristine: (w: Workspace<P, C>) => boolean) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('Локальний режим')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [busy, setBusy] = useState(false)
  const current = useRef(workspace)
  current.current = workspace
  const applyRef = useRef(apply); applyRef.current = apply
  const pristineRef = useRef(pristine); pristineRef.current = pristine
  const owner = useRef<string | null>(null)
  const meta = useRef<Meta | null>(readMeta())
  const pendingConflict = useRef<Conflict | null>(null)
  const running = useRef(false)
  const generation = useRef(0)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      const uid = next?.user.id ?? null
      if (owner.current !== uid) {
        owner.current = uid; generation.current++
        pendingConflict.current = null; setConflict(null); setError('')
        setStatus(uid ? 'Очікування синхронізації…' : 'Локальний режим')
      }
      setSession(next); setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const sync = useCallback(async (choice?: 'local' | 'cloud') => {
    const uid = owner.current, epoch = generation.current
    if (!uid || running.current || (pendingConflict.current && !choice)) return
    if (!navigator.onLine) { setStatus('Офлайн · зміни залишаються на пристрої'); return }
    running.current = true; setBusy(true); setStatus('Синхронізація…'); setError('')
    const valid = () => owner.current === uid && generation.current === epoch
    const mark = (w: Workspace<P,C>, revision: number) => {
      const next = { uid, revision, fingerprint: fingerprint(w) }
      meta.current = next
      try { localStorage.setItem(META, JSON.stringify(next)) } catch { /* memory still holds the baseline */ }
    }
    const raise = (row: Remote<P,C> | null) => {
      const next = { revision: row?.revision ?? null }
      pendingConflict.current = next; setConflict(next); setStatus('Потрібно вибрати версію даних')
    }
    const finish = () => {
      pendingConflict.current = null; setConflict(null); setStatus('Синхронізовано')
    }
    try {
      const access = await supabase.from('ceiling_admins').select('user_id').eq('user_id',uid).maybeSingle()
      if (!valid()) return
      if (access.error || !access.data) throw new Error('Синхронізація доступна лише власнику')
      const result = await supabase.from('ceiling_workspace').select('projects,catalog,revision,updated_at').eq('user_id', uid).maybeSingle()
      if (!valid()) return
      if (result.error) throw result.error
      const remote = result.data as Remote<P,C> | null
      if (remote && (!Array.isArray(remote.projects) || !Array.isArray(remote.catalog) || !Number.isSafeInteger(remote.revision))) throw new Error('Некоректний формат даних у базі')
      const local = current.current, localHash = fingerprint(local)
      const cloud = remote ? { projects: remote.projects, catalog: remote.catalog } : null
      const baseline = meta.current?.uid === uid ? meta.current : null
      const same = cloud !== null && fingerprint(cloud) === localHash
      const differentAccount = !!meta.current && meta.current.uid !== uid
      if (choice && pendingConflict.current?.revision !== (remote?.revision ?? null)) { raise(remote); return }
      const receive = () => {
        if (!cloud || !remote) throw new Error('У хмарі поки немає даних')
        // Persist before replacing the live state. If storage is full, retain local data.
        applyRef.current(cloud); current.current = cloud
        mark(cloud, remote.revision); finish()
      }
      if (choice === 'cloud') { receive(); return }
      if (!choice && same && remote) { mark(local, remote.revision); finish(); return }
      if (!choice) {
        if (differentAccount) { raise(remote); return }
        if (remote && !baseline) {
          if (pristineRef.current(local)) receive(); else raise(remote)
          return
        }
        if (remote && baseline) {
          const dirty = localHash !== baseline.fingerprint
          if (remote.revision !== baseline.revision) {
            if (dirty) raise(remote); else receive()
            return
          }
          if (!dirty) { finish(); return }
        }
        if (!remote && baseline) { raise(null); return }
      }
      const revision = remote ? remote.revision + 1 : 1
      const payload = { projects: local.projects, catalog: local.catalog, revision, updated_at: new Date().toISOString() }
      const saved = remote
        ? await supabase.from('ceiling_workspace').update(payload).eq('user_id', uid).eq('revision', remote.revision).select('revision').maybeSingle()
        : await supabase.from('ceiling_workspace').insert({ user_id: uid, ...payload }).select('revision').single()
      if (!valid()) return
      if (saved.error?.code === '23505' || (!saved.error && !saved.data)) {
        setStatus('Дані змінилися на іншому пристрої · повторна перевірка'); return
      }
      if (saved.error) throw saved.error
      mark(local, revision); finish()
    } catch (e) {
      if (valid()) { setError(errorText(e)); setStatus('Не синхронізовано · локальні дані збережено за наявності місця') }
    } finally { running.current = false; setBusy(false) }
  }, [])

  const uid = session?.user.id
  useEffect(() => {
    if (!uid) return
    void sync()
    const tick = window.setInterval(() => { void sync() }, 15000)
    const wake = () => { void sync() }
    const offline = () => setStatus('Офлайн · зміни залишаються на пристрої')
    window.addEventListener('online', wake); window.addEventListener('focus', wake); window.addEventListener('offline', offline)
    return () => { window.clearInterval(tick); window.removeEventListener('online', wake); window.removeEventListener('focus', wake); window.removeEventListener('offline', offline) }
  }, [uid, sync])
  useEffect(() => {
    if (!uid) return
    const timer = window.setTimeout(() => { void sync() }, 900)
    return () => window.clearTimeout(timer)
  }, [workspace.projects, workspace.catalog, uid, sync])

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }
  async function logout() {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw error
  }
  return { session, ready, status, error, conflict, busy, sync, login, logout }
}
