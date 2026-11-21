"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";
import { MetricChart } from '../components/metric-chart';
import { currencyTotals } from "../lib/report-totals";
import { downloadXlsx } from "../lib/xlsx";
import {useOrderPermissions} from '../lib/use-order-permissions';
import {useFinanceSubmission,validFinanceAmount} from '../lib/use-finance-submission';
import {createRequestGate} from '../lib/async-controls';
import {financeDateTime} from '../lib/finance-report';
import {financeMovementAccounts,matchesFinanceMovement} from '../lib/finance-workspace';
type Account = {
  id: string;
  name: string;
  account_type: string;
  currency: string;
  balance: string;
  is_active:boolean;
};
type Transaction = {
  id: string;
  account_name: string;
  account_id:string;
  can_edit:boolean;
  currency: string;
  kind: string;
  amount: string;
  description: string;
  counterparty_name: string | null;
  reference_number: string | null;
  payment_status: string | null;
  occurred_at: string;
};
type Dashboard = {
  income: string;
  expense: string;
  net: string;
  pending_collection: string;
};
const money = (v: string, currency = "TRY") =>
  Number(v || 0).toLocaleString("tr-TR", { style: "currency", currency });
const types: Record<string, string> = {
  BANK: "Banka hesabı",
  CASH: "Nakit kasa",
  MARKETPLACE: "Pazar yeri",
  COD_PENDING: "Kapıda ödeme",
  FOREIGN_CURRENCY: "Döviz",
};
const kinds: Record<string, string> = {
  INCOME: "Gelir",
  EXPENSE: "Masraf",
  COLLECTION: "Tahsilat",
  REFUND: "İade",
  COMMISSION: "Komisyon",
  PRIME_EXPENSE: "Prim gideri",
  MANUAL: "Manuel",
  TRANSFER_IN: "Transfer giriş",
  TRANSFER_OUT: "Transfer çıkış",
};
export default function Finance() {
  const {permissions,loading:accessLoading,error:accessError,refresh:refreshPermissions}=useOrderPermissions();
  const transactionSubmission=useFinanceSubmission(),transferSubmission=useFinanceSubmission('/admin/finance/transfers/idempotent','transferGroupId');
  const actionLock=useRef(false),loadGate=useRef(createRequestGate()),alive=useRef(true);
  const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[accountsReady,setAccountsReady]=useState(false),[transactionsReady,setTransactionsReady]=useState(false),[loadError,setLoadError]=useState(''),[busy,setBusy]=useState('');
  const unresolved=!!(transactionSubmission.pending||transferSubmission.pending);
  const controlsDisabled=loading||!ready||accessLoading||!!busy||unresolved;
  const [chartCurrency,setChartCurrency]=useState('TRY');
  const [accounts, setAccounts] = useState<Account[]>([]),
    [transactions, setTransactions] = useState<Transaction[]>([]),
    [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [message, setMessage] = useState(""), [editingAccount,setEditingAccount]=useState<string|null>(null), [editingTx,setEditingTx]=useState<string|null>(null);
  const [transactionAccountFilter, setTransactionAccountFilter] = useState("ALL");
  const [transactionDateFrom, setTransactionDateFrom] = useState("");
  const [transactionDateTo, setTransactionDateTo] = useState("");
  const [account, setAccount] = useState({
      name: "",
      accountType: "BANK",
      currency: "TRY",
    }),
    [tx, setTx] = useState({
      accountId: "",
      kind: "COLLECTION",
      amount: "",
      description: "",
      counterpartyName: "",
      referenceNumber: "",
      paymentStatus: "PAID",
    }),
    [transfer, setTransfer] = useState({
      fromAccountId: "",
      toAccountId: "",
      amount: "",
      description: "",
    });
  const load = async () => {
    const ticket=loadGate.current.begin();setLoading(true);setReady(false);setAccountsReady(false);setTransactionsReady(false);setLoadError('');
    const results=await Promise.allSettled([
      api<Account[]>("/admin/finance/accounts"),
      api<Transaction[]>("/admin/finance/transactions"),
      api<Dashboard>("/admin/finance/dashboard"),
    ]);
    if(!alive.current||!loadGate.current.isCurrent(ticket))return;
    const [accountRows,movements,summary]=results;
    if(accountRows.status==='fulfilled')setAccounts(accountRows.value);
    if(movements.status==='fulfilled')setTransactions(movements.value);
    setAccountsReady(accountRows.status==='fulfilled');setTransactionsReady(movements.status==='fulfilled');
    setDashboard(summary.status==='fulfilled'?summary.value:null);
    setReady(accountRows.status==='fulfilled'&&movements.status==='fulfilled');
    setLoadError(results.flatMap((result,index)=>result.status==='rejected'?[['Hesaplar','Para hareketleri','Finans özeti'][index]]:[]).join(', '));setLoading(false);
  };
  useEffect(() => {
    alive.current=true;void load();return()=>{alive.current=false;loadGate.current.invalidate();};
  }, []);
  async function runOperation(name:string,work:()=>Promise<string>,recovery=false){
    if(!alive.current||actionLock.current||loading||accessLoading||!recovery&&(!ready||unresolved))return false;
    actionLock.current=true;loadGate.current.invalidate();setBusy(name);setMessage('');
    try{const confirmation=await work();if(!alive.current)return false;setMessage(confirmation);await load();return true;}
    catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'İşlem tamamlanamadı.');return false;}
    finally{actionLock.current=false;if(alive.current)setBusy('');}
  }
  async function addAccount(event:FormEvent){
    event.preventDefault();if(!(editingAccount?permissions.financeEdit:permissions.financeCreate)||!account.name.trim())return;
    const saved=await runOperation('account',async()=>{
      await api(editingAccount?`/admin/finance/accounts/${editingAccount}`:'/admin/finance/accounts',{method:editingAccount?'PATCH':'POST',body:JSON.stringify({...account,name:account.name.trim()})});
      return 'Hesap kaydedildi.';
    });
    if(saved&&alive.current){setAccount({name:'',accountType:'BANK',currency:'TRY'});setEditingAccount(null);}
  }
  function resetTransactionForm(){setTx(current=>({...current,amount:'',description:'',counterpartyName:'',referenceNumber:''}));setEditingTx(null);}
  async function addTx(event:FormEvent){
    event.preventDefault();if(!(editingTx?permissions.financeEdit:permissions.financeCreate)||controlsDisabled)return;
    if(editingTx&&!transactions.some(row=>row.id===editingTx&&row.can_edit)){setMessage('Bu para hareketi bağlı bir kayıttır; manuel değiştirilemez.');return;}
    if(!accounts.some(row=>row.id===tx.accountId&&row.is_active)||!validFinanceAmount(tx.amount)||!tx.description.trim()){setMessage('Aktif hesabı, geçerli tutarı ve açıklamayı girin.');return;}
    const body=JSON.stringify({...tx,amount:Number(tx.amount),description:tx.description.trim(),counterpartyName:tx.counterpartyName.trim()||undefined,referenceNumber:tx.referenceNumber.trim()||undefined});
    const saved=await runOperation('transaction',async()=>{
      if(editingTx){await api(`/admin/finance/transactions/${editingTx}`,{method:'PATCH',body});return 'Para hareketi güncellendi.';}
      const result=await transactionSubmission.send(body);return result.replayed?'Önceki para hareketi doğrulandı. Yeni kayıt oluşturulmadı.':'Para hareketi kaydedildi.';
    });
    if(saved&&alive.current)resetTransactionForm();
  }
  async function retryTransaction(){
    if(!permissions.financeCreate||!transactionSubmission.pending)return;
    const saved=await runOperation('transaction',async()=>{const result=await transactionSubmission.retry();return result.replayed?'Önceki para hareketi doğrulandı. Yeni kayıt oluşturulmadı.':'Para hareketi kaydedildi.';},true);
    if(saved&&alive.current)resetTransactionForm();
  }
  async function removeAccount(id:string){
    if(controlsDisabled||!permissions.financeDelete||!accounts.some(row=>row.id===id&&row.is_active)||!window.confirm('Bu para hesabı pasife alınacak. Devam edilsin mi?'))return;
    await runOperation('remove-account',async()=>{await api(`/admin/finance/accounts/${id}`,{method:'DELETE'});return 'Hesap pasife alındı. Geçmiş hareketleri korunur.';});
  }
  async function removeTx(id:string){
    if(controlsDisabled||!permissions.financeDelete||!transactions.some(row=>row.id===id&&row.can_edit)||!window.confirm('Bu manuel para hareketi silinsin mi?'))return;
    await runOperation('remove-transaction',async()=>{await api(`/admin/finance/transactions/${id}`,{method:'DELETE'});return 'Para hareketi silindi.';});
  }
  async function addTransfer(event:FormEvent){
    event.preventDefault();if(controlsDisabled||!permissions.financeApprove)return;
    const from=accounts.find(row=>row.id===transfer.fromAccountId&&row.is_active),to=accounts.find(row=>row.id===transfer.toAccountId&&row.is_active);
    if(!from||!to||from.id===to.id||from.currency!==to.currency||!validFinanceAmount(transfer.amount)||!transfer.description.trim()){setMessage('Aynı para biriminde iki farklı aktif hesap, geçerli tutar ve açıklama seçin.');return;}
    const body=JSON.stringify({...transfer,amount:Number(transfer.amount),description:transfer.description.trim()});
    const saved=await runOperation('transfer',async()=>{const result=await transferSubmission.send(body);return result.replayed?'Önceki transfer doğrulandı. Yeni hesap hareketi oluşturulmadı.':'Transfer kaydedildi; gelir/gider sayılmadı.';});
    if(saved&&alive.current)setTransfer({fromAccountId:'',toAccountId:'',amount:'',description:''});
  }
  async function retryTransfer(){
    if(!permissions.financeApprove||!transferSubmission.pending)return;
    const saved=await runOperation('transfer',async()=>{const result=await transferSubmission.retry();return result.replayed?'Önceki transfer doğrulandı. Yeni hesap hareketi oluşturulmadı.':'Transfer kaydedildi; gelir/gider sayılmadı.';},true);
    if(saved&&alive.current)setTransfer({fromAccountId:'',toAccountId:'',amount:'',description:''});
  }
  function editAccount(row:Account){
    if(controlsDisabled||actionLock.current||!permissions.financeEdit)return;
    setEditingAccount(row.id);setAccount({name:row.name,accountType:row.account_type,currency:row.currency});
    requestAnimationFrame(()=>document.getElementById('finance-account-form')?.scrollIntoView({behavior:'smooth',block:'center'}));
  }
  function editTransaction(row:Transaction){
    if(controlsDisabled||actionLock.current||!permissions.financeEdit||!row.can_edit)return;
    setEditingTx(row.id);setTx({accountId:row.account_id,kind:row.kind,amount:row.amount,description:row.description,counterpartyName:row.counterparty_name??'',referenceNumber:row.reference_number??'',paymentStatus:row.payment_status??'PAID'});
    requestAnimationFrame(()=>document.getElementById('finance-transaction-form')?.scrollIntoView({behavior:'smooth',block:'center'}));
  }
  const shownTransactions = transactions.filter(transaction=>matchesFinanceMovement(transaction,transactionAccountFilter,transactionDateFrom,transactionDateTo));
  const activeAccounts=accounts.filter(row=>row.is_active);
  function exportTransactions() {
    if (loading||!transactionsReady||!shownTransactions.length) {
      setMessage("Dışa aktarılacak para hareketi bulunamadı.");
      return;
    }
    const rows = [
      [
        "Tarih",
        "Hesap",
        "Para birimi",
        "İşlem türü",
        "Tutar",
        "Karşı taraf",
        "Açıklama",
      ],
      ...shownTransactions.map((t) => [
        financeDateTime(t.occurred_at),
        t.account_name,
        t.currency,
        kinds[t.kind] ?? t.kind,
        Number(t.amount),
        t.counterparty_name ?? "",
        t.description,
      ]),
      ...currencyTotals(shownTransactions).map(total => ["", "", total.currency, "Toplam", total.amount, "", ""]),
    ];
    downloadXlsx("trex-finans-hareketleri.xlsx", "Para Hareketleri", rows);
  }
  return (
    <main>
      <AdminNav />
      <section className="finance-workspace">
        <p>FİNANS VE TAHSİLAT</p>
        <h1>Hesap bazlı finans</h1>
        <nav className="finance-nav" aria-label="Finans bölümleri">
          <Link href="/finans">Finans özeti</Link>
          <Link href="/siparisler/havaleler">Bekleyen havaleler</Link>
          <Link href="/finans/masraflar">Masraflar</Link>
          <Link href="/cari">Cari hesaplar</Link>
        </nav>
        <p>
          <Link href="/finans/paytr">PayTR Kasası ve komisyon ayarı →</Link>
        </p>
        <p>
          Özet kartları yalnız TL hesaplarını içerir. Euro ve dolar bakiyeleri
          hesap bazında ayrı gösterilir.
        </p>
        <div className="button-row"><button type="button" disabled={loading||!!busy} onClick={()=>void load()}>{loading?'Finans Bilgileri Yükleniyor…':'Finans Bilgilerini Yenile'}</button></div>
        {accessError&&<div role="alert" className="notice"><p>{accessError}</p><button type="button" onClick={()=>void refreshPermissions()}>İşlem Yetkilerini Yenile</button></div>}
        {loadError&&<p role="alert" className="notice">{loadError} yüklenemedi. Alınabilen kayıtlar gösteriliyor. Hesap veya hareket listesi doğrulanamadıysa işlemler kapalıdır; Finans Bilgilerini Yenile düğmesini kullanın.</p>}
        {transactionSubmission.pending&&<section className="form-card" role="status"><h2>Para hareketinin sonucunu kontrol edin</h2><p>Kayıt kaydedilmiş olabilir. Bu ekranı kapatmadan aynı işlemi doğrulayın; sonuç belli olana kadar yeni girişler kapalıdır.</p><button type="button" disabled={!!busy||loading||accessLoading||!permissions.financeCreate} onClick={()=>void retryTransaction()}>Para Hareketini Doğrula / Yeniden Dene</button></section>}
        {transferSubmission.pending&&<section className="form-card" role="status"><h2>Transferin sonucunu kontrol edin</h2><p>Transfer kaydedilmiş olabilir. Aynı transferi doğrulayın; yeni bir transfer oluşturmayın.</p><button type="button" disabled={!!busy||loading||accessLoading||!permissions.financeApprove} onClick={()=>void retryTransfer()}>Transferi Doğrula / Yeniden Dene</button></section>}
        {dashboard && (
          <div className="cards">
            <article>
              <p>BUGÜN GİRİŞ</p>
              <h2>{money(dashboard.income)}</h2>
            </article>
            <article>
              <p>BUGÜN ÇIKIŞ</p>
              <h2>{money(dashboard.expense)}</h2>
            </article>
            <article>
              <p>NET NAKİT</p>
              <h2>{money(dashboard.net)}</h2>
            </article>
            <article>
              <p>BEKLEYEN TAHSİLAT</p>
              <h2>{money(dashboard.pending_collection)}</h2>
            </article>
          </div>
        )}
        <div className="chart-controls"><label>Grafik Para Birimi<select value={chartCurrency} onChange={e=>setChartCurrency(e.target.value)}>{[...new Set(['TRY',...accounts.map(row=>row.currency)])].map(c=><option key={c} value={c}>{c}</option>)}</select></label></div>
        <div className="analytics-grid"><MetricChart loading={loading&&!accountsReady} unavailable={!loading&&!accountsReady} title="Hesap Bakiyeleri" description="Tüm Dönemler · Bakiye Büyüklüğüne Göre İlk 8 Hesap" currency={chartCurrency} data={accounts.filter(row=>row.currency===chartCurrency).sort((a,b)=>Math.abs(Number(b.balance))-Math.abs(Number(a.balance))).slice(0,8).map(row=>({label:row.name,value:Number(row.balance)}))}/><MetricChart loading={loading&&!transactionsReady} unavailable={!loading&&!transactionsReady} title="Para Hareketlerinin Dağılımı" description="Seçili Para Birimi · Tarih Ve Hesap Filtresindeki İşlem Adetleri" variant="ring" data={Object.entries(shownTransactions.filter(row=>row.currency===chartCurrency).reduce<Record<string,number>>((map,row)=>{const key=kinds[row.kind]??row.kind;map[key]=(map[key]??0)+1;return map;},{})).map(([label,value])=>({label,value}))}/></div>
        <div className="split">
          {(permissions.financeCreate||Boolean(editingAccount)&&permissions.financeEdit)&&<form id="finance-account-form" className="form-card" onSubmit={addAccount}><fieldset className="finance-entry-fields" disabled={controlsDisabled}>
            <h2>{editingAccount?'Para hesabını düzenle':'Yeni hesap'}</h2>
            <label>
              Hesap adı
              <input
                required
                maxLength={120}
                value={account.name}
                placeholder="Şirket Hesabı 1"
                onChange={(e) =>
                  setAccount((x) => ({ ...x, name: e.target.value }))
                }
              />
            </label>
            <label>
              Tür
              <select
                value={account.accountType}
                onChange={(e) =>
                  setAccount((x) => ({ ...x, accountType: e.target.value }))
                }
              >
                {Object.entries(types).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Para birimi
              <select
                disabled={!!editingAccount&&transactions.some(row=>row.account_id===editingAccount)}
                value={account.currency}
                onChange={(e) =>
                  setAccount((x) => ({ ...x, currency: e.target.value }))
                }
              >
                <option value="TRY">TL</option>
                <option value="EUR">Euro (EUR)</option>
                <option value="USD">Dolar (USD)</option>
              </select>
            </label>
            <button>{editingAccount?'Hesabı güncelle':'Hesabı oluştur'}</button>{editingAccount&&<button type="button" className="secondary" onClick={()=>{setEditingAccount(null);setAccount({name:'',accountType:'BANK',currency:'TRY'})}}>Vazgeç</button>}
          </fieldset></form>}
          {permissions.financeApprove&&<form className="form-card" onSubmit={addTransfer}><fieldset className="finance-entry-fields" disabled={controlsDisabled}>
            <h2>Hesaplar arası transfer</h2>
            <label>
              Çıkış hesabı
              <select
                required
                value={transfer.fromAccountId}
                onChange={(e) =>
                  setTransfer((x) => ({ ...x, fromAccountId: e.target.value,toAccountId:'' }))
                }
              >
                <option value="">Seçin</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Giriş hesabı
              <select
                required
                value={transfer.toAccountId}
                onChange={(e) =>
                  setTransfer((x) => ({ ...x, toAccountId: e.target.value }))
                }
              >
                <option value="">Seçin</option>
                {activeAccounts.filter(row=>row.id!==transfer.fromAccountId&&(!transfer.fromAccountId||row.currency===activeAccounts.find(source=>source.id===transfer.fromAccountId)?.currency)).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tutar (
              {accounts.find((a) => a.id === transfer.fromAccountId)
                ?.currency ?? "hesap para birimi"}
              )
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={transfer.amount}
                onChange={(e) =>
                  setTransfer((x) => ({ ...x, amount: e.target.value }))
                }
              />
            </label>
            <label>
              Açıklama
              <input
                required
                value={transfer.description}
                onChange={(e) =>
                  setTransfer((x) => ({ ...x, description: e.target.value }))
                }
              />
            </label>
            <button>Transferi kaydet</button>
          </fieldset></form>}
        </div>
        {(permissions.financeCreate||Boolean(editingTx)&&permissions.financeEdit)&&<form id="finance-transaction-form" className="form-card" onSubmit={addTx}><fieldset className="finance-entry-fields" disabled={controlsDisabled}>
          <h2>{editingTx?'Para hareketini düzenle':'Para hareketi ekle'}</h2>
          <div className="form-grid">
            <label>
              Hesap
              <select
                required
                value={tx.accountId}
                onChange={(e) =>
                  setTx((x) => ({ ...x, accountId: e.target.value }))
                }
              >
                <option value="">Seçin</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
              </select>
            </label>
            <label>
              İşlem türü
              <select
                value={tx.kind}
                onChange={(e) => setTx((x) => ({ ...x, kind: e.target.value }))}
              >
                {Object.entries(kinds)
                  .filter(([k]) => !k.startsWith("TRANSFER"))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tutar (
              {accounts.find((a) => a.id === tx.accountId)?.currency ??
                "hesap para birimi"}
              )
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={tx.amount}
                onChange={(e) =>
                  setTx((x) => ({ ...x, amount: e.target.value }))
                }
              />
            </label>
            <label>
              Ödeme durumu
              <select
                value={tx.paymentStatus}
                onChange={(e) =>
                  setTx((x) => ({ ...x, paymentStatus: e.target.value }))
                }
              >
                <option value="PAID">Ödendi</option>
                <option value="PENDING">Ödeme bekleniyor</option>
                <option value="PARTIALLY_PAID">Kısmi ödendi</option>
                <option value="COLLECTION_PENDING">Tahsilat bekleniyor</option>
                <option value="OVERDUE">Gecikmiş</option>
                <option value="REFUNDED">İade edildi</option>
              </select>
            </label>
            <label>
              Gönderen / alıcı
              <input
                value={tx.counterpartyName}
                onChange={(e) =>
                  setTx((x) => ({ ...x, counterpartyName: e.target.value }))
                }
              />
            </label>
            <label>
              Dekont / referans no
              <input
                value={tx.referenceNumber}
                onChange={(e) =>
                  setTx((x) => ({ ...x, referenceNumber: e.target.value }))
                }
              />
            </label>
            <label className="wide">
              Açıklama
              <textarea
                required
                value={tx.description}
                onChange={(e) =>
                  setTx((x) => ({ ...x, description: e.target.value }))
                }
              />
            </label>
          </div>
          <button>{editingTx?'Hareketi güncelle':'Hareketi kaydet'}</button>{editingTx&&<button type="button" className="secondary" onClick={()=>setEditingTx(null)}>Vazgeç</button>}
        </fieldset></form>}
        {message && <p role="status">{message}</p>}
        <h2>Hesap bakiyeleri</h2>
        <div className="cards">
          {accounts.map((a) => (
            <article key={a.id}>
              <p>{types[a.account_type]}</p>
              <h2>{a.name}</h2>
              <p>{money(a.balance, a.currency)}</p><small>{a.is_active?'Aktif Hesap':'Pasif Hesap · Geçmiş Hareketler Korunur'}</small><div className="button-row">{permissions.financeEdit&&<button type="button" className="secondary" disabled={controlsDisabled} onClick={()=>editAccount(a)}>Düzenle</button>}{permissions.financeDelete&&a.is_active&&<button type="button" className="secondary" disabled={controlsDisabled} onClick={()=>void removeAccount(a.id)}>Pasife Al</button>}</div>
            </article>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <h2>Son para hareketleri</h2>
          <select value={transactionAccountFilter} onChange={(event) => setTransactionAccountFilter(event.target.value)} aria-label="Finans hesabı filtresi">
            <option value="ALL">Tüm hesaplar</option>
            {financeMovementAccounts(transactions).map(row=><option key={row.id} value={row.id}>{row.name} · {row.currency}</option>)}
          </select>
          <label>Başlangıç<input type="date" value={transactionDateFrom} onChange={(event) => setTransactionDateFrom(event.target.value)} /></label>
          <label>Bitiş<input type="date" value={transactionDateTo} onChange={(event) => setTransactionDateTo(event.target.value)} /></label>
          {(transactionDateFrom || transactionDateTo) && <button type="button" className="secondary" onClick={() => { setTransactionDateFrom(""); setTransactionDateTo(""); }}>Tarihi temizle</button>}
          <button
            type="button"
            onClick={exportTransactions}
            disabled={loading||!transactionsReady||!shownTransactions.length}
          >
            Excel&apos;e Aktar
          </button>
        </div>
        {transactionDateFrom&&transactionDateTo&&transactionDateFrom>transactionDateTo&&<p role="alert">Başlangıç tarihi bitiş tarihinden sonra olamaz.</p>}
        <div className="cards finance-transactions">
          {shownTransactions.map((t) => (
            <article key={t.id}>
              <p>
                {kinds[t.kind] ?? t.kind} · {t.account_name}
              </p>
              <h2>{money(t.amount, t.currency)}</h2>
              <p>{t.description}</p>
              <p>
                {t.counterparty_name ?? "—"} ·{" "}
                {financeDateTime(t.occurred_at)}
              </p>{t.can_edit?<div className="button-row">{permissions.financeEdit&&<button type="button" className="secondary" disabled={controlsDisabled} onClick={()=>editTransaction(t)}>Düzenle</button>}{permissions.financeDelete&&<button type="button" className="secondary" disabled={controlsDisabled} onClick={()=>void removeTx(t.id)}>Sil</button>}</div>:<small>Bağlı kayıt · Manuel değiştirilemez</small>}
            </article>
          ))}
          {!shownTransactions.length && <article><p>{loading?'Para hareketleri yükleniyor…':!transactionsReady?'Para hareketleri alınamadı. Kayıtları yenileyin.':'Bu filtrede para hareketi yok.'}</p></article>}
        </div>
      </section>
    </main>
  );
}
