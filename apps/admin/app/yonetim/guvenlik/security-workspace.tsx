'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import styles from './security.module.css';

type Status={enabled:boolean;pending:boolean};
type Enrollment={secret:string;otpauthUri:string;expiresInSeconds:number};
type Session={id:string;created_at:string;expires_at:string;ip:string|null;user_agent:string|null;current:boolean};
const date=(value:string)=>new Date(value).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'short'});

export default function SecurityWorkspace(){
  const [status,setStatus]=useState<Status|null>(null);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [mfaReady,setMfaReady]=useState(false),[sessionsReady,setSessionsReady]=useState(false);
  const [mfaError,setMfaError]=useState(''),[sessionsError,setSessionsError]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [enrollment,setEnrollment]=useState<Enrollment|null>(null),[enrollmentUntil,setEnrollmentUntil]=useState<number|null>(null);
  const [now,setNow]=useState(Date.now()),[code,setCode]=useState(''),[password,setPassword]=useState('');
  const alive=useRef(true),reading=useRef(false),mutating=useRef(false);
  const remaining=enrollmentUntil===null?0:Math.max(0,Math.ceil((enrollmentUntil-now)/1000));
  const enrollmentExpired=Boolean(enrollment)&&remaining===0;
  async function load(fromAction=false){
    if(!alive.current||reading.current||mutating.current&&!fromAction)return false;
    reading.current=true;setLoading(true);setMfaReady(false);setSessionsReady(false);
    const outcomes=await Promise.allSettled([
      api<Status>('/auth/mfa').then(value=>{
        if(typeof value?.enabled!=='boolean'||typeof value?.pending!=='boolean')throw new Error('Doğrulama bilgileri alınamadı.');
        if(!alive.current)return;
        setStatus(value);setMfaReady(true);setMfaError('');
        if(value.enabled||!value.pending){setEnrollment(null);setEnrollmentUntil(null);}
      }).catch(error=>{if(alive.current)setMfaError(error instanceof Error?error.message:'Doğrulama bilgileri alınamadı.');throw error;}),
      api<Session[]>('/auth/sessions').then(value=>{
        if(!Array.isArray(value)||new Set(value.map(row=>row?.id)).size!==value.length||value.some(row=>!row||typeof row.id!=='string'||!row.id||typeof row.current!=='boolean'||!Number.isFinite(Date.parse(row.created_at))||!Number.isFinite(Date.parse(row.expires_at))||row.ip!==null&&typeof row.ip!=='string'||row.user_agent!==null&&typeof row.user_agent!=='string'))throw new Error('Açık oturumlar alınamadı.');
        if(alive.current){setSessions(value);setSessionsReady(true);setSessionsError('');}
      }).catch(error=>{if(alive.current)setSessionsError(error instanceof Error?error.message:'Açık oturumlar alınamadı.');throw error;}),
    ]);
    reading.current=false;if(alive.current)setLoading(false);
    return outcomes.every(outcome=>outcome.status==='fulfilled');
  }
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(enrollmentUntil===null)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[enrollmentUntil]);
  async function run(ready:boolean,task:()=>Promise<string>){
    if(!alive.current||mutating.current||reading.current||!ready)return;
    mutating.current=true;setBusy(true);setMessage('');
    try{const text=await task();if(alive.current)setMessage(text);await load(true);}
    catch(error){
      if(alive.current){setMessage(`${error instanceof Error?error.message:'İşlem tamamlanamadı.'} Güncel durum yeniden kontrol ediliyor; işlemi tekrar göndermeden önce aşağıdaki bilgileri kontrol edin.`);setMfaReady(false);setSessionsReady(false);}
      await load(true);
    }finally{mutating.current=false;if(alive.current){setBusy(false);setPassword('');setCode('');}}
  }
  async function start(){
    await run(mfaReady&&!status?.enabled,async()=>{
      const value=await api<Enrollment>('/auth/mfa/enroll',{method:'POST'});
      if(typeof value?.secret!=='string'||!value.secret||typeof value.otpauthUri!=='string'||!Number.isFinite(value.expiresInSeconds)||value.expiresInSeconds<=0)throw new Error('Kurulum anahtarı alınamadı. Yeni kurulum başlatın.');
      if(alive.current){const time=Date.now();setEnrollment(value);setEnrollmentUntil(time+value.expiresInSeconds*1000);setNow(time);}
      return 'Kurulum anahtarı hazır. Uygulamaya ekleyip altı haneli kodu doğrulayın.';
    });
  }
  async function confirm(event:FormEvent){
    event.preventDefault();
    if(enrollmentExpired||!enrollment||!/^\d{6}$/.test(code))return;
    await run(mfaReady&&!status?.enabled,async()=>{
      await api('/auth/mfa/confirm',{method:'POST',body:JSON.stringify({code})});
      if(alive.current){setEnrollment(null);setEnrollmentUntil(null);}
      return 'İki aşamalı doğrulama etkinleştirildi. Diğer cihazlardaki oturumlar kapatıldı.';
    });
  }
  async function disable(event:FormEvent){
    event.preventDefault();if(!password||!/^\d{6}$/.test(code))return;
    await run(mfaReady&&Boolean(status?.enabled),async()=>{
      await api('/auth/mfa/disable',{method:'POST',body:JSON.stringify({password,code})});
      return 'İki aşamalı doğrulama kapatıldı. Diğer cihazlardaki oturumlar kapatıldı.';
    });
  }
  async function revoke(session:Session){
    if(session.current||!sessions.some(row=>row.id===session.id&&!row.current))return;
    await run(sessionsReady,async()=>{await api(`/auth/sessions/${encodeURIComponent(session.id)}`,{method:'DELETE'});return 'Seçilen cihazdaki oturum kapatıldı.';});
  }
  async function revokeOthers(){
    if(!sessions.some(row=>!row.current))return;
    await run(sessionsReady,async()=>{const result=await api<{revokedCount:number}>('/auth/sessions/revoke-others',{method:'POST'});if(!Number.isInteger(result?.revokedCount)||result.revokedCount<0)throw new Error('Oturum kapatma sonucu doğrulanamadı.');return result.revokedCount?`${result.revokedCount} diğer oturum kapatıldı.`:'Kapatılacak başka açık oturum yok.';});
  }
  const blocked=busy||loading;
  return <main><AdminNav/><section className={styles.workspace}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>AYARLAR / HESAP GÜVENLİĞİ</p><h1>Hesap Güvenliği</h1><p>Doğrulama uygulamanızı ve hesabınızın açık olduğu cihazları yönetin.</p></div><button type="button" disabled={blocked} onClick={()=>void load()}>{loading?'Bilgiler Yenileniyor…':'Güvenlik Bilgilerini Yenile'}</button></header>
    {message&&<div className={styles.notice} role="status">{message}</div>}
    <div className={styles.summary}><div><span>İki Aşamalı Doğrulama</span><strong>{!mfaReady?'Durum doğrulanmadı':status?.enabled?'Etkin':'Kapalı'}</strong></div><div><span>Açık Oturumlar</span><strong>{sessionsReady?`${sessions.length} cihaz`:'Durum doğrulanmadı'}</strong></div><div><span>Oturum Süresi</span><strong>En fazla 2 saat</strong></div></div>
    <div className={styles.panels}>
      <section className={styles.card} aria-busy={loading}><div className={styles.cardHeading}><h2>İki Aşamalı Doğrulama</h2><span className={mfaReady&&status?.enabled?styles.enabled:styles.badge}>{!mfaReady?'Kontrol Bekliyor':status?.enabled?'Etkin':'Kapalı'}</span></div>
        {mfaError&&<p className={styles.error} role="alert">{mfaError} Doğrulama işlemleri güncel bilgi alınana kadar kapalıdır.</p>}
        {!status?<p>{loading?'Doğrulama bilgileri yükleniyor…':'Doğrulama bilgilerini almak için yenileyin.'}</p>:status.enabled?<form className={styles.form} onSubmit={disable}><p>Girişte şifrenize ek olarak uygulamanızdaki altı haneli kod istenir.</p><label>Mevcut Şifre<input required autoComplete="current-password" type="password" value={password} disabled={blocked||!mfaReady} onChange={event=>setPassword(event.target.value)}/></label><label>Doğrulama Kodu<input required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} disabled={blocked||!mfaReady} onChange={event=>setCode(event.target.value.replace(/\D/g,''))}/></label><button className={styles.danger} disabled={blocked||!mfaReady}>Doğrulamayı Kapat</button></form>:<>
          <p>Google Authenticator, Microsoft Authenticator veya benzeri bir uygulamayla girişinizi koruyun.</p>
          {status.pending&&!enrollment&&<p className={styles.notice}>Tamamlanmamış bir kurulum var. Anahtar elinizde değilse yeni kurulum başlatabilirsiniz.</p>}
          {!enrollment&&<button type="button" onClick={()=>void start()} disabled={blocked||!mfaReady}>{status.pending?'Yeni Kurulum Başlat':'Kurulumu Başlat'}</button>}
          {enrollment&&<form className={styles.form} onSubmit={confirm}><h3>1. Uygulamaya Ekleyin</h3><p>Uygulamada “kurulum anahtarı gir” seçeneğini açın. Bu anahtarı kimseyle paylaşmayın.</p><code className={styles.secret}>{enrollment.secret}</code><details><summary>Uygulama Bağlantısını Göster</summary><code className={styles.secret}>{enrollment.otpauthUri}</code></details><p role="timer">{enrollmentExpired?'Kurulum süresi doldu. Yeni kurulum başlatın.':`Kalan süre: ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}</p><h3>2. Kodu Doğrulayın</h3><label>Doğrulama Kodu<input required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} disabled={blocked||!mfaReady||enrollmentExpired} onChange={event=>setCode(event.target.value.replace(/\D/g,''))}/></label><div className={styles.actions}><button disabled={blocked||!mfaReady||enrollmentExpired}>Doğrula Ve Etkinleştir</button>{enrollmentExpired&&<button type="button" disabled={blocked||!mfaReady} onClick={()=>void start()}>Yeni Kurulum Başlat</button>}</div></form>}
        </>}
      </section>
      <section className={styles.card} aria-busy={loading}><div className={styles.cardHeading}><div><h2>Açık Oturumlar</h2><p>Yalnızca kendi hesabınıza ait cihazlar listelenir.</p></div>{sessions.some(session=>!session.current)&&<button type="button" className={styles.danger} disabled={blocked||!sessionsReady} onClick={()=>void revokeOthers()}>Diğer Oturumları Kapat</button>}</div>
        {sessionsError&&<p className={styles.error} role="alert">{sessionsError} Gösterilen cihazlar güncel olmayabilir; oturum kapatma işlemleri devre dışıdır.</p>}
        <div className={styles.tableWrap}><table><caption>Cihazlar Ve Oturum Bitişleri</caption><thead><tr><th>Cihaz / Tarayıcı</th><th>Başlangıç</th><th>Bitiş</th><th>IP Adresi</th><th>İşlem</th></tr></thead><tbody>{sessions.map(session=><tr key={session.id}><td><strong>{session.current?'Bu Cihaz':'Diğer Cihaz'}</strong><small>{session.user_agent??'Tarayıcı bilgisi yok'}</small></td><td>{date(session.created_at)}</td><td>{date(session.expires_at)}</td><td>{session.ip??'—'}</td><td>{session.current?<span className={styles.badge}>Çıkış düğmesini kullanın</span>:<button type="button" disabled={blocked||!sessionsReady} onClick={()=>void revoke(session)}>Oturumu Kapat</button>}</td></tr>)}{!sessions.length&&<tr><td colSpan={5}>{loading?'Açık oturumlar yükleniyor…':sessionsReady?'Başka açık oturum bulunamadı.':'Oturum bilgileri doğrulanmadı.'}</td></tr>}</tbody></table></div>
      </section>
    </div>
  </section></main>;
}
