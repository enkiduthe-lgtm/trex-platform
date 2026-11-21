'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { createActionLock, createRequestGate } from '../lib/async-controls';
type Profile={configured:boolean;grants:string[];resources:[string,string][];actions:[string,string][]};
export function AccessEditor({userId,email,onClose}:{userId:string;email:string;onClose:()=>void}){
 const [profile,setProfile]=useState<Profile|null>(null),[grants,setGrants]=useState<string[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const gate=useRef(createRequestGate()),lock=useRef(createActionLock());
 async function load(){
  const ticket=gate.current.begin();setLoading(true);setMessage('');setProfile(null);
  try{const result=await api<Profile>(`/admin/access/${userId}`);if(gate.current.isCurrent(ticket)){setProfile(result);setGrants(result.grants);}}
  catch(error){if(gate.current.isCurrent(ticket))setMessage(error instanceof Error?error.message:'Yetkiler alınamadı.');}
  finally{if(gate.current.isCurrent(ticket))setLoading(false);}
 }
 useEffect(()=>{void load();return()=>gate.current.invalidate();},[userId]);
 function toggle(resource:string,action:string,checked:boolean){if(lock.current.isLocked()||loading||!profile)return;const key=`${resource}.${action}`;setGrants(previous=>{let next=previous.filter(k=>k!==key);if(action==='VIEW'&&!checked)next=next.filter(k=>!k.startsWith(resource+'.'));if(checked){next.push(key);if(action!=='VIEW'&&!next.includes(resource+'.VIEW'))next.push(resource+'.VIEW');}return next;});}
 async function save(){
  if(loading||!profile||!lock.current.acquire())return;
  const ticket=gate.current.begin();setBusy(true);setMessage('');
  try{await api(`/admin/access/${userId}`,{method:'PUT',body:JSON.stringify({grants})});if(gate.current.isCurrent(ticket))setMessage('Yetkiler Kaydedildi. Değişiklikler Bir Sonraki İşlemde Uygulanır.');}
  catch(error){if(gate.current.isCurrent(ticket))setMessage(error instanceof Error?error.message:'Kaydedilemedi');}
  finally{lock.current.release();if(gate.current.isCurrent(ticket))setBusy(false);}
 }
 return <section className="table-card" aria-busy={loading||busy}><h2>Yönetici Yetkileri · {email}</h2><p>İzin Verilecek İşlemleri İşaretleyin. Müdür Hesapları Sınırlandırılmaz. Yönetici, Müdür Primini Ve Başkalarının Yetki Ayarlarını Göremez.</p>{message&&<div className="notice" role="status">{message}</div>}{loading&&<p role="status">Yönetici yetkileri yükleniyor…</p>}{profile&&<div className="table-wrap"><table><thead><tr><th>Bölüm</th>{profile.actions.map(([key,title])=><th key={key}>{title}</th>)}</tr></thead><tbody>{profile.resources.map(([resource,title])=><tr key={resource}><td>{title}</td>{profile.actions.map(([action,label])=><td key={action}><input type="checkbox" aria-label={`${title} · ${label}`} checked={grants.includes(`${resource}.${action}`)} disabled={busy} onChange={e=>toggle(resource,action,e.target.checked)}/></td>)}</tr>)}</tbody></table></div>}<div className="staff-actions">{profile&&<button type="button" disabled={busy||loading} onClick={()=>void save()}>{busy?'Kaydediliyor…':'Yetkileri Kaydet'}</button>}{!profile&&!loading&&<button type="button" onClick={()=>void load()}>Yetkileri Yeniden Yükle</button>}<button type="button" className="secondary" disabled={busy} onClick={onClose}>Düzenlemeyi Kapat</button></div></section>;
}
