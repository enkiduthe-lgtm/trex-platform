'use client';

// Keep refresh cookies first-party on both the custom domain and Render preview host.
export const apiBaseUrl = '/v1';
export const tokenKey = 'trex_admin_access_token';
export class ApiError extends Error {
  constructor(message:string,readonly status:number){super(message);this.name='ApiError';}
}
export class SessionChangedError extends Error {
  constructor(){super('Oturum değişti. İşlem sonucunu kendi hesabınızda yeniden kontrol edin.');this.name='SessionChangedError';}
}
let boundSubject:string|null=null;
let sessionGeneration=0;
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
  if(boundSubject&&tokenSubject(event.newValue)!==boundSubject){sessionGeneration++;returnToLogin();}
});
export function getToken() { return typeof window === 'undefined' ? null : window.localStorage.getItem(tokenKey); }
export function setToken(token: string,resetBinding=true) {
  if(resetBinding)sessionGeneration++;
  boundSubject=resetBinding?tokenSubject(token):boundSubject??tokenSubject(token);
  window.localStorage.setItem(tokenKey, token);
}
export function clearToken() { sessionGeneration++;boundSubject=null;window.localStorage.removeItem(tokenKey); }
export async function logout() {
  const generation=sessionGeneration;
  try{
    await api<void>('/auth/logout', { method: 'POST' });
    if(generation!==sessionGeneration)throw new SessionChangedError();
    clearToken();
  }catch(error){
    if(generation!==sessionGeneration)throw new SessionChangedError();
    throw error;
  }
}
let refreshInFlight:Promise<boolean>|null=null;
let refreshGeneration:number|null=null;
function refreshAccessToken(){
  if(!refreshInFlight||refreshGeneration!==sessionGeneration){
    const generation=sessionGeneration;
    const current=performRefresh(generation).catch(()=>false).finally(()=>{if(refreshInFlight===current){refreshInFlight=null;refreshGeneration=null;}});
    refreshInFlight=current;refreshGeneration=generation;
  }
  return refreshInFlight;
}
async function performRefresh(generation:number) {
  const startingToken=getToken(),expectedSubject=boundSubject??tokenSubject(startingToken);
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, { method: 'POST', credentials: 'include', cache: 'no-store' });
  if (!response.ok) return false;
  const body = await response.json().catch(() => null);
  if(typeof body?.accessToken!=='string'||!body.accessToken||generation!==sessionGeneration||getToken()!==startingToken)return false;
  if(expectedSubject&&tokenSubject(body.accessToken)!==expectedSubject)return false;
  setToken(body.accessToken,false);
  return true;
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const generation=sessionGeneration;
  const token = getToken();
  const subject=tokenSubject(token);
  if(subject){
    if(boundSubject&&subject!==boundSubject){sessionGeneration++;returnToLogin();throw new ApiError('Hesap oturumu değişti. Kendi hesabınızla yeniden giriş yapın.',401);}
    boundSubject??=subject;
  }
  const assertSession=()=>{
    if(generation!==sessionGeneration)throw new SessionChangedError();
    if(subject&&tokenSubject(getToken())!==subject){sessionGeneration++;returnToLogin();throw new SessionChangedError();}
  };
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  let response:Response;
  try{response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: { ...(init.body && !isFormData ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });}catch(error){assertSession();throw error;}
  assertSession();
  // Access tokens are intentionally short-lived. Renew once through the secure
  // refresh-cookie flow so an active panel session does not appear empty.
  if(response.status===401&&getToken()!==token){
    if(!retried&&getToken())return api<T>(path,init,true);
    throw new SessionChangedError();
  }
  if(response.status===401&&!retried&&!['/auth/refresh','/auth/login'].includes(path)){
    const refreshed=await refreshAccessToken();assertSession();
    if(refreshed||getToken()!==token&&getToken())return api<T>(path,init,true);
  }
  if (response.status === 401 && !['/auth/login','/auth/refresh','/auth/logout'].includes(path)) {
    clearToken();
    if (typeof window !== 'undefined' && window.location.pathname !== '/giris') window.location.replace('/giris');
  }
  if (!response.ok) {
    const failureGeneration=sessionGeneration;
    const body = await response.json().catch(() => null);
    if(failureGeneration!==sessionGeneration)throw new SessionChangedError();
    const message=Array.isArray(body?.message)?body.message.join(' · '):body?.message;
    throw new ApiError(String(message??`İşlem tamamlanamadı (${response.status})`),response.status);
  }
  let result:unknown;
  try{result=response.status===204?undefined:await response.json();}catch(error){assertSession();throw error;}
  assertSession();return result as T;
}
