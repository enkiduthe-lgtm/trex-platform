"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";
import { downloadXlsx } from "../lib/xlsx";
type Account = {
  id: string;
  name: string;
  account_type: string;
  currency: string;
  balance: string;
};
type Transaction = {
  id: string;
  account_name: string;
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
  const load = () =>
    Promise.all([
      api<Account[]>("/admin/finance/accounts"),
      api<Transaction[]>("/admin/finance/transactions"),
      api<Dashboard>("/admin/finance/dashboard"),
    ])
      .then(([a, t, d]) => {
        setAccounts(a);
        setTransactions(t);
        setDashboard(d);
        if (!tx.accountId && a[0]) setTx((x) => ({ ...x, accountId: a[0].id }));
      })
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    void load();
  }, []);
  async function addAccount(e: FormEvent) {
    e.preventDefault();
    try {
      await api(editingAccount?`/admin/finance/accounts/${editingAccount}`:"/admin/finance/accounts", {
        method: editingAccount?"PATCH":"POST",
        body: JSON.stringify(account),
      });
      setAccount({ name: "", accountType: "BANK", currency: "TRY" });
      setEditingAccount(null); setMessage("Hesap kaydedildi.");
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Kaydedilemedi");
    }
  }
  async function addTx(e: FormEvent) {
    e.preventDefault();
    try {
      await api(editingTx?`/admin/finance/transactions/${editingTx}`:"/admin/finance/transactions", {
        method: editingTx?"PATCH":"POST",
        body: JSON.stringify({
          ...tx,
          amount: Number(tx.amount),
          counterpartyName: tx.counterpartyName || undefined,
          referenceNumber: tx.referenceNumber || undefined,
        }),
      });
      setTx((x) => ({
        ...x,
        amount: "",
        description: "",
        counterpartyName: "",
        referenceNumber: "",
      }));
      setEditingTx(null); setMessage("Para hareketi kaydedildi.");
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Kaydedilemedi");
    }
  }
  async function removeAccount(id:string){if(!window.confirm('Bu para hesabı pasife alınacak. Devam edilsin mi?'))return;try{await api(`/admin/finance/accounts/${id}`,{method:'DELETE'});setMessage('Hesap pasife alındı.');void load()}catch(e){setMessage(e instanceof Error?e.message:'Hesap silinemedi')}}
  async function removeTx(id:string){if(!window.confirm('Bu manuel para hareketi silinsin mi?'))return;try{await api(`/admin/finance/transactions/${id}`,{method:'DELETE'});setMessage('Para hareketi silindi.');void load()}catch(e){setMessage(e instanceof Error?e.message:'Para hareketi silinemedi')}}
  async function addTransfer(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/admin/finance/transfers", {
        method: "POST",
        body: JSON.stringify({ ...transfer, amount: Number(transfer.amount) }),
      });
      setTransfer({
        fromAccountId: "",
        toAccountId: "",
        amount: "",
        description: "",
      });
      setMessage("Transfer kaydedildi; gelir/gider sayılmadı.");
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Kaydedilemedi");
    }
  }
  const shownTransactions = transactions.filter((transaction) => {
    const transactionDate = transaction.occurred_at.slice(0, 10);
    return (transactionAccountFilter === "ALL" || transaction.account_name === transactionAccountFilter)
      && (!transactionDateFrom || transactionDate >= transactionDateFrom)
      && (!transactionDateTo || transactionDate <= transactionDateTo);
  });
  function exportTransactions() {
    if (!shownTransactions.length) {
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
        new Date(t.occurred_at).toLocaleString("tr-TR"),
        t.account_name,
        t.currency,
        kinds[t.kind] ?? t.kind,
        t.amount,
        t.counterparty_name ?? "",
        t.description,
      ]),
      ["", "", "", "Toplam", shownTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0).toFixed(2), "", ""],
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
        <div className="split">
          <form className="form-card" onSubmit={addAccount}>
            <h2>{editingAccount?'Para hesabını düzenle':'Yeni hesap'}</h2>
            <label>
              Hesap adı
              <input
                required
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
          </form>
          <form className="form-card" onSubmit={addTransfer}>
            <h2>Hesaplar arası transfer</h2>
            <label>
              Çıkış hesabı
              <select
                required
                value={transfer.fromAccountId}
                onChange={(e) =>
                  setTransfer((x) => ({ ...x, fromAccountId: e.target.value }))
                }
              >
                <option value="">Seçin</option>
                {accounts.map((a) => (
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
                {accounts.map((a) => (
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
          </form>
        </div>
        <form className="form-card" onSubmit={addTx}>
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
                {accounts.map((a) => (
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
        </form>
        {message && <p role="status">{message}</p>}
        <h2>Hesap bakiyeleri</h2>
        <div className="cards">
          {accounts.map((a) => (
            <article key={a.id}>
              <p>{types[a.account_type]}</p>
              <h2>{a.name}</h2>
              <p>{money(a.balance, a.currency)}</p><div className="button-row"><button type="button" className="secondary" onClick={()=>{setEditingAccount(a.id);setAccount({name:a.name,accountType:a.account_type,currency:a.currency})}}>Düzenle</button><button type="button" className="secondary" onClick={()=>void removeAccount(a.id)}>Sil</button></div>
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
            {[...new Set(transactions.map(transaction => transaction.account_name))].map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <label>Başlangıç<input type="date" value={transactionDateFrom} onChange={(event) => setTransactionDateFrom(event.target.value)} /></label>
          <label>Bitiş<input type="date" value={transactionDateTo} onChange={(event) => setTransactionDateTo(event.target.value)} /></label>
          {(transactionDateFrom || transactionDateTo) && <button type="button" className="secondary" onClick={() => { setTransactionDateFrom(""); setTransactionDateTo(""); }}>Tarihi temizle</button>}
          <button
            type="button"
            onClick={exportTransactions}
            disabled={!shownTransactions.length}
          >
            Excel&apos;e Aktar
          </button>
        </div>
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
                {new Date(t.occurred_at).toLocaleDateString("tr-TR")}
              </p><div className="button-row"><button type="button" className="secondary" onClick={()=>{setEditingTx(t.id);setTx({accountId:accounts.find(a=>a.name===t.account_name)?.id??'',kind:t.kind,amount:t.amount,description:t.description,counterpartyName:t.counterparty_name??'',referenceNumber:t.reference_number??'',paymentStatus:t.payment_status??'PAID'})}}>Düzenle</button><button type="button" className="secondary" onClick={()=>void removeTx(t.id)}>Sil</button></div>
            </article>
          ))}
          {!shownTransactions.length && <article><p>Bu hesapta para hareketi yok.</p></article>}
        </div>
      </section>
    </main>
  );
}
