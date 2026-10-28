'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsx';

type Account={id:string;name:string;account_type:string;currency:string;income:string;expense:string;current_balance:string;movement_count:number};
type Collection={id:string;account_name:string;currency:string;amount:string;counterparty_name:string|null;reference_number:string|null;description:string;occurred_at:string};
type Reconciliation={dateFrom:string|null;dateTo:string|null;accounts:Account[];unmatchedCollections:Collection[]};
const money=(value:string,currency:string)=>Number(value||0).toLocaleString('tr-TR',{style:'currency',currency});

export default function ReconciliationPage(){
  const [dateFrom,setDateFrom]=useState(''); const [dateTo,setDateTo]=useState(''); const [data,setData]=useState<Reconciliation|null>(null); const [message,setMessage]=useState('');
  const load=()=>{const query=new URLSearchParams();if(dateFrom)query.set('dateFrom',dateFrom);if(dateTo)query.set('dateTo',dateTo);void api<Reconciliation>(`/admin/finance/reconciliation?${query}`).then(setData).catch(error=>setMessage(error instanceof Error?error.message:'Mutabakat raporu yüklenemedi.'));};
  useEffect(()=>{load();},[]);
  function exportReport(){if(!data)return;downloadXlsx('trex-finans-mutabakat.xlsx','Mutabakat',[['Başlangıç',dateFrom||'Tüm Zamanlar'],['Bitiş',dateTo||'Bugün'],[],['Hesap','Para Birimi','Hareket','Dönem Girişi','Dönem Çıkışı','Güncel Bakiye'],...data.accounts.map(item=>[item.name,item.currency,String(item.movement_count),item.income,item.expense,item.current_balance]),[],['Eşleşmeyen Havale','Hesap','Tarih','Tutar','Gönderen','Referans','Açıklama'],...data.unmatchedCollections.map(item=>['Bekliyor',item.account_name,new Date(item.occurred_at).toLocaleString('tr-TR'),item.amount,item.counterparty_name??'',item.reference_number??'',item.description])]);}
  return <main><AdminNav/><section className="finance-workspace"><p>FİNANS / MUTABAKAT</p><h1>Hesap Mutabakat Raporu</h1><p>Hesap hareketleri, dönem giriş-çıkışları ve henüz eşleşmemiş havaleler gerçek kayıtlardan hazırlanır.</p><nav className="finance-nav"><Link href="/finans">Finans Özeti</Link><Link href="/siparisler/havaleler">Bekleyen Havaleler</Link><Link href="/finans/masraflar">Masraflar</Link></nav><section className="form-card dealer-toolbar"><label>Başlangıç Tarihi<input type="date" value={dateFrom} onChange={event=>setDateFrom(event.target.value)}/></label><label>Bitiş Tarihi<input type="date" value={dateTo} onChange={event=>setDateTo(event.target.value)}/></label><div className="button-row"><button onClick={load}>Raporu Getir</button><button className="secondary" disabled={!data} onClick={exportReport}>Excel&apos;e Aktar</button></div></section>{message&&<p role="alert" className="notice">{message}</p>}
    <section className="table-card"><p>Hesap Özeti</p><h2>Hesap Bazlı Mutabakat</h2><div className="table-wrap"><table><thead><tr><th>Hesap</th><th>Hareket</th><th>Dönem Girişi</th><th>Dönem Çıkışı</th><th>Güncel Bakiye</th></tr></thead><tbody>{data?.accounts.map(item=><tr key={item.id}><td><b>{item.name}</b><small>{item.currency} · {item.account_type}</small></td><td>{item.movement_count}</td><td>{money(item.income,item.currency)}</td><td>{money(item.expense,item.currency)}</td><td><b>{money(item.current_balance,item.currency)}</b></td></tr>)}</tbody></table>{data&&!data.accounts.length&&<p>Aktif finans hesabı bulunmuyor.</p>}</div></section>
    <section className="table-card"><p>Tahsilat Kontrolü</p><h2>Eşleşmeyen Havaleler ({data?.unmatchedCollections.length??'—'})</h2><div className="table-wrap"><table><thead><tr><th>Tarih</th><th>Hesap</th><th>Gönderen</th><th>Tutar</th><th>Referans</th><th>Açıklama</th></tr></thead><tbody>{data?.unmatchedCollections.map(item=><tr key={item.id}><td>{new Date(item.occurred_at).toLocaleString('tr-TR')}</td><td>{item.account_name}</td><td>{item.counterparty_name??'Bilinmiyor'}</td><td>{money(item.amount,item.currency)}</td><td>{item.reference_number??'—'}</td><td>{item.description}</td></tr>)}</tbody></table>{data&&!data.unmatchedCollections.length&&<p>Seçilen dönemde eşleşmemiş havale bulunmuyor.</p>}</div></section>
  </section></main>;
}
