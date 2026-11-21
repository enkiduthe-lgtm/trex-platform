'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {AdminNav} from '../../components/admin-nav';
import removal from '../../components/removal.module.css';
import {api} from '../../lib/api';
import {createRequestGate} from '../../lib/async-controls';
type Row={id:string;order_number:string;status:string;total_amount:string;currency:string;archived_at:string;archive_reason:string;archived_by_email:string};
export default function DeleteOrders(){const [allowed,setAllowed]=useState(false),[orders,setOrders]=useState<Row[]>([]),[deleted,setDeleted]=useState<Row[]>([]),[id,setId]=useState(''),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const lock=useRef(false);const [testMode,setTestMode]=useState(false),[testNumber,setTestNumber]=useState(''),[testCandidate,setTestCandidate]=useState<Row|null>(null);const [selected,setSelected]=useState<string[]>([]),[confirmBulk,setConfirmBulk]=useState(false);
const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[loadError,setLoadError]=useState('');
const alive=useRef(true),gate=useRef(createRequestGate());
async function load(){
 const ticket=gate.current.begin();setLoading(true);setReady(false);setLoadError('');
 try{
  const [all,archived]=await Promise.all([api<Row[]>('/admin/orders/delete-candidates'),api<Row[]>('/admin/orders/deleted')]);
  if(!alive.current||!gate.current.isCurrent(ticket))return false;
  const candidates=all.filter(row=>row.status==='CANCELLED');setOrders(candidates);setDeleted(archived);
  setSelected(current=>current.filter(value=>candidates.some(row=>row.id===value)));setReady(true);return true;
 }catch(error){if(alive.current&&gate.current.isCurrent(ticket))setLoadError(error instanceof Error?error.message:'Kayıtlar yüklenemedi.');return false;}
 finally{if(alive.current&&gate.current.isCurrent(ticket))setLoading(false);}
}
async function lookupTestOrder(){
 const number=testNumber.trim();
 if(!allowed||!ready||!testMode||!number||lock.current)return;
 lock.current=true;setBusy(true);setMessage('');setTestCandidate(null);
 try {
  const result=await api<Row>(`/admin/orders/test-archive-candidate?${new URLSearchParams({number})}`);
  if(alive.current){if(result.order_number!==number)throw new Error('Aranan sipariş numarası ile bulunan kayıt eşleşmiyor.');setTestCandidate(result);}
 } catch (error) {
  if(alive.current)setMessage(error instanceof Error?error.message:'Sipariş bulunamadı.');
 } finally {
  lock.current=false;if(alive.current)setBusy(false);
 }
}
useEffect(()=>{
 alive.current=true;
 void api<{user:{role:string}}>('/auth/me').then(async result=>{
  if(!alive.current)return;
  if(result.user.role!=='SUPER_ADMIN'){setMessage('Bu Ekranı Yalnız Müdür Kullanabilir.');setLoading(false);return;}
  setAllowed(true);await load();if(!alive.current)return;
  const target=new URLSearchParams(window.location.search).get('siparis');if(target)setId(target);
 }).catch(error=>{if(alive.current){setMessage(error instanceof Error?error.message:'Kayıtlar yüklenemedi.');setLoading(false);}});
 return()=>{alive.current=false;gate.current.invalidate();};
},[]);
async function bulkArchive(){
 if(!allowed||!ready||lock.current||!confirmBulk||!selected.length||reason.trim().length<3||reason.trim().length>1000)return;
 const targets=orders.filter(row=>selected.includes(row.id)&&row.status==='CANCELLED');
 if(targets.length!==selected.length){setMessage('Seçilen siparişler değişmiş. Listeyi yenileyip yeniden seçin.');return;}
 lock.current=true;setBusy(true);setConfirmBulk(false);let done=0;const failures:string[]=[];
 const failedIds:string[]=[];
 try{for(const row of targets){try{await api('/admin/orders/'+row.id+'/delete',{method:'POST',body:JSON.stringify({reason:reason.trim()})});done++;}catch(e){failedIds.push(row.id);failures.push(row.order_number+': '+(e instanceof Error?e.message:'İşlem Başarısız'));}}
 if(!alive.current)return;setSelected(failedIds);
 const result=done+' Sipariş Silindi.'+(failures.length?' Tamamlanamayanlar: '+failures.join(' · '):' Geçmiş Kayıtları Korundu.');
 await load();if(alive.current)setMessage(result);
 }catch(e){if(alive.current)setMessage(e instanceof Error?e.message:'Liste Yenilenemedi');}finally{lock.current=false;if(alive.current)setBusy(false);}
}
async function action(target:string,restore=false,test=false){
 if(!allowed||!ready||lock.current||!alive.current)return;
 const valid=restore?deleted.some(row=>row.id===target):test?testMode&&testCandidate?.id===target&&testCandidate.order_number===testNumber.trim():orders.some(row=>row.id===target&&row.status==='CANCELLED');
 if(!valid||!restore&&(reason.trim().length<3||reason.trim().length>1000)){setMessage('Geçerli siparişi seçin ve en az üç karakterlik işlem nedeni girin.');return;}
 lock.current=true;setBusy(true);setMessage('');
 try{
  await api('/admin/orders/'+target+(restore?'/restore':'/delete'),{method:'POST',...(restore?{}:{body:JSON.stringify({reason:reason.trim(),testOrderNumber:test?testNumber.trim():undefined})})});
  if(!alive.current)return;setId('');setReason('');if(test){setTestCandidate(null);setTestNumber('');}
  setMessage(restore?'Sipariş Listeye Geri Alındı.':'Sipariş Listeden Silindi. Geçmiş Kayıtları Korundu.');await load();
 }catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'İşlem Tamamlanamadı.');}
 finally{lock.current=false;if(alive.current)setBusy(false);}
}
return <main className={removal.page}><AdminNav/><section className="dealer-workspace">
 <Link className={removal.back} href="/siparisler">← Siparişler</Link><h1>Sipariş Silme Ve Geri Alma</h1><p>Bu alanı yalnız Müdür kullanabilir. Kayıtlar arşivlenir; finans, stok, iade ve prim geçmişi korunur.</p>
 {message&&<p className="notice" role="status">{message}</p>}
 {loading&&<p role="status">Sipariş kayıtları yükleniyor…</p>}
 {allowed&&<>
  <div className={removal.toolbar}><button type="button" disabled={busy||loading} onClick={()=>void load()}>Sipariş Kayıtlarını Yenile</button><Link href="/siparisler">Sipariş Listesine Dön</Link></div>
  {loadError&&<p className="notice" role="alert">Güncel kayıtlar alınamadı: {loadError} Son yüklenen liste gösteriliyor. Yeni işlem yapmadan önce kayıtları yenileyin; başarılı işlemi tekrar göndermeyin.</p>}
  <fieldset className={removal.operationFields} disabled={busy||!ready}>
   <form className="form-card" onSubmit={event=>{event.preventDefault();void action(id);}}>
    <h2>İptal Edilmiş Siparişi Sil</h2><p>Aktif siparişi önce Siparişler ekranından iptal edin. Silinen sipariş bu ekrandan listeye geri alınabilir.</p>
    <div className="two-columns"><label>Sipariş<select required value={id} onChange={event=>setId(event.target.value)}>
     <option value="">İptal Edilmiş Sipariş Seçin</option>
     {id&&!orders.some(order=>order.id===id)&&<option value={id} disabled>Bu Sipariş Silinmeye Uygun Değil</option>}
     {orders.map(row=><option key={row.id} value={row.id}>{row.order_number} · {row.total_amount} {row.currency}</option>)}
    </select></label><label>Silme Nedeni<textarea required minLength={3} maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)}/></label></div>
    <button disabled={!id||!orders.some(order=>order.id===id)||reason.trim().length<3}>{busy?'Kaydediliyor…':'Seçilen Siparişi Listeden Sil'}</button>
   </form>
   <section className="form-card">
    <h2>Deneme Siparişini Listeden Kaldır</h2><p>Yalnız tamamı deneme olan kayıtlar içindir. Para iadesi yapmaz, Aras gönderisini iptal etmez ve stok hareketlerini geri çevirmez.</p>
    <label><input type="checkbox" checked={testMode} onChange={event=>{setTestMode(event.target.checked);setTestCandidate(null);setTestNumber('');}}/>Kaydın Tamamının Deneme Olduğunu Doğruluyorum</label>
    {testMode&&<>
     <div className="button-row"><label>Sipariş Numarası<input maxLength={64} value={testNumber} onChange={event=>{setTestNumber(event.target.value);setTestCandidate(null);}}/></label><button type="button" className="secondary" disabled={!testNumber.trim()} onClick={()=>void lookupTestOrder()}>Siparişi Bul</button></div>
     {testCandidate&&<>
      <p><Link href={'/siparisler/'+testCandidate.id}>{testCandidate.order_number}</Link> · {Number(testCandidate.total_amount).toLocaleString('tr-TR',{style:'currency',currency:testCandidate.currency})}</p>
      <label>Neden<textarea minLength={3} maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)}/></label>
      <button type="button" disabled={reason.trim().length<3} onClick={()=>void action(testCandidate.id,false,true)}>Deneme Siparişini Arşivle</button>
     </>}
    </>}
   </section>
   <section className="table-card">
    <h2>Toplu Sipariş Silme</h2><p>Yalnız iptal edilmiş siparişler listelenir. Tamamlanamayan siparişler seçili kalır; sonucu kontrol ederek yeniden deneyebilirsiniz.</p>
    <div className="table-wrap"><table><thead><tr>
     <th><input aria-label="Tüm Uygun Siparişleri Seç" type="checkbox" disabled={!orders.length} checked={orders.length>0&&selected.length===orders.length} onChange={event=>setSelected(event.target.checked?orders.map(row=>row.id):[])}/></th><th>Sipariş</th><th>Tutar</th><th>Durum</th>
    </tr></thead><tbody>{orders.map(row=><tr key={row.id}>
     <td><input type="checkbox" aria-label={row.order_number+' Seç'} checked={selected.includes(row.id)} onChange={event=>setSelected(current=>event.target.checked?current.includes(row.id)?current:[...current,row.id]:current.filter(value=>value!==row.id))}/></td>
     <td>{row.order_number}</td><td>{Number(row.total_amount).toLocaleString('tr-TR',{style:'currency',currency:row.currency})}</td><td>İptal Edildi</td>
    </tr>)}</tbody></table></div>
    {ready&&!orders.length&&<p>Silinmeye Uygun Sipariş Yok.</p>}
    <label>Toplu Silme Nedeni<textarea minLength={3} maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)}/></label>
    <button type="button" disabled={!selected.length||reason.trim().length<3} onClick={()=>setConfirmBulk(true)}>Seçilenleri Sil ({selected.length})</button>
    {confirmBulk&&<section className="form-card" role="alertdialog" aria-labelledby="bulk-removal-title"><h3 id="bulk-removal-title">Toplu Silmeyi Onayla</h3><p>{selected.length} sipariş ana listeden kaldırılacak. Geçmiş kayıtları korunacak ve bu ekrandan geri alınabilecek.</p><div className="button-row"><button type="button" onClick={()=>void bulkArchive()}>Onayla Ve Sil</button><button type="button" onClick={()=>setConfirmBulk(false)}>Vazgeç</button></div></section>}
   </section>
   <section className="table-card"><h2>Silinen Siparişler ({deleted.length})</h2>
    <div className="table-wrap"><table><thead><tr><th>Sipariş</th><th>Tutar</th><th>Silinme Tarihi</th><th>Silen Müdür</th><th>Neden</th><th>İşlem</th></tr></thead><tbody>
     {deleted.map(row=><tr key={row.id}><td><Link href={'/siparisler/'+row.id}>{row.order_number}</Link></td><td>{Number(row.total_amount).toLocaleString('tr-TR',{style:'currency',currency:row.currency})}</td><td>{new Date(row.archived_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}</td><td>{row.archived_by_email}</td><td>{row.archive_reason}</td><td><button type="button" className="secondary" onClick={()=>void action(row.id,true)}>Listeye Geri Al</button></td></tr>)}
    </tbody></table></div>{ready&&!deleted.length&&<p>Silinen Sipariş Bulunmuyor.</p>}
   </section>
  </fieldset>
 </>}
</section></main>;}
