'use client';
import {useEffect,useState} from 'react';
import {AdminNav} from '../../components/admin-nav';
import {api} from '../../lib/api';
type Account={id:string;name:string;kind:string;archived_at:string|null};
export default function AccountArchives(){
 const[rows,setRows]=useState<Account[]>([]),[selected,setSelected]=useState<Account|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[allowed,setAllowed]=useState(false);
 async function load(){setRows(await api<Account[]>('/admin/account-archives'));}
 useEffect(()=>{void api<{user:{role:string}}>('/auth/me').then(async me=>{if(me.user.role!=='SUPER_ADMIN')throw new Error('Bu Alanı Yalnız Müdür Kullanabilir');setAllowed(true);await load();}).catch(e=>setMessage(e.message));},[]);
 async function save(){if(!selected||busy)return;setBusy(true);try{await api('/admin/account-archives/'+selected.kind+'/'+selected.id,{method:'POST',body:JSON.stringify({isActive:Boolean(selected.archived_at)})});setSelected(null);setMessage('İşlem Tamamlandı. Geri Alınan Hesap İçin Yeniden Onay Gerekir.');await load();}catch(e){setMessage(e instanceof Error?e.message:'İşlem Başarısız');}finally{setBusy(false);}}
 return <main><AdminNav/><section><h1>Yönetici Ve Bayi Silme</h1>{message&&<p role="status">{message}</p>}{allowed&&<>{selected&&<section className="form-card"><h2>{selected.archived_at?'Hesabı Geri Al':'Hesabı Sil'} · {selected.name}</h2><p>Hesap Girişi Kapatılır. Sipariş, Prim Ve Finans Geçmişi Korunur.</p><div className="button-row"><button disabled={busy} onClick={()=>void save()}>{selected.archived_at?'Geri Almayı Onayla':'Silmeyi Onayla'}</button><button disabled={busy} onClick={()=>setSelected(null)}>Vazgeç</button></div></section>}<section className="table-card"><div className="table-wrap"><table><thead><tr><th>Hesap</th><th>Tür</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{rows.map(row=><tr key={row.kind+row.id}><td>{row.name}</td><td>{row.kind==='staff'?'Yönetici':'Bayi'}</td><td>{row.archived_at?'Silindi':'Kayıtlı'}</td><td><button disabled={busy} onClick={()=>setSelected(row)}>{row.archived_at?'Geri Al':'Sil'}</button></td></tr>)}</tbody></table></div></section></>}</section></main>;
}
