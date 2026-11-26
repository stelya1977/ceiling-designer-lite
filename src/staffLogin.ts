// Short worker logins use a reserved, non-deliverable email domain internally.
// Supabase continues to own passwords, sessions and account IDs.
export const shortLoginPattern = /^[a-z0-9][a-z0-9_-]{2,31}$/
export function normalizeShortLogin(value:string){return value.trim().toLowerCase()}
export function workerLoginEmail(value:string){
  const login=normalizeShortLogin(value)
  if(!shortLoginPattern.test(login))throw new Error('Логін: 3–32 символи, латинські літери, цифри, дефіс або підкреслення. Перший символ — літера або цифра.')
  return `${login}@example.com`
}
export function accountEmail(value:string){const login=value.trim();return login.includes('@')?login:workerLoginEmail(login)}
export function validWorkerPassword(value:string){return value.length>=8&&new TextEncoder().encode(value).length<=72&&value.trim()===value}
