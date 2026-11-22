'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { useOrderPermissions } from '../../lib/use-order-permissions';
import { reportPeriod } from '../../lib/report-period';
import { financeDateTime } from '../../lib/finance-report';
import { downloadXlsx } from '../../lib/xlsx';

type Period={from:string;to:string};
type Report={dateFrom:string;dateTo:string;rows:{day:string;count:number;active:number}[];count:number;active:number;generatedAt:string};
function reportQuery(period:Period){
  const query=new URLSearchParams();if(period.from)query.set('dateFrom',period.from);if(period.to)query.set('dateTo',period.to);
  const parsed=reportPeriod(query.toString());
  if(period.from&&parsed.dateFrom!==period.from||period.to&&parsed.dateTo!==period.to||period.from&&period.to&&period.from>period.to)throw new Error('Geçerli bir başlangıç ve bitiş tarihi seçin.');
  return query.toString();
}
function validatedReport(value:Report,period:Period){
  if(value?.dateFrom!==period.from||value.dateTo!==period.to||typeof value.generatedAt!=='string'||!Number.isFinite(Date.parse(value.generatedAt))||!Array.isArray(value.rows)||new Set(value.rows.map(row=>row?.day)).size!==value.rows.length||value.rows.some(row=>!row||typeof row.day!=='string'||reportPeriod('dateFrom='+row.day).dateFrom!==row.day||period.from&&row.day<period.from||period.to&&row.day>period.to||!Number.isInteger(row.count)||row.count<0||!Number.isInteger(row.active)||row.active<0||row.active>row.count)||value.count!==value.rows.reduce((sum,row)=>sum+row.count,0)||value.active!==value.rows.reduce((sum,row)=>sum+row.active,0))throw new Error('Yeni üye raporu doğrulanamadı.');
  return value;
}
export default function MemberWorkspace(){
  const {permissions}=useOrderPermissions();
  const [period,setPeriod]=useState<Period>({from:'',to:''}),[data,setData]=useState<Report|null>(null);
  const [busy,setBusy]=useState(true),[ready,setReady]=useState(false),[error,setError]=useState('');
  const alive=useRef(true),requestId=useRef(0),readyRef=useRef(false),reading=useRef(false);
  const changed=Boolean(data&&(data.dateFrom!==period.from||data.dateTo!==period.to));
  async function load(snapshot:Period){
    let query:string;try{query=reportQuery(snapshot);}catch(reason){setError(reason instanceof Error?reason.message:'Tarih aralığı geçersiz.');return false;}
    const ticket=++requestId.current;reading.current=true;readyRef.current=false;setBusy(true);setReady(false);setError('');
    try{const result=validatedReport(await api<Report>('/admin/customers/registration-report'+(query?'?'+query:'')),snapshot);if(!alive.current||ticket!==requestId.current)return false;setData(result);setReady(true);readyRef.current=true;return true;}
    catch(reason){if(alive.current&&ticket===requestId.current)setError(reason instanceof Error?reason.message:'Yeni üye raporu alınamadı.');return false;}
    finally{if(alive.current&&ticket===requestId.current){reading.current=false;setBusy(false);}}
  }
  useEffect(()=>{alive.current=true;const parsed=reportPeriod(window.location.search),snapshot={from:parsed.dateFrom??'',to:parsed.dateTo??''};setPeriod(snapshot);void load(snapshot);return()=>{alive.current=false;requestId.current++;};},[]);
  function submit(event:FormEvent){event.preventDefault();void load({...period});}
  function exportReport(){
    if(reading.current||!readyRef.current||!data||data.dateFrom!==period.from||data.dateTo!==period.to)return;
    downloadXlsx('trex-yeni-uye-raporu.xlsx','Günlük Yeni Üye Kaydı',[
      ['Başlangıç',data.dateFrom||'Tüm Tarihler'],['Bitiş',data.dateTo||'Tüm Tarihler'],['Saat Dilimi','Europe/Istanbul'],['Veri Zamanı',financeDateTime(data.generatedAt)],[],
      ['Kayıt Tarihi','Yeni Kayıt Sayısı','Şu Anda Aktif','Şu Anda Pasif'],...data.rows.map(row=>[row.day,row.count,row.active,row.count-row.active]),[],['Toplam Yeni Kayıt',data.count],['Şu Anda Aktif',data.active],['Şu Anda Pasif',data.count-data.active],
    ]);
  }
  return <main><AdminNav/><section className="finance-workspace"><div className="period-toolbar"><div><p>RAPORLAR / MÜŞTERİ KAYITLARI</p><h1>Günlük Yeni Üye Kaydı</h1></div><nav className="finance-nav"><Link href="/raporlar">Rapor Merkezi</Link>{permissions.viewCustomer&&<Link href="/musteriler">Müşteriler</Link>}</nav></div>
    <p>Müşterilerin oluşturulma tarihleri Türkiye saatine göre gruplanır. Aktif / pasif bilgisi hesabın bugünkü durumunu gösterir; iletişim bilgileri bu rapora alınmaz.</p>
    <form className="form-card dealer-toolbar" onSubmit={submit}><label>Başlangıç Tarihi<input type="date" value={period.from} onChange={event=>setPeriod(value=>({...value,from:event.target.value}))}/></label><label>Bitiş Tarihi<input type="date" value={period.to} onChange={event=>setPeriod(value=>({...value,to:event.target.value}))}/></label><div className="button-row"><button disabled={busy}>{busy?'Rapor Yükleniyor…':'Raporu Getir'}</button><button type="button" disabled={busy||!ready||changed} onClick={exportReport}>Excel’e Aktar</button></div></form>
    {error&&<p role="alert" className="notice">{error} {data?'Son doğrulanan dönem gösteriliyor; aktarım yeniden yüklenene kadar kapalıdır.':'Raporu Getir düğmesiyle tekrar deneyebilirsiniz.'}</p>}{changed&&<p role="status" className="notice">Tarih seçimi değişti. Gösterilen rapor önceki döneme aittir; yeni dönem için Raporu Getir düğmesini kullanın.</p>}
    <div className="cards"><article><p>YENİ KAYIT</p><h2>{ready&&data?data.count:'Doğrulanmadı'}</h2></article><article><p>ŞU ANDA AKTİF</p><h2>{ready&&data?data.active:'Doğrulanmadı'}</h2></article><article><p>ŞU ANDA PASİF</p><h2>{ready&&data?data.count-data.active:'Doğrulanmadı'}</h2></article></div>
    <section className="table-card" aria-busy={busy}><div className="period-toolbar"><h2>Günlük Kayıtlar</h2><p>Gösterilen dönem: {data?.dateFrom||'Tüm tarihler'} — {data?.dateTo||'Sınır yok'} · Veri zamanı: {data?financeDateTime(data.generatedAt):'Henüz doğrulanmadı'}</p></div><div className="table-wrap"><table><caption>Günlük Müşteri Kayıt Sayıları</caption><thead><tr><th>Kayıt Tarihi</th><th>Yeni Kayıt Sayısı</th><th>Şu Anda Aktif</th><th>Şu Anda Pasif</th></tr></thead><tbody>{data?.rows.map(row=><tr key={row.day}><td>{row.day}</td><td>{row.count}</td><td>{row.active}</td><td>{row.count-row.active}</td></tr>)}{!data?.rows.length&&<tr><td colSpan={4}>{busy?'Kayıtlar yükleniyor…':!ready?'Rapor bilgileri doğrulanmadı.':'Seçilen dönemde yeni kayıt bulunmadı.'}</td></tr>}</tbody></table></div></section>
  </section></main>;
}
