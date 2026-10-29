'use client';

// Keep refresh cookies first-party on both the custom domain and Render preview host.
export const apiBaseUrl = '/v1';
export const tokenKey = 'trex_admin_access_token';
export function getToken() { return typeof window === 'undefined' ? null : window.localStorage.getItem(tokenKey); }
export function setToken(token: string) { window.localStorage.setItem(tokenKey, token); }
export function clearToken() { window.localStorage.removeItem(tokenKey); }
export async function logout() {
  await api<void>('/auth/logout', { method: 'POST' });
  clearToken();
}
let refreshInFlight:Promise<boolean>|null=null;
function refreshAccessToken(){
  if(!refreshInFlight)refreshInFlight=performRefresh().catch(()=>false).finally(()=>{refreshInFlight=null;});
  return refreshInFlight;
}
async function performRefresh() {
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!response.ok) return false;
  const body = await response.json().catch(() => null);
  if (!body?.accessToken) return false;
  setToken(body.accessToken);
  return true;
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = getToken();
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body && !isFormData ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  // Access tokens are intentionally short-lived. Renew once through the secure
  // refresh-cookie flow so an active panel session does not appear empty.
  if (response.status === 401 && !retried && !['/auth/refresh','/auth/login'].includes(path) && await refreshAccessToken()) return api<T>(path, init, true);
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? `İşlem tamamlanamadı (${response.status})`); }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
