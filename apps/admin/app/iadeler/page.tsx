"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";
import { downloadXlsx } from '../lib/xlsx';
import { createActionLock, createRequestGate } from '../lib/async-controls';
import { financeDateTime } from '../lib/finance-report';
type Item = { id: string; product_name: string; sku: string; quantity: number };
type ReturnRow = {
  payment_provider: string;
  id: string;
  status: string;
  reason: string;
  requested_at: string;
  order_number: string;
  refundable_amount: string;
  available_refund_amount: string | null;
  currency: string;
  item_count: string;
  items: Item[];
  refund_amount: string | null;
  refund_currency: string | null;
  refund_account_name: string | null;
  last_action: string | null;
  last_action_at: string | null;
  last_action_actor_email: string | null;
};
type Warehouse = { id: string; name: string; code: string };
type Account = {
  id: string;
  name: string;
  currency: string;
};
const labels: Record<string, string> = {
  REQUESTED: "Talep alındı",
  APPROVED: "Onaylandı",
  RECEIVED: "Depoya ulaştı",
  INSPECTED: "İncelendi",
  REFUNDED: "İade ödendi",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal",
};
const money = (v: string, c: string) =>
  Number(v).toLocaleString("tr-TR", { style: "currency", currency: c });
const noActions = { review: false, warehouse: false, refund: false };
type Access = typeof noActions;
export default function Returns() {
  const [rows, setRows] = useState<ReturnRow[]>([]),
    [warehouses, setWarehouses] = useState<Warehouse[]>([]),
    [accounts, setAccounts] = useState<Account[]>([]),
    [message, setMessage] = useState(""),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [dispositions, setDispositions] = useState<Record<string, string>>({}),
    [itemDispositions, setItemDispositions] = useState<Record<string, string>>({}),
    [warehouseIds, setWarehouseIds] = useState<Record<string, string>>({}),
    [refunds, setRefunds] = useState<Record<string, string>>({}),
    [accountIds, setAccountIds] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("ALL");
  const [access, setAccess] = useState<Access>(noActions);
  const [loading, setLoading] = useState(true);
  const [listReady, setListReady] = useState(false);
  const actionLock = useRef(createActionLock());
  const requestGate = useRef(createRequestGate());
  async function load(confirmation = '') {
    const ticket = requestGate.current.begin();
    setLoading(true);
    setListReady(false);
    try {
      const [me, list] = await Promise.allSettled([
        api<{user: {role: string}}>('/auth/me'),
        api<ReturnRow[]>('/returns/admin'),
      ]);
      if (!requestGate.current.isCurrent(ticket)) return;
      if (list.status === 'rejected') throw list.reason;
      setRows(list.value);
      setListReady(true);
      if (me.status === 'rejected') throw me.reason;
      const role = me.value.user.role;
      const profile = role === 'ADMIN'
        ? await api<{configured: boolean; grants: string[] | null}>('/admin/access/me')
        : undefined;
      const mayApprove = role === 'SUPER_ADMIN' || (role === 'ADMIN' &&
        (!profile?.configured || Boolean(profile.grants?.includes('RETURNS.VIEW') && profile.grants.includes('RETURNS.APPROVE'))));
      const canInspect = mayApprove || role === 'WAREHOUSE';
      const canRefund = mayApprove || role === 'FINANCE';
      const [locations, finance] = await Promise.allSettled([
        canInspect ? api<Warehouse[]>('/returns/admin/inspection-warehouses') : Promise.resolve([]),
        canRefund ? api<Account[]>('/returns/admin/refund-accounts') : Promise.resolve([]),
      ]);
      if (!requestGate.current.isCurrent(ticket)) return;
      setAccess({review: mayApprove, warehouse: canInspect, refund: canRefund});
      setWarehouses(locations.status === 'fulfilled' ? locations.value : []);
      setAccounts(finance.status === 'fulfilled' ? finance.value : []);
      setMessage([confirmation, locations.status === 'rejected' ? 'Depolar yüklenemedi.' : '', finance.status === 'rejected' ? 'Finans hesapları yüklenemedi.' : ''].filter(Boolean).join(' '));
    } catch (error) {
      if (!requestGate.current.isCurrent(ticket)) return;
      setAccess(noActions);
      setWarehouses([]);
      setAccounts([]);
      setMessage([confirmation, error instanceof Error ? error.message : 'İade bilgileri yüklenemedi.'].filter(Boolean).join(' '));
    } finally {
      if (requestGate.current.isCurrent(ticket)) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const gate = requestGate.current;
    return () => gate.invalidate();
  }, []);
  const requiresAttention = (row: ReturnRow) =>
    !["REFUNDED", "REJECTED", "CANCELLED"].includes(row.status) &&
    Date.now() - new Date(row.requested_at).getTime() >= 24 * 60 * 60 * 1000;
  const shown = useMemo(
    () =>
      (listReady ? rows : []).filter(
        (row) =>
          (status === "ALL" || (status === "ATTENTION" && requiresAttention(row)) || row.status === status) &&
          [row.order_number, row.reason, labels[row.status]]
            .join(" ")
            .toLocaleLowerCase("tr-TR")
            .includes(query.toLocaleLowerCase("tr-TR")),
      ),
    [rows, query, status, listReady],
  );
  const total = shown
    .filter((row) => row.status === "REFUNDED" && row.currency === "TRY")
    .reduce((sum, row) => sum + Number(row.refund_amount ?? 0), 0);
  const note = (id: string) => notes[id] ?? "";
  const setNote = (id: string, value: string) =>
    setNotes((current) => ({ ...current, [id]: value }));
  function exportReturns() {
    if (!shown.length) { setMessage('Dışa aktarılacak iade bulunamadı.'); return; }
    const rows = [
      ['Sipariş no', 'Durum', 'Neden', 'Ürünler', 'İade tutarı', 'Para birimi', 'Ödenen tutar', 'Ödeme hesabı', 'Talep tarihi'],
      ...shown.map(row => [
        row.order_number,
        labels[row.status] ?? row.status,
        row.reason,
        row.items.map(item => `${item.product_name} × ${item.quantity}`).join(' | '),
        row.refundable_amount,
        row.currency,
        row.refund_amount ?? '',
        row.refund_account_name ?? '',
        financeDateTime(row.requested_at),
      ]),
    ];
    downloadXlsx('trex-iadeler.xlsx', 'İadeler', rows);
  }
  async function act(id: string, action: string, body: unknown = {}) {
    const permitted = action === 'approve' || action === 'reject' ? access.review
      : action === 'refund' ? access.refund : access.warehouse;
    if (!permitted) return;
    if (loading || !listReady || !actionLock.current.acquire()) return;
    setBusy(`${id}:${action}`);
    setMessage("");
    try {
      await api(`/returns/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await load("İade işlemi kaydedildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "İşlem yapılamadı");
    } finally {
      setBusy(null);
      actionLock.current.release();
    }
  }
  const submit = (
    event: FormEvent,
    id: string,
    action: string,
    body: unknown,
  ) => {
    event.preventDefault();
    void act(id, action, body);
  };
  return (
    <main>
      <AdminNav />
      <section>
        <p>SİPARİŞ / İADE VE DEĞİŞİM</p>
        <h1>İade operasyonları</h1>
        <p>
          Akış: talep → onay → depoya kabul → inceleme/stok ayrımı → finans
          iadesi. Her işlem kayıt altına alınır.
        </p>
        {message && <p role="status">{message}</p>}
        <button type="button" className="secondary" disabled={loading || busy !== null} onClick={() => void load()}>İade listesini yenile</button>
        <div className="cards">
          <article>
            <p>AÇIK İADE</p>
            <h2>
              {
                rows.filter(
                  (row) =>
                    !["REFUNDED", "REJECTED", "CANCELLED"].includes(row.status),
                ).length
              }
            </h2>
          </article>
          <article>
            <p>SEÇİLİ İADELER</p>
            <h2>{shown.length}</h2>
          </article>
          <article>
            <p>ÖDENEN TL İADE</p>
            <h2>{money(String(total), "TRY")}</h2>
          </article>
          <article>
            <p>24 SAATİ AŞAN</p>
            <h2>{rows.filter(requiresAttention).length}</h2>
            <p>Öncelikli işlem</p>
          </article>
        </div>
        <div className="period-toolbar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sipariş no veya neden ara"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">Tüm durumlar</option>
            <option value="ATTENTION">24 saati aşan açık iadeler</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="button" disabled={!shown.length} onClick={exportReturns}>Excel&apos;e Aktar</button>
        </div>
        <div className="cards">
          {shown.length ? (
            shown.map((row) => {
              const warehouseId =
                warehouseIds[row.id] ?? warehouses[0]?.id ?? "";
              const disposition = dispositions[row.id] ?? "SELLABLE";
              const itemDisposition = (item: Item) => itemDispositions[`${row.id}:${item.id}`] ?? disposition;
              const financeAccounts = accounts.filter(
                (account) => account.currency === row.currency,
              );
              const accountId =
                accountIds[row.id] ?? financeAccounts[0]?.id ?? "";
              const availableRefund = row.available_refund_amount ?? row.refundable_amount;
              const refund = refunds[row.id] ?? availableRefund;
              const walletRefund = row.payment_provider === "dealer_commission";
              return (
                <article key={row.id}>
                  <p>
                    {labels[row.status] ?? row.status} ·{" "}
                    {financeDateTime(row.requested_at)}
                  </p>
                  <h2>{row.order_number}</h2>
                  <p>
                    {row.items
                      .map((item) => `${item.product_name} × ${item.quantity}`)
                      .join(", ") || `${row.item_count} ürün`}
                  </p>
                  <p>Neden: {row.reason}</p>
                  {row.last_action && <p>Son işlem: {row.last_action} · {row.last_action_actor_email ?? "Sistem"} · {row.last_action_at ? financeDateTime(row.last_action_at) : "—"}</p>}
                  {row.status === "REQUESTED" && access.review && (
                    <form
                      onSubmit={(event) =>
                        submit(event, row.id, "approve", {
                          notes: note(row.id) || undefined,
                        })
                      }
                    >
                      <label>
                        Onay notu
                        <input
                          value={note(row.id)}
                          onChange={(event) =>
                            setNote(row.id, event.target.value)
                          }
                        />
                      </label>
                      <div className="button-row">
                        <button disabled={busy !== null}>İadeyi onayla</button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy !== null}
                          onClick={() =>
                            void act(row.id, "reject", {
                              notes: note(row.id) || undefined,
                            })
                          }
                        >
                          Reddet
                        </button>
                      </div>
                    </form>
                  )}
                  {row.status === "APPROVED" && access.warehouse && (
                    <button
                      disabled={busy !== null}
                      onClick={() =>
                        void act(row.id, "receive", {
                          notes: note(row.id) || undefined,
                        })
                      }
                    >
                      Depoya teslim al
                    </button>
                  )}
                  {row.status === "RECEIVED" && access.warehouse && (
                    <form
                      onSubmit={(event) =>
                        submit(event, row.id, "inspection", {
                          warehouseId,
                          disposition,
                          items: row.items.map((item) => ({ returnItemId:item.id, disposition:itemDisposition(item) })),
                          notes: note(row.id) || undefined,
                        })
                      }
                    >
                      <label>
                        İade deposu
                        <select
                          required
                          value={warehouseId}
                          onChange={(event) =>
                            setWarehouseIds((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Depo seçin</option>
                          {warehouses.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} · {item.code}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Varsayılan stok durumu
                        <select
                          value={disposition}
                          onChange={(event) =>
                            setDispositions((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="SELLABLE">Satılabilir stoğa al</option>
                          <option value="QUARANTINE">Karantinaya al</option>
                          <option value="DAMAGED">Hasarlı olarak ayır</option>
                        </select>
                      </label>
                      <div className="wide">
                        <p>Kalem bazında stok durumu</p>
                        {row.items.map((item) => <label key={item.id}>{item.product_name} × {item.quantity}<select value={itemDisposition(item)} onChange={(event) => setItemDispositions((current) => ({...current,[`${row.id}:${item.id}`]:event.target.value}))}><option value="SELLABLE">Satılabilir stoğa al</option><option value="QUARANTINE">Karantinaya al</option><option value="DAMAGED">Hasarlı olarak ayır</option></select></label>)}
                      </div>
                      <label>
                        İnceleme notu
                        <input
                          value={note(row.id)}
                          onChange={(event) =>
                            setNote(row.id, event.target.value)
                          }
                        />
                      </label>
                      <button disabled={busy !== null || !warehouseId}>
                        İncelemeyi tamamla
                      </button>
                    </form>
                  )}
                  {row.status === "INSPECTED" && Number(availableRefund) <= 0 && (
                    <p role="status">İade edilebilir ödeme bakiyesi bulunamadı.</p>
                  )}
                  {row.status === "INSPECTED" && access.refund && Number(availableRefund) > 0 && (
                    <form
                      onSubmit={(event) =>
                        submit(event, row.id, "refund", {
                          accountId: walletRefund ? undefined : accountId,
                          amount: Number(refund),
                          referenceNumber: note(row.id) || undefined,
                        })
                      }
                    >
                      <p>
                        İade üst sınırı:{" "}
                        {money(availableRefund, row.currency)}
                      </p>
                      {walletRefund ? <p>İade bayinin prim bakiyesine eklenir.</p> : (
                        <label>
                          Çıkış hesabı
                          <select
                            required
                            value={accountId}
                            onChange={(event) =>
                              setAccountIds((current) => ({
                                ...current,
                                [row.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Hesap seçin</option>
                            {financeAccounts.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        İade tutarı
                        <input
                          required
                          min="0.01"
                          max={availableRefund}
                          step="0.01"
                          type="number"
                          value={refund}
                          onChange={(event) =>
                            setRefunds((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Referans / not
                        <input
                          value={note(row.id)}
                          onChange={(event) =>
                            setNote(row.id, event.target.value)
                          }
                        />
                      </label>
                      <button disabled={busy !== null || (!walletRefund && !accountId)}>
                        {walletRefund ? "Prim Bakiyesine Geri Ver" : "Finans İadesini Kaydet"}
                      </button>
                    </form>
                  )}
                  {row.status === "REFUNDED" && (
                    <p>
                      <strong>
                        {row.payment_provider === 'dealer_commission' ? 'Prim Bakiyesi' : row.refund_account_name ?? 'Finans Hesabı'} üzerinden{" "}
                        {money(
                          row.refund_amount ?? "0",
                          row.refund_currency ?? row.currency,
                        )}{" "}
                        iade edildi.
                      </strong>
                    </p>
                  )}
                </article>
              );
            })
          ) : (
            <article>
              <p>{loading ? 'İade listesi yükleniyor…' : listReady ? 'Bu filtrelerde iade bulunamadı.' : 'İade listesi yüklenemedi.'}</p>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
