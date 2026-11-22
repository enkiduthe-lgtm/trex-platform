'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '../lib/api';

export default function PasswordResetWorkspace(){
  const router=useRouter(),query=useSearchParams(),token=query.get('token')??'';
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
  const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [completed,setCompleted]=useState(false),[needsCheck,setNeedsCheck]=useState(false);
  const lock=useRef(false),alive=useRef(true),redirectTimer=useRef<number|null>(null);
  const currentToken=useRef(token);currentToken.current=token;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(redirectTimer.current!==null)window.clearTimeout(redirectTimer.current);};},[]);
  useEffect(()=>{setPassword('');setConfirmation('');setCompleted(false);setNeedsCheck(false);setMessage('');setError('');if(redirectTimer.current!==null)window.clearTimeout(redirectTimer.current);},[token]);
  async function request(event:FormEvent){
    event.preventDefault();if(lock.current||completed)return;
    const requestToken=token;
    lock.current=true;setBusy(true);setError('');setMessage('');
    try{
      const result=await api<{message:string}>('/auth/password-reset/request',{method:'POST',body:JSON.stringify({email:email.trim()})});
      if(typeof result?.message!=='string'||!result.message)throw new Error('Bağlantı isteğinin sonucu doğrulanamadı.');
      if(alive.current&&currentToken.current===requestToken)setMessage(result.message);
    }catch(reason){if(alive.current&&currentToken.current===requestToken)setError(reason instanceof Error?reason.message:'Bağlantı isteği tamamlanamadı.');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function confirm(event:FormEvent){
    event.preventDefault();if(lock.current||completed||needsCheck)return;
    const requestToken=token;
    setError('');setMessage('');
    if(password.length<12||password.length>128){setError('Yeni şifreniz 12 ile 128 karakter arasında olmalıdır.');return;}
    if(password!==confirmation){setError('Şifre alanları aynı olmalıdır.');return;}
    lock.current=true;setBusy(true);
    try{
      const result=await api<{message:string}>('/auth/password-reset/confirm',{method:'POST',body:JSON.stringify({token,password})});
      if(typeof result?.message!=='string'||!result.message)throw new Error('Şifre değiştirme sonucu doğrulanamadı.');
      if(alive.current&&currentToken.current===requestToken){setCompleted(true);setPassword('');setConfirmation('');setMessage(result.message);redirectTimer.current=window.setTimeout(()=>{if(alive.current&&currentToken.current===requestToken)router.replace('/giris');},1500);}
    }catch(reason){
      if(alive.current&&currentToken.current===requestToken){
        const rejected=reason instanceof ApiError&&reason.status>=400&&reason.status<500&&reason.status!==408;
        if(rejected)setError(reason.message);
        else{setNeedsCheck(true);setError('Sonuç doğrulanamadı. Önce yeni şifrenizle giriş yapmayı deneyin. Giriş olmuyorsa yeni bir sıfırlama bağlantısı isteyin.');}
      }
    }finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  return <main className="login-page"><section><img className="login-brand" src="/brand/trex-tea-logo.png" alt="TREX Tea"/><h1>{token?'Yeni Şifre Oluştur':'Şifremi Unuttum'}</h1><p>{token?'Yeni şifrenizi belirleyip kendi panelinizden giriş yapın.':'Kayıtlı e-posta adresinizi girin. Sıfırlama bağlantısı 15 dakika geçerlidir; yeni bağlantı isterseniz önceki bağlantı kapanır.'}</p>
    <form className="form-card" onSubmit={token?confirm:request}>{token?<><label>Yeni Şifre<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} disabled={busy||completed||needsCheck} onChange={event=>setPassword(event.target.value)}/></label><label>Yeni Şifre Tekrarı<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} disabled={busy||completed||needsCheck} onChange={event=>setConfirmation(event.target.value)}/></label><small>En az 12 karakter kullanın. Şifreniz değişince açık oturumlar kapanır.</small></>:<label>E-Posta<input type="email" autoComplete="username" maxLength={320} required value={email} disabled={busy} onChange={event=>setEmail(event.target.value)}/></label>}
      {error&&<p className="error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
      <button disabled={busy||completed||Boolean(token)&&needsCheck}>{busy?'İşlem Yapılıyor…':completed?'Şifre Oluşturuldu':token?'Yeni Şifreyi Oluştur':'Sıfırlama Bağlantısı İste'}</button>
    </form><div className="button-row"><button className="secondary" type="button" disabled={busy} onClick={()=>router.replace('/giris')}>Girişe Dön</button>{token&&!completed&&<button className="secondary" type="button" disabled={busy} onClick={()=>router.replace('/sifre-sifirla')}>Yeni Bağlantı İste</button>}</div>
  </section></main>;
}
