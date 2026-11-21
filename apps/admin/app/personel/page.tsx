'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';
import { RemovalLink } from '../components/removal-link';
import { AccessEditor } from './access-editor';
import { createActionLock, createRequestGate } from '../lib/async-controls';
type Staff={id:string;email:string;role:string;is_active:boolean;created_at:string};
const roleLabel=(role:string)=>({SUPER_ADMIN:'Müdür',ADMIN:'Yönetici',FINANCE:'Önceki Muhasebe Rolü',WAREHOUSE:'Önceki Stok Rolü'} as Record<string,string>)[role]??role;
export default function StaffPage(){
 const [staff,setStaff]=useState<Staff[]>([]),[self,setSelf]=useState(''),[query,setQuery]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState<Staff|null>(null);
 const [form,setForm]=useState({email:'',password:'',role:'ADMIN'}),[reset,setReset]=useState<Staff|null>(null),[password,setPassword]=useState('');
 const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[loadError,setLoadError]=useState('');
 const alive=useRef(true),loadGate=useRef(createRequestGate()),actionLock=useRef(createActionLock());
 const disabled=busy||loading||!ready;
 const shown=staff.filter(person=>person.email.toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR')));
 async function load(){
  const ticket=loadGate.current.begin();setLoading(true);setReady(false);setLoadError('');
  try{const [people,me]=await Promise.all([api<Staff[]>('/admin/staff'),api<{user:{id:string}}>('/auth/me')]);
   if(!alive.current||!loadGate.current.isCurrent(ticket))return false;
   setStaff(people);setSelf(me.user.id);setReady(true);return true;
  }catch(error){if(alive.current&&loadGate.current.isCurrent(ticket))setLoadError(error instanceof Error?error.message:'Hesaplar Alınamadı');return false;}
  finally{if(alive.current&&loadGate.current.isCurrent(ticket))setLoading(false);}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;loadGate.current.invalidate();};},[]);
 async function act(path:string,body:unknown,method='POST'){
  if(!ready||loading||!alive.current||!actionLock.current.acquire())return false;
  loadGate.current.invalidate();setBusy(true);setMessage('');
  try{await api(path,{method,body:JSON.stringify(body)});if(alive.current){setMessage('İşlem Kaydedildi.');await load();}return true;}
  catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'İşlem Tamamlanamadı');return false;}
  finally{actionLock.current.release();if(alive.current)setBusy(false);}
 }
 async function create(e:FormEvent){e.preventDefault();if(await act('/admin/staff',form)&&alive.current)setForm({email:'',password:'',role:'ADMIN'});}
 return <main><AdminNav/><section className="staff-workspace"><h1>Müdür Ve Yönetici Hesapları</h1>
 <RemovalLink href="/yonetim/hesap-sil?kind=staff">Yönetici Sil / Silinenler</RemovalLink>
 <div className="staff-actions"><Link href="/yonetim/guvenlik">İki Aşamalı Doğrulama Ve Oturumlar</Link><Link href="/primler/yonetim">Prim Ayarları</Link><button type="button" disabled={busy||loading} onClick={()=>void load()}>{loading?'Hesaplar Yükleniyor…':'Hesapları Yenile'}</button></div>
 {message&&<div className="notice" role="status">{message}</div>}
 {loadError&&<div className="notice" role="alert">Hesap listesi yenilenemedi: {loadError} {staff.length>0?'Son yüklenen liste gösteriliyor. ':''}Yeni işlem yapmadan önce Hesapları Yenile düğmesini kullanın.</div>}
 <form className="form-card" onSubmit={create}><h2>Yeni Panel Hesabı</h2><div className="form-grid">
  <label>E-posta<input disabled={disabled} required type="email" maxLength={240} autoComplete="off" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></label>
  <label>İlk Şifre<input disabled={disabled} required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={form.password} onChange={e=>setForm(v=>({...v,password:e.target.value}))}/></label>
  <label>Rol<select disabled={disabled} value={form.role} onChange={e=>setForm(v=>({...v,role:e.target.value}))}><option value="ADMIN">Yönetici</option><option value="SUPER_ADMIN">Müdür · Tam Yetki</option></select></label>
 </div><button disabled={disabled}>Hesabı Oluştur</button></form>
 <section className="table-card" aria-busy={loading}><div className="period-toolbar"><h2>Hesaplar Ve Başvurular</h2><label>E-posta Ara<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="E-posta Ara"/></label></div>
 <div className="table-wrap"><table><thead><tr><th>E-posta</th><th>Rol</th><th>Durum</th><th>Kayıt Tarihi</th><th>İşlemler</th></tr></thead><tbody>
  {shown.map(person=><tr key={person.id}>
   <td>{person.email}{person.id===self&&<small>Bu Hesap</small>}</td>
   <td>{person.id===self?roleLabel(person.role):<select aria-label={`${person.email} Rolü`} disabled={disabled} value={person.role} onChange={e=>void act(`/admin/staff/${person.id}/role`,{role:e.target.value},'PATCH')}>{!['ADMIN','SUPER_ADMIN'].includes(person.role)&&<option value={person.role}>{roleLabel(person.role)}</option>}<option value="ADMIN">Yönetici</option><option value="SUPER_ADMIN">Müdür · Tam Yetki</option></select>}</td>
   <td>{person.is_active?'Aktif':'Onay Bekliyor / Pasif'}</td><td>{new Date(person.created_at).toLocaleDateString('tr-TR',{timeZone:'Europe/Istanbul'})}</td>
   <td><div className="staff-actions">
    {person.role==='ADMIN'&&<button disabled={disabled} onClick={()=>{if(actionLock.current.isLocked())return;setEditing(person);setReset(null);setPassword('');}}>Yetkileri Düzenle</button>}
    {person.role!=='SUPER_ADMIN'&&<><button disabled={disabled} onClick={()=>void act(`/admin/staff/${person.id}`,{isActive:!person.is_active},'PATCH')}>{person.is_active?'Hesabı Pasifleştir':'Başvuruyu Onayla'}</button><button className="secondary" disabled={disabled} onClick={()=>{if(actionLock.current.isLocked())return;setReset(person);setEditing(null);setPassword('');}}>Şifreyi Yenile</button></>}
   </div></td>
  </tr>)}
  {!shown.length&&<tr><td colSpan={5}>{loading?'Hesaplar yükleniyor…':loadError?'Hesap listesi alınamadı. Yeniden yükleyin.':query.trim()?'Aramanıza uygun hesap bulunmuyor.':'Henüz hesap veya başvuru bulunmuyor.'}</td></tr>}
 </tbody></table></div></section>
 {editing&&<AccessEditor key={editing.id} userId={editing.id} email={editing.email} disabled={disabled} onClose={()=>setEditing(null)}/>}
 {reset&&<form className="form-card" onSubmit={e=>{e.preventDefault();void act(`/admin/staff/${reset.id}/reset-password`,{password}).then(ok=>{if(ok&&alive.current){setReset(null);setPassword('');}});}}><h2>Şifre Yenile · {reset.email}</h2><label>Yeni Geçici Şifre<input disabled={disabled} required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="staff-actions"><button disabled={disabled}>Şifreyi Yenile</button><button type="button" disabled={busy} className="secondary" onClick={()=>{if(actionLock.current.isLocked())return;setReset(null);setPassword('');}}>Vazgeç</button></div></form>}
 </section></main>;
}
