'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '../lib/api';

type Mode = 'LOGIN' | 'DEALER_APPLICATION';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [application, setApplication] = useState({ companyName: '', contactName: '', email: '', phone: '', city: '', region: '', salesChannels: '', socialMedia: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) { setMode(next); setError(''); setMessage(''); }

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ accessToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, ...(mfaCode ? { mfaCode } : {}) }) });
      setToken(result.accessToken);
      router.push('/urunler');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Giriş yapılamadı'); }
    finally { setBusy(false); }
  }

  async function apply(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await api('/dealer-applications', { method: 'POST', body: JSON.stringify(application) });
      setMessage('Bayi başvurunuz alındı. Yönetici inceleyip hesabınızın açılış bilgilerini size iletecek.');
      setApplication({ companyName: '', contactName: '', email: '', phone: '', city: '', region: '', salesChannels: '', socialMedia: '' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Başvuru gönderilemedi'); }
    finally { setBusy(false); }
  }

  return <main className="login-page"><section><img className="login-brand" src="/brand/trex-tea-logo.png" alt="TREX Tea" /><p>TREX TEA</p><h1>{mode === 'LOGIN' ? 'Yönetim girişi' : 'Bayi başvurusu'}</h1>{mode === 'LOGIN' ? <><p>Personel hesabınız yönetici tarafından açıldıysa e-posta ve şifrenizle giriş yapın.</p><form onSubmit={login} className="form-card"><label>E-posta<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><label>Şifre<input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label><label>Doğrulama kodu <small>(iki aşamalı doğrulama açıksa)</small><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))} /></label>{error && <p className="error">{error}</p>}<button disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button></form><button className="secondary" type="button" onClick={() => switchMode('DEALER_APPLICATION')}>Bayi olmak için başvur</button></> : <><p>Başvurunuz incelendikten sonra bayi hesabınız yönetici tarafından açılır.</p><form onSubmit={apply} className="form-card"><label>Firma adı<input required value={application.companyName} onChange={e => setApplication(x => ({ ...x, companyName: e.target.value }))} /></label><label>Yetkili adı<input required value={application.contactName} onChange={e => setApplication(x => ({ ...x, contactName: e.target.value }))} /></label><label>E-posta<input type="email" required value={application.email} onChange={e => setApplication(x => ({ ...x, email: e.target.value }))} /></label><label>Telefon<input required value={application.phone} onChange={e => setApplication(x => ({ ...x, phone: e.target.value }))} /></label><label>Şehir<input required value={application.city} onChange={e => setApplication(x => ({ ...x, city: e.target.value }))} /></label><label>Bölge <small>(isteğe bağlı)</small><input value={application.region} onChange={e => setApplication(x => ({ ...x, region: e.target.value }))} /></label><label>Satış kanalları <small>(isteğe bağlı)</small><input value={application.salesChannels} onChange={e => setApplication(x => ({ ...x, salesChannels: e.target.value }))} /></label><label>Sosyal medya <small>(isteğe bağlı)</small><input value={application.socialMedia} onChange={e => setApplication(x => ({ ...x, socialMedia: e.target.value }))} /></label>{error && <p className="error">{error}</p>}{message && <p role="status">{message}</p>}<button disabled={busy}>{busy ? 'Gönderiliyor…' : 'Başvuruyu gönder'}</button></form><button className="secondary" type="button" onClick={() => switchMode('LOGIN')}>Girişe dön</button></>}</section></main>;
}
