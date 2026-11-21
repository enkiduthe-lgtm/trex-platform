'use client';

// Keep refresh cookies first-party on both the custom domain and Render preview host.
export const apiBaseUrl = '/v1';
export const tokenKey = 'trex_admin_access_token';
export class ApiError extends Error {
  constructor(message:string,readonly status:number){super(message);this.name='ApiError';}
}
let boundSubject:string|null=null;
// This binds the current page to an account; server-side JWT validation remains authoritative.
function tokenSubject(token:string|null):string|null {
  if(!token)return null;
  try {
    const payload=token.split('.')[1];if(!payload)return null;
    const base64=payload.replace(/-/g,'+').replace(/_/g,'/');
    const claims=JSON.parse(atob(base64.padEnd(Math.ceil(base64.length/4)*4,'=')));
    return typeof claims.sub==='string'&&claims.sub?claims.sub:null;
  }catch{return null;}
}
function returnToLogin(){if(typeof window!=='undefined'&&window.location.pathname!=='/giris')window.location.replace('/giris');}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
  if(event.key!==tokenKey&&event.key!==null)return;
  if(boundSubject&&tokenSubject(event.newValue)!==boundSubject)returnToLogin();
});
export function getToken() { return typeof window === 'undefined' ? null : window.localStorage.getItem(tokenKey); }
export function setToken(token: string,resetBinding=true) {
  boundSubject=resetBinding?tokenSubject(token):boundSubject??tokenSubject(token);
  window.localStorage.setItem(tokenKey, token);
}
export function clearToken() { boundSubject=null;window.localStorage.removeItem(tokenKey); }
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
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, { method: 'POST', credentials: 'include', cache: 'no-store' });
  if (!response.ok) return false;
  const body = await response.json().catch(() => null);
  if (!body?.accessToken) return false;
  setToken(body.accessToken,false);
  return true;
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = getToken();
  const subject=tokenSubject(token);
  if(subject){
    if(boundSubject&&subject!==boundSubject){returnToLogin();throw new ApiError('Hesap oturumu değişti. Kendi hesabınızla yeniden giriş yapın.',401);}
    boundSubject??=subject;
  }
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: { ...(init.body && !isFormData ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  // Access tokens are intentionally short-lived. Renew once through the secure
  // refresh-cookie flow so an active panel session does not appear empty.
  if (response.status === 401 && !retried && !['/auth/refresh','/auth/login'].includes(path) && await refreshAccessToken()) return api<T>(path, init, true);
  if (response.status === 401 && !['/auth/login','/auth/refresh','/auth/logout'].includes(path)) {
    clearToken();
    if (typeof window !== 'undefined' && window.location.pathname !== '/giris') window.location.replace('/giris');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message=Array.isArray(body?.message)?body.message.join(' · '):body?.message;
    throw new ApiError(String(message??`İşlem tamamlanamadı (${response.status})`),response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
