import { useState, type CSSProperties } from 'react'

// undefined: invalid or incomplete; empty string: deliberately cleared.
// Keep temporary separators in the input, and only persist valid values.
export function parseNumericDraft(raw: string, integer = false, max?: number): string | undefined {
  if (raw === '') return ''
  if (!(integer ? /^\d+$/ : /^\d*(?:[.,]\d*)?$/).test(raw)) return undefined
  const normalized = raw.replace(',', '.')
  if (normalized === '.') return undefined
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isSafeInteger(n)) || (max !== undefined && n > max)) return undefined
  return String(n)
}

export default function NumericInput({ value, onChange, placeholder, style, integer = false, max }: {
  value: string | number | undefined
  onChange: (value: string) => void
  placeholder?: string
  style?: CSSProperties
  integer?: boolean
  max?: number
}) {
  const stored = value == null ? '' : String(value).replace('.', ',')
  const [draft, setDraft] = useState<string | null>(null)
  return <input type="text" inputMode={integer ? 'numeric' : 'decimal'} autoComplete="off" spellCheck={false}
    style={style} value={draft ?? stored} placeholder={placeholder}
    onFocus={() => setDraft(stored)}
    onChange={e => {
      const next = e.target.value
      const parsed = parseNumericDraft(next, integer, max)
      if (parsed === undefined) {
        if (!integer && (next === '.' || next === ',')) setDraft(next)
        return
      }
      setDraft(next)
      onChange(parsed)
    }}
    onBlur={() => setDraft(null)}
    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
}
