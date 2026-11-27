// All persisted room dimensions and published worker payload lengths remain metres.
// Convert only at the measurement input/output boundary.
function numeric(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}
function tidy(n: number): string { return String(Number(n.toPrecision(15))) }
export function metresToCm(value: unknown): string {
  const n = numeric(value)
  return n === null ? '' : tidy(n * 100)
}
export function cmToMetres(value: string): string {
  const n = numeric(value)
  return n === null ? '' : tidy(n / 100)
}
export function formatCm(value: unknown): string {
  const n = numeric(metresToCm(value))
  return n === null || n <= 0 ? '—' : `${n.toLocaleString('uk-UA', { maximumFractionDigits: 6, useGrouping: false })} см`
}
