'use client';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';
export const tokenKey = 'trex_admin_access_token';
export function getToken() { return typeof window === 'undefined' ? null : window.localStorage.getItem(tokenKey); }
export function setToken(token: string) { window.localStorage.setItem(tokenKey, token); }
export function clearToken() { window.localStorage.removeItem(tokenKey); }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? `İşlem tamamlanamadı (${response.status})`); }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
