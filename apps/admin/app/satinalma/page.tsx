"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";
type Supplier = {
  id: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
};
type Warehouse = { id: string; name: string; code: string };
type Product = { id: string; name: string; sku: string };
type Item = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: string;
};
type Order = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  expected_at: string | null;
  supplier_name: string;
  warehouse_name: string;
  total_cost: string;
  items: Item[];
};
type Options = {
  suppliers: Supplier[];
  warehouses: Warehouse[];
  products: Product[];
};
type SupplierPerformance=Supplier&{order_count:string;open_order_count:string;overdue_order_count:string;received_order_count:string;last_received_at:string|null};
const money = (n: string, c: string) =>
  Number(n || 0).toLocaleString("tr-TR", { style: "currency", currency: c });
const csv = (value: string) => `"${value.replaceAll('"', '""')}"`;
export default function Purchasing() {
  const [options, setOptions] = useState<Options>({
      suppliers: [],
      warehouses: [],
      products: [],
    }),
    [orders, setOrders] = useState<Order[]>([]),
    [supplierPerformance,setSupplierPerformance]=useState<SupplierPerformance[]>([]),
    [message, setMessage] = useState(""),
    [supplier, setSupplier] = useState({
      name: "",
      contactName: "",
      phone: "",
      email: "",
    }),
    [supplierEdit, setSupplierEdit] = useState({
      id: "",
      name: "",
      contactName: "",
      phone: "",
      email: "",
    }),
    [form, setForm] = useState({
      supplierId: "",
      warehouseId: "",
      currency: "TRY",
      expectedAt: "",
      note: "",
      items: [{ productId: "", quantity: "1", unitCost: "" }],
    }),
    [receipt, setReceipt] = useState({
      orderId: "",
      itemId: "",
      quantity: "1",
      lotCode: "",
      expiryDate: "",
      locationCode: "",
    });
  const overdueOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.expected_at &&
          (() => {
            const dueAt = new Date(order.expected_at);
            dueAt.setHours(23, 59, 59, 999);
            return dueAt.getTime() < Date.now();
          })() &&
          ["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status),
      ),
    [orders],
  );
  const load = () =>
    Promise.all([
      api<Options>("/admin/purchasing/options"),
      api<Order[]>("/admin/purchasing/orders"),
      api<SupplierPerformance[]>("/admin/purchasing/suppliers/performance"),
    ])
      .then(([o, p, performance]) => {
        setOptions(o);
        setOrders(p);
        setSupplierPerformance(performance);
      })
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const productId = query.get("productId"),
      warehouseId = query.get("warehouseId"),
      quantity = query.get("quantity"),
      unitCost = query.get("unitCost"),
      currency = query.get("currency"),
      supplierId = query.get("supplierId");
    if (!productId) return;
    setForm((current) => ({
      ...current,
      supplierId: supplierId ?? current.supplierId,
      warehouseId: warehouseId ?? current.warehouseId,
      currency:
        currency === "EUR" || currency === "USD" || currency === "TRY"
          ? currency
          : current.currency,
      note: "Stok önerisinden oluşturuldu.",
      items: [
        {
          productId,
          quantity: quantity && Number(quantity) > 0 ? quantity : "1",
          unitCost: unitCost ?? "",
        },
      ],
    }));
    setMessage(
      "Stok önerisi satın alma taslağına aktarıldı. Tedarikçiyi kontrol edip siparişi oluşturun.",
    );
  }, []);
  const receiveOrder = useMemo(
    () => orders.find((x) => x.id === receipt.orderId),
    [orders, receipt.orderId],
  );
  const setItem = (index: number, key: string, value: string) =>
    setForm((x) => ({
      ...x,
      items: x.items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    }));
  async function createSupplier(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/admin/purchasing/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: supplier.name,
          contactName: supplier.contactName || undefined,
          phone: supplier.phone || undefined,
          email: supplier.email || undefined,
        }),
      });
      setSupplier({ name: "", contactName: "", phone: "", email: "" });
      setMessage("Tedarikçi eklendi.");
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Kaydedilemedi");
    }
  }
  async function createOrder(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/admin/purchasing/orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          expectedAt: form.expectedAt || undefined,
          note: form.note || undefined,
          items: form.items.map((x) => ({
            productId: x.productId,
            quantity: Number(x.quantity),
            unitCost: Number(x.unitCost),
          })),
        }),
      });
      setMessage(
        "Taslak satın alma siparişi oluşturuldu. Onaylayınca teslim almaya açılır.",
      );
      setForm((x) => ({
        ...x,
        note: "",
        items: [{ productId: "", quantity: "1", unitCost: "" }],
      }));
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sipariş oluşturulamadı");
    }
  }
  function chooseSupplier(id: string) {
    const selected = options.suppliers.find((supplier) => supplier.id === id);
    setSupplierEdit({
      id,
      name: selected?.name ?? "",
      contactName: selected?.contact_name ?? "",
      phone: selected?.phone ?? "",
      email: selected?.email ?? "",
    });
  }
  async function updateSupplier(e: FormEvent) {
    e.preventDefault();
    if (!supplierEdit.id) return;
    try {
      await api(`/admin/purchasing/suppliers/${supplierEdit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: supplierEdit.name,
          contactName: supplierEdit.contactName || undefined,
          phone: supplierEdit.phone || undefined,
          email: supplierEdit.email || undefined,
        }),
      });
      setMessage("Tedarikçi iletişim bilgileri güncellendi.");
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Tedarikçi güncellenemedi");
    }
  }
  async function markOrdered(id: string) {
    try {
      await api(`/admin/purchasing/orders/${id}/order`, { method: "POST" });
      setMessage("Satın alma siparişi onaylandı.");
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Onaylanamadı");
    }
  }
  async function cancelOrder(id: string) {
    if (!window.confirm("Bu satın alma siparişi iptal edilsin mi? Teslim alınmış kalem varsa işlem engellenir.")) return;
    try {
      await api(`/admin/purchasing/orders/${id}/cancel`, { method: "POST" });
      setMessage("Satın alma siparişi iptal edildi.");
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sipariş iptal edilemedi");
    }
  }
  async function updateExpectedAt(order: Order) {
    const current = order.expected_at ? order.expected_at.slice(0, 10) : "";
    const expectedAt = window.prompt("Yeni beklenen teslim tarihi (YYYY-AA-GG):", current);
    if (!expectedAt) return;
    try {
      await api(`/admin/purchasing/orders/${order.id}/expected-at`, { method: "PATCH", body: JSON.stringify({ expectedAt }) });
      setMessage("Beklenen teslim tarihi güncellendi.");
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Teslim tarihi güncellenemedi");
    }
  }
  function exportOrders() {
    const rows = [
      ["Sipariş no", "Tedarikçi", "Depo", "Tutar", "Para birimi", "Durum", "Beklenen teslim", "Kalemler"],
      ...orders.map((order) => [
        order.order_number,
        order.supplier_name,
        order.warehouse_name,
        order.total_cost,
        order.currency,
        order.status,
        order.expected_at ?? "",
        order.items.map((item) => `${item.productName}: ${item.receivedQuantity}/${item.orderedQuantity}`).join(" | "),
      ]),
    ];
    const blob = new Blob(["\ufeff" + rows.map((row) => row.map(csv).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "trex-satin-alma-siparisleri.csv"; link.click(); URL.revokeObjectURL(link.href);
  }
  function exportSupplierPerformance() {
    if (!supplierPerformance.length) { setMessage('Dışa aktarılacak tedarikçi performansı bulunamadı.'); return; }
    const rows = [
      ['Tedarikçi', 'Yetkili', 'Telefon', 'E-posta', 'Toplam sipariş', 'Açık sipariş', 'Geciken sipariş', 'Teslim alınan', 'Son teslim'],
      ...supplierPerformance.map(item => [item.name, item.contact_name ?? '', item.phone ?? '', item.email ?? '', item.order_count, item.open_order_count, item.overdue_order_count, item.received_order_count, item.last_received_at ? new Date(item.last_received_at).toLocaleDateString('tr-TR') : '']),
    ];
    const blob = new Blob(['\ufeff' + rows.map(row => row.map(csv).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'trex-tedarikci-performansi.csv'; link.click(); URL.revokeObjectURL(link.href);
  }
  async function receive(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/admin/purchasing/orders/${receipt.orderId}/receive`, {
        method: "POST",
        body: JSON.stringify({
          ...receipt,
          quantity: Number(receipt.quantity),
          expiryDate: receipt.expiryDate || undefined,
          locationCode: receipt.locationCode || undefined,
        }),
      });
      setMessage("Teslim alma tamamlandı; stok ve ürün maliyeti güncellendi.");
      setReceipt({
        orderId: "",
        itemId: "",
        quantity: "1",
        lotCode: "",
        expiryDate: "",
        locationCode: "",
      });
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Teslim alma kaydedilemedi");
    }
  }
  return (
    <main>
      <AdminNav />
      <section>
        <p>STOK / SATIN ALMA</p>
        <h1>Satın alma ve tedarik</h1>
        <p>
          <Link href="/stok">← Stok yönetimi</Link>
        </p>
        {message && <p role="status">{message}</p>}
        <div className="cards">
          <article>
            <p>TEDARİKÇİ</p>
            <h2>{options.suppliers.length}</h2>
            <p>Kayıtlı tedarikçi</p>
          </article>
          <article>
            <p>AÇIK SİPARİŞ</p>
            <h2>
              {
                orders.filter((x) =>
                  ["ORDERED", "PARTIALLY_RECEIVED"].includes(x.status),
                ).length
              }
            </h2>
            <p>Teslim alma bekleyen</p>
          </article>
          <article>
            <p>GECİKEN TESLİMAT</p>
            <h2>{overdueOrders.length}</h2>
            <p>Beklenen tarihi geçen</p>
          </article>
        </div>
        <form className="form-card" onSubmit={createSupplier}>
          <h2>Yeni tedarikçi</h2>
          <div className="form-grid">
            <label>
              Tedarikçi adı
              <input
                required
                value={supplier.name}
                onChange={(e) =>
                  setSupplier((x) => ({ ...x, name: e.target.value }))
                }
                placeholder="Firma unvanı"
              />
            </label>
            <label>
              Yetkili kişi
              <input
                value={supplier.contactName}
                onChange={(e) =>
                  setSupplier((x) => ({ ...x, contactName: e.target.value }))
                }
                placeholder="Ad soyad"
              />
            </label>
            <label>
              Telefon
              <input
                value={supplier.phone}
                onChange={(e) =>
                  setSupplier((x) => ({ ...x, phone: e.target.value }))
                }
                placeholder="05xx..."
              />
            </label>
            <label>
              E-posta
              <input
                type="email"
                value={supplier.email}
                onChange={(e) =>
                  setSupplier((x) => ({ ...x, email: e.target.value }))
                }
                placeholder="satinalma@firma.com"
              />
            </label>
          </div>
          <button>Tedarikçiyi kaydet</button>
        </form>
        <form className="form-card" onSubmit={updateSupplier}>
          <h2>Tedarikçi iletişim bilgilerini düzenle</h2>
          <div className="form-grid">
            <label>
              Tedarikçi
              <select
                required
                value={supplierEdit.id}
                onChange={(e) => chooseSupplier(e.target.value)}
              >
                <option value="">Seçin</option>
                {options.suppliers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tedarikçi adı
              <input
                required
                value={supplierEdit.name}
                onChange={(e) =>
                  setSupplierEdit((value) => ({ ...value, name: e.target.value }))
                }
              />
            </label>
            <label>
              Yetkili kişi
              <input
                value={supplierEdit.contactName}
                onChange={(e) =>
                  setSupplierEdit((value) => ({ ...value, contactName: e.target.value }))
                }
              />
            </label>
            <label>
              Telefon
              <input
                value={supplierEdit.phone}
                onChange={(e) =>
                  setSupplierEdit((value) => ({ ...value, phone: e.target.value }))
                }
              />
            </label>
            <label>
              E-posta
              <input
                type="email"
                value={supplierEdit.email}
                onChange={(e) =>
                  setSupplierEdit((value) => ({ ...value, email: e.target.value }))
                }
              />
            </label>
          </div>
          <button>Tedarikçiyi güncelle</button>
        </form>
        <div className="period-toolbar"><h2>Tedarikçi performansı</h2><button type="button" disabled={!supplierPerformance.length} onClick={exportSupplierPerformance}>CSV indir</button></div>
        <p>Açık ve geciken satın alma siparişleri tedarikçi bazında izlenir.</p>
        <div className="table-wrap"><table><thead><tr><th>Tedarikçi</th><th>Toplam</th><th>Açık</th><th>Geciken</th><th>Teslim alınan</th><th>Son teslim</th></tr></thead><tbody>{supplierPerformance.map(item=><tr key={item.id}><td>{item.name}<div>{item.contact_name??item.email??'İletişim bilgisi yok'}</div></td><td>{item.order_count}</td><td>{item.open_order_count}</td><td>{item.overdue_order_count}</td><td>{item.received_order_count}</td><td>{item.last_received_at?new Date(item.last_received_at).toLocaleDateString('tr-TR'):'—'}</td></tr>)}{!supplierPerformance.length&&<tr><td colSpan={6}>Henüz tedarikçi yok.</td></tr>}</tbody></table></div>
        <form className="form-card" onSubmit={createOrder}>
          <h2>Satın alma siparişi</h2>
          <div className="form-grid">
            <label>
              Tedarikçi
              <select
                required
                value={form.supplierId}
                onChange={(e) =>
                  setForm((x) => ({ ...x, supplierId: e.target.value }))
                }
              >
                <option value="">Seçin</option>
                {options.suppliers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.contact_name ? ` · ${x.contact_name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Depo
              <select
                required
                value={form.warehouseId}
                onChange={(e) =>
                  setForm((x) => ({ ...x, warehouseId: e.target.value }))
                }
              >
                <option value="">Seçin</option>
                {options.warehouses.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Para birimi
              <select
                value={form.currency}
                onChange={(e) =>
                  setForm((x) => ({ ...x, currency: e.target.value }))
                }
              >
                <option value="TRY">TL</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label>
              Teslim beklenen tarih
              <input
                type="date"
                value={form.expectedAt}
                onChange={(e) =>
                  setForm((x) => ({ ...x, expectedAt: e.target.value }))
                }
              />
            </label>
          </div>
          <h3>Kalemler</h3>
          {form.items.map((item, i) => (
            <div className="form-grid" key={i}>
              <label>
                Ürün
                <select
                  required
                  value={item.productId}
                  onChange={(e) => setItem(i, "productId", e.target.value)}
                >
                  <option value="">Seçin</option>
                  {options.products.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · {x.sku}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Adet
                <input
                  required
                  min="1"
                  type="number"
                  value={item.quantity}
                  onChange={(e) => setItem(i, "quantity", e.target.value)}
                />
              </label>
              <label>
                Birim maliyet
                <input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  value={item.unitCost}
                  onChange={(e) => setItem(i, "unitCost", e.target.value)}
                />
              </label>
              {form.items.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setForm((x) => ({
                      ...x,
                      items: x.items.filter((_, k) => k !== i),
                    }))
                  }
                >
                  Kalemi kaldır
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setForm((x) => ({
                ...x,
                items: [
                  ...x.items,
                  { productId: "", quantity: "1", unitCost: "" },
                ],
              }))
            }
          >
            + Kalem ekle
          </button>
          <label className="wide">
            Not
            <input
              value={form.note}
              onChange={(e) => setForm((x) => ({ ...x, note: e.target.value }))}
            />
          </label>
          <button>Satın alma siparişi oluştur</button>
        </form>
        <form className="form-card" onSubmit={receive}>
          <h2>Teslim al ve stoğa işle</h2>
          <div className="form-grid">
            <label>
              Sipariş
              <select
                required
                value={receipt.orderId}
                onChange={(e) =>
                  setReceipt((x) => ({
                    ...x,
                    orderId: e.target.value,
                    itemId: "",
                  }))
                }
              >
                <option value="">Seçin</option>
                {orders
                  .filter((x) =>
                    ["ORDERED", "PARTIALLY_RECEIVED"].includes(x.status),
                  )
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.order_number} · {x.supplier_name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Kalem
              <select
                required
                value={receipt.itemId}
                onChange={(e) =>
                  setReceipt((x) => ({ ...x, itemId: e.target.value }))
                }
              >
                <option value="">Seçin</option>
                {receiveOrder?.items
                  .filter((x) => x.receivedQuantity < x.orderedQuantity)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.productName} · kalan{" "}
                      {x.orderedQuantity - x.receivedQuantity}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Alınan adet
              <input
                required
                min="1"
                type="number"
                value={receipt.quantity}
                onChange={(e) =>
                  setReceipt((x) => ({ ...x, quantity: e.target.value }))
                }
              />
            </label>
            <label>
              Lot kodu
              <input
                required
                value={receipt.lotCode}
                onChange={(e) =>
                  setReceipt((x) => ({ ...x, lotCode: e.target.value }))
                }
              />
            </label>
            <label>
              SKT
              <input
                type="date"
                value={receipt.expiryDate}
                onChange={(e) =>
                  setReceipt((x) => ({ ...x, expiryDate: e.target.value }))
                }
              />
            </label>
            <label>
              Raf / konum
              <input
                value={receipt.locationCode}
                onChange={(e) =>
                  setReceipt((x) => ({ ...x, locationCode: e.target.value }))
                }
              />
            </label>
          </div>
          <button>Teslim al</button>
        </form>
        <div className="period-toolbar"><h2>Satın alma siparişleri</h2><button type="button" disabled={!orders.length} onClick={exportOrders}>CSV indir</button></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Tedarikçi</th>
                <th>Depo</th>
                <th>Kalemler</th>
                <th>Tutar</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((x) => (
                <tr key={x.id}>
                  <td>{x.order_number}</td>
                  <td>{x.supplier_name}</td>
                  <td>{x.warehouse_name}</td>
                  <td>
                    {x.items.map((i) => (
                      <div key={i.id}>
                        {i.productName}: {i.receivedQuantity}/
                        {i.orderedQuantity}
                      </div>
                    ))}
                  </td>
                  <td>{money(x.total_cost, x.currency)}</td>
                  <td>
                    {x.status}
                    {overdueOrders.some((order) => order.id === x.id) && (
                      <div>Gecikti · {x.expected_at}</div>
                    )}
                  </td>
                  <td>
                    {["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"].includes(x.status) && <button type="button" onClick={() => void updateExpectedAt(x)}>Teslim tarihini değiştir</button>}
                    {(x.status === "DRAFT" || (x.status === "ORDERED" && x.items.every((item) => item.receivedQuantity === 0))) && (
                      <>
                        {x.status === "DRAFT" && <button onClick={() => void markOrdered(x.id)}>
                          Onayla
                        </button>}{" "}
                        <button onClick={() => void cancelOrder(x.id)}>
                          İptal et
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!orders.length && (
                <tr>
                  <td colSpan={7}>Henüz satın alma siparişi yok.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
