'use client';
import Link from 'next/link';
import {FormEvent,useEffect,useState} from 'react';
import {AdminNav} from '../../components/admin-nav';
import {api} from '../../lib/api';
type Receipt={payment_id:string;order_id:string;order_number:string;is_test:boolean;gross_amount:string;commission_rate:string;commission_amount:string;net_amount:string;currency:string;created_at:string};
type Cash={commissionRate:string;receipts:Receipt[]};
const money=(v:string,c:string)=>Number(v).toLocaleString('tr-TR',{style:'currency',currency:c});
export default function PaytrCash(){
 const [data,setData]=useState<Cash|null>(null),[rate,setRate]=useState('3.69'),[message,setMessage]=useState(''),[saving,setSaving]=useState(false);
 const load=()=>api<Cash>('/admin/finance/paytr').then(d=>{setData(d);setRate(String(d.commissionRate))}).catch(e=>setMessage(e.message));
 useEffect(()=>{void load()},[]);
 async function save(e:FormEvent){e.preventDefault();setSaving(true);try{await api('/admin/finance/paytr/settings',{method:'POST',body:JSON.stringify({commissionRate:Number(rate)})});setMessage('Komisyon oranı güncellendi. Önceki hareketler değişmedi.');await load()}catch(e){setMessage(e instanceof Error?e.message:'Kaydedilemedi')}finally{setSaving(false)}}
 return <main><AdminNav/><section><Link href="/finans">← Finans özeti</Link><h1>PayTR Kasası</h1><p>Gerçek ödemeler brüt tahsilat ve komisyon kesintisi olarak kasaya işlenir. Net bakiye Finans ekranındaki PayTR Kasası kartındadır. Bu, bankaya aktarım değil PayTR hesabındaki tahsilat kaydıdır.</p><form className="form-card" onSubmit={save}><h2>Komisyon ayarı</h2><label>Komisyon oranı (%)<input type="number" required min="0" max="100" step="0.01" value={rate} onChange={e=>setRate(e.target.value)}/></label><p>Yeni oran yalnızca bundan sonra kaydedilen ödemelere uygulanır. Tutarlar kuruşa yuvarlanır.</p><button disabled={saving||!data}>Oranı kaydet</button></form>{message&&<p role="status">{message}</p>}{!data&&!message&&<p>Yükleniyor…</p>}{[false,true].map(test=><section key={String(test)}><h2>{test?'Test hareketleri — kasa bakiyesine dahil değil':'Gerçek ödeme hareketleri'}</h2><div style={{overflowX:'auto'}}><table><thead><tr><th>Sipariş</th><th>Brüt</th><th>Oran</th><th>Komisyon</th><th>Net</th><th>Tarih</th></tr></thead><tbody>{data?.receipts.filter(r=>r.is_test===test).map(r=><tr key={r.payment_id}><td><Link href={`/siparisler/${r.order_id}`}>{r.order_number}</Link></td><td>{money(r.gross_amount,r.currency)}</td><td>%{r.commission_rate}</td><td>{money(r.commission_amount,r.currency)}</td><td>{money(r.net_amount,r.currency)}</td><td>{new Date(r.created_at).toLocaleString('tr-TR')}</td></tr>)}</tbody></table></div>{data&&!data.receipts.some(r=>r.is_test===test)&&<p>Hareket yok.</p>}</section>)}</section></main>
}
