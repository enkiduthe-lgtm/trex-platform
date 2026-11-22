'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { useOrderPermissions } from '../../lib/use-order-permissions';
import { createActionLock, createRequestGate } from '../../lib/async-controls';
import { financeDateTime } from '../../lib/finance-report';
import { downloadXlsx } from '../../lib/xlsx';
import styles from './paytr.module.css';

type Receipt={payment_id:string;order_id:string;order_number:string;is_test:boolean;gross_amount:string;commission_rate:string;commission_amount:string;net_amount:string;currency:string;created_at:string};
type Cash={commissionRate:string|number;receipts:Receipt[]};
const validRate=(value:number)=>Number.isFinite(value)&&value>=0&&value<=100&&Number(value.toFixed(2))===value;
const money=(value:string,currency:string)=>Number(value).toLocaleString('tr-TR',{style:'currency',currency});
function validCash(value:Cash){
  if(!value||!['string','number'].includes(typeof value.commissionRate)||String(value.commissionRate).trim()===''||!validRate(Number(value.commissionRate))||!Array.isArray(value.receipts)||value.receipts.length>100)return false;
  if(!value.receipts.every(row=>row&&typeof row.payment_id==='string'&&Boolean(row.payment_id)&&typeof row.order_id==='string'&&typeof row.order_number==='string'&&typeof row.is_test==='boolean'&&/^[A-Z]{3}$/.test(row.currency)&&[row.gross_amount,row.commission_amount,row.net_amount].every(amount=>typeof amount==='string'&&amount.trim()!==''&&Number.isFinite(Number(amount)))&&typeof row.commission_rate==='string'&&row.commission_rate.trim()!==''&&validRate(Number(row.commission_rate))&&typeof row.created_at==='string'&&Number.isFinite(Date.parse(row.created_at))))return false;
  return new Set(value.receipts.map(row=>row.payment_id)).size===value.receipts.length;
}
export default function PaytrCash(){
  const {permissions,loading:accessLoading,error:accessError,refresh:refreshPermissions}=useOrderPermissions();
  const [data,setData]=useState<Cash|null>(null),[rate,setRate]=useState(''),[message,setMessage]=useState(''),[saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[readError,setReadError]=useState(''),[needsCheck,setNeedsCheck]=useState(false),[showTests,setShowTests]=useState(false);
  const alive=useRef(true),gate=useRef(createRequestGate()),actionLock=useRef(createActionLock()),readyRef=useRef(false),baseline=useRef<number|null>(null),draftInitialized=useRef(false),needsCheckRef=useRef(false);
  const dirty=Boolean(data&&rate.trim()!==''&&validRate(Number(rate))&&Number(rate)!==Number(data.commissionRate));
  const shown=data?.receipts.filter(row=>row.is_test===showTests)??[];
  async function load(replaceDraft=false,afterWrite=false){
    if(actionLock.current.isLocked()&&!afterWrite)return false;
    const ticket=gate.current.begin();readyRef.current=false;setReady(false);setLoading(true);setReadError('');
    try{const result=await api<Cash>('/admin/finance/paytr');if(!alive.current||!gate.current.isCurrent(ticket))return false;
      if(!validCash(result))throw new Error('PayTR kayıtları doğrulanamadı.');
      setData(result);baseline.current=Number(result.commissionRate);readyRef.current=true;setReady(true);
      if(replaceDraft||!draftInitialized.current){setRate(String(result.commissionRate));draftInitialized.current=true;}
      if(needsCheckRef.current&&!afterWrite)setMessage('Güncel oran yeniden okundu. Taslağı kayıtlı oranla karşılaştırarak devam edin.');
      needsCheckRef.current=false;setNeedsCheck(false);return true;
    }catch(error){if(alive.current&&gate.current.isCurrent(ticket))setReadError(error instanceof Error?error.message:'PayTR kayıtları yüklenemedi.');return false;}
    finally{if(alive.current&&gate.current.isCurrent(ticket))setLoading(false);}
  }
  useEffect(()=>{alive.current=true;void load(true);return()=>{alive.current=false;readyRef.current=false;gate.current.invalidate();};},[]);
  async function save(event:FormEvent){
    event.preventDefault();if(!alive.current||accessLoading||!permissions.financeEdit||!readyRef.current||baseline.current===null||actionLock.current.isLocked())return;
    const next=Number(rate),expected=baseline.current;if(!rate.trim()||!validRate(next)){setMessage('0–100 arasında ve en fazla iki ondalık haneli bir oran girin.');return;}
    if(next===expected){setMessage('Bu oran zaten kayıtlı.');return;}if(!actionLock.current.acquire())return;
    gate.current.invalidate();setSaving(true);setMessage('');
    try{const result=await api<{commissionRate:number;changed:boolean}>('/admin/finance/paytr/settings',{method:'POST',body:JSON.stringify({commissionRate:next,expectedCommissionRate:expected})});if(!alive.current)return;
      if(!result||!validRate(result.commissionRate)||result.commissionRate!==next||typeof result.changed!=='boolean')throw new Error('Oran değişikliği sonucu doğrulanamadı.');
      baseline.current=result.commissionRate;setRate(String(result.commissionRate));setData(current=>current?{...current,commissionRate:result.commissionRate}:current);needsCheckRef.current=false;setNeedsCheck(false);
      setMessage(result.changed?'Komisyon oranı kaydedildi. Önceki ödeme hareketlerinin tutarları korundu.':'Oran zaten kayıtlıydı. İkinci değişiklik oluşturulmadı.');await load(false,true);
    }catch(error){if(alive.current){readyRef.current=false;setReady(false);needsCheckRef.current=true;setNeedsCheck(true);setMessage((error instanceof Error?error.message:'Oran değişikliği sonucu doğrulanamadı.')+' Yeniden göndermeden önce kayıtlı oranı kontrol edin.');}}
    finally{actionLock.current.release();if(alive.current)setSaving(false);}
  }
  function exportReceipts(){
    if(!data||!ready||loading||saving||!shown.length)return;
    downloadXlsx('trex-paytr-'+(showTests?'test':'gercek')+'.xlsx','PayTR Hareketleri',[
      ['Kayıt Türü',showTests?'Test · Kasa Bakiyesine Dahil Değil':'Gerçek Tahsilat'],['Kapsam','Son 100 ödeme kaydı içindeki seçili tür'],['Yüklenen Tüm Kayıt',data.receipts.length],['Aktarılan Kayıt',shown.length],[],
      ['Sipariş','Brüt Tutar','Komisyon Oranı (%)','Komisyon Tutarı','Net Tutar','Para Birimi','Oluşturulma'],
      ...shown.map(row=>[row.order_number,Number(row.gross_amount),Number(row.commission_rate),Number(row.commission_amount),Number(row.net_amount),row.currency,financeDateTime(row.created_at)]),
    ]);
  }
  return <main><AdminNav/><section className={styles.workspace}>
    <header className={styles.header}><div><Link href='/finans'>Finans Özetine Dön</Link><h1>PayTR Kasası</h1></div><button type='button' className='secondary' disabled={loading||saving} onClick={()=>void load()}>{loading?'Kayıtlar Yükleniyor…':needsCheck?'Kayıtlı Oranı Kontrol Et':'Kayıtları Yenile'}</button></header>
    <p>Buradaki kayıtlar PayTR tahsilatlarını gösterir. Bankaya yapılan aktarım yerine geçmez. Gerçek ve test kayıtları ayrı gösterilir; en son 100 ödeme kaydı yüklenir.</p>
    {accessError&&<div className='notice' role='alert'>{accessError}<button type='button' onClick={()=>void refreshPermissions()}>Yetkileri Yenile</button></div>}
    {message&&<p className='notice' role='status'>{message}</p>}
    {readError&&<p className='notice' role='alert'>{readError} Son alınan kayıtlar korunuyor. Güncel bilgiler doğrulanana kadar oran kaydedilemez veya dışa aktarım yapılamaz.</p>}
    {needsCheck&&<section className='form-card'><h2>Kayıtlı Oranı Doğrulayın</h2><p>Önceki değişikliğin sonucu doğrulanamadı. Taslak oran korunuyor; kayıtlı oranı yeniden okuyarak karşılaştırın.</p><button type='button' disabled={loading||saving} onClick={()=>void load()}>Oranı Yeniden Kontrol Et</button></section>}
    <div className={styles.metrics}><article><p>Yüklenen Gerçek Tahsilat</p><h2>{ready?data?.receipts.filter(row=>!row.is_test).length??0:'—'}</h2></article><article><p>Yüklenen Test Kaydı</p><h2>{ready?data?.receipts.filter(row=>row.is_test).length??0:'—'}</h2></article><article><p>Kayıtlı Komisyon Oranı</p><h2>{ready&&data?'%'+Number(data.commissionRate).toLocaleString('tr-TR'):'—'}</h2></article></div>
    {permissions.financeEdit?<form className='form-card' onSubmit={save}><h2>Komisyon Oranı</h2><fieldset className={styles.fields} disabled={saving||loading||!ready||accessLoading}><label>Yeni Oran (%)<input type='number' required min='0' max='100' step='0.01' value={rate} onChange={event=>setRate(event.target.value)}/></label><p>Yeni oran sonraki ödeme kayıtlarına uygulanır. Önceki hareketlerin oran ve tutarları değişmez.</p>{dirty&&<p className={styles.note}>Formdaki oran kayıtlı orandan farklı. Kayıtlı oran: %{Number(data?.commissionRate).toLocaleString('tr-TR')}.</p>}<div className={styles.actions}><button disabled={!dirty}>Oranı Kaydet</button><button type='button' className='secondary' disabled={!data} onClick={()=>data&&setRate(String(data.commissionRate))}>Kayıtlı Oranı Kullan</button></div></fieldset></form>:<section className='form-card'><h2>Komisyon Bilgisi</h2><p>Oran değişikliği için Finans · Düzenle yetkisi gerekir. Ödeme hareketlerini aşağıdan inceleyebilirsiniz.</p></section>}
    <section className={styles.records}><header><div className={styles.actions}><button type='button' aria-pressed={!showTests} className={!showTests?'':'secondary'} onClick={()=>setShowTests(false)}>Gerçek Tahsilatlar</button><button type='button' aria-pressed={showTests} className={showTests?'':'secondary'} onClick={()=>setShowTests(true)}>Test Kayıtları</button></div><button type='button' className='secondary' disabled={!ready||loading||saving||!shown.length} onClick={exportReceipts}>Görünenleri Excel&apos;e Aktar</button></header>
      <p>{showTests?'Test kayıtları kasa bakiyesine dahil değildir.':'Gerçek ödeme hareketleri gösteriliyor.'} Seçili türde {shown.length} kayıt{!ready&&data?' · Son alınan liste':''}.</p>{data?.receipts.length===100&&<p className='notice'>En son 100 ödeme kaydı yüklendi. Daha eski hareketler bu listede ve aktarımda yer almaz.</p>}
      <div className={styles.tableWrap}><table><thead><tr><th>Sipariş</th><th>Brüt</th><th>Oran</th><th>Komisyon</th><th>Net</th><th>Tarih · Türkiye Saati</th></tr></thead><tbody>{shown.map(row=><tr key={row.payment_id}><td>{permissions.viewOrders?<Link href={'/siparisler/'+row.order_id}>{row.order_number}</Link>:row.order_number}</td><td>{money(row.gross_amount,row.currency)}</td><td>%{Number(row.commission_rate).toLocaleString('tr-TR')}</td><td>{money(row.commission_amount,row.currency)}</td><td>{money(row.net_amount,row.currency)}</td><td>{financeDateTime(row.created_at)}</td></tr>)}</tbody></table></div>
      {!shown.length&&<p className={styles.empty}>{loading?'PayTR kayıtları yükleniyor…':ready?'Yüklenen kayıtlarda seçili türe ait hareket yok.':'PayTR kayıtları henüz doğrulanmadı. Kayıtları yenileyin.'}</p>}
    </section>
  </section></main>;
}
