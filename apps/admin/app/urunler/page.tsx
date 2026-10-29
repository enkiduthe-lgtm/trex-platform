"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../components/admin-nav";
import { api, apiBaseUrl } from "../lib/api";
import styles from "./products.module.css";

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  image_url?: string | null;
  available_quantity?: number;
};
type Level = { id: string; name: string };
type PriceGroup = { id: string; name: string };
type Price = {
  id: string;
  product_id: string;
  amount: string;
  scope: string;
  dealer_level_name: string | null;
};
type Cost = {
  id: string;
  product_id: string;
  unit_cost: string;
  supplier_name: string | null;
};
const money = (value: string) =>
  Number(value).toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
function parseCsvLine(line: string, separator: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === separator && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}
export default function Products() {
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<
    Array<{
      name: string;
      sku: string;
      slug: string;
      barcode?: string;
      description?: string;
      status: "DRAFT" | "ACTIVE";
    }>
  >([]);
  const [importing, setImporting] = useState(false);
  function downloadCsv() {
    const lines = [
      ["name", "sku", "slug", "barcode", "description", "status"],
      ...shown.map((product) => [
        product.name,
        product.sku,
        product.slug,
        product.barcode ?? "",
        product.description ?? "",
        product.status,
      ]),
    ]
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(";"),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${lines}`], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "trex-urunler.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  function readCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "").replace(/^\uFEFF/, "");
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headerLine = lines.shift() ?? "";
        const separator = headerLine.includes(";") ? ";" : ",";
        const headers = parseCsvLine(headerLine, separator).map((x) =>
          x.toLowerCase(),
        );
        const index = (name: string) => headers.indexOf(name);
        if (["name", "sku", "slug"].some((name) => index(name) < 0))
          throw new Error("CSV başlıkları name, sku ve slug olmalıdır.");
        const rows = lines
          .map((line) => parseCsvLine(line, separator))
          .map((values) => ({
            name: values[index("name")] ?? "",
            sku: values[index("sku")] ?? "",
            slug: values[index("slug")] ?? "",
            barcode:
              index("barcode") >= 0
                ? values[index("barcode")] || undefined
                : undefined,
            description:
              index("description") >= 0
                ? values[index("description")] || undefined
                : undefined,
            status: (index("status") >= 0 &&
            values[index("status")] === "ACTIVE"
              ? "ACTIVE"
              : "DRAFT") as "DRAFT" | "ACTIVE",
          }));
        if (
          !rows.length ||
          rows.some((row) => !row.name || !row.sku || !row.slug)
        )
          throw new Error("Her satırda ürün adı, SKU ve slug olmalıdır.");
        if (rows.length > 100)
          throw new Error("Bir seferde en fazla 100 ürün yüklenebilir.");
        setImportRows(rows);
        setMessage(`${rows.length} ürün içe aktarma için hazır.`);
      } catch (error) {
        setImportRows([]);
        setMessage(error instanceof Error ? error.message : "CSV okunamadı.");
      }
    };
    reader.readAsText(file, "utf-8");
  }
  async function importProducts() {
    if (!importRows.length) return;
    setImporting(true);
    try {
      const result = await api<{ imported: number }>("/admin/products/import", {
        method: "POST",
        body: JSON.stringify({ products: importRows }),
      });
      setMessage(`${result.imported} ürün içe aktarıldı.`);
      setImportRows([]);
      setImportOpen(false);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ürünler içe aktarılamadı.",
      );
    } finally {
      setImporting(false);
    }
  }
  const [deleting, setDeleting] = useState(false);
  async function removeSelected() {
    const ids = selected.filter((id) =>
      products.some((product) => product.id === id),
    );
    if (
      !ids.length ||
      !window.confirm(
        `${ids.length} ürün kalıcı silinsin mi? Fiyatları ve maliyetleri de kaldırılır. Sipariş geçmişine bağlı ürünler silinmez.`,
      )
    )
      return;
    setDeleting(true);
    let deleted = 0;
    const errors: string[] = [];
    try {
      for (const id of ids) {
        try {
          await api(`/admin/products/${id}`, { method: "DELETE" });
          deleted++;
        } catch (e) {
          errors.push(
            `${products.find((p) => p.id === id)?.name}: ${e instanceof Error ? e.message : "Silinemedi"}`,
          );
        }
      }
      setSelected([]);
      await load();
      setMessage(`${deleted} ürün silindi. ${errors.join(" ")}`);
    } finally {
      setDeleting(false);
    }
  }
  async function updateSelectedStatus(nextStatus: "DRAFT" | "ACTIVE") {
    const ids = selected.filter((id) =>
      products.some((product) => product.id === id),
    );
    if (!ids.length) return;
    setDeleting(true);
    try {
      const result = await api<{ updated: number }>(
        "/admin/products/bulk-status",
        { method: "POST", body: JSON.stringify({ ids, status: nextStatus }) },
      );
      setSelected([]);
      setMessage(
        `${result.updated} ürün ${nextStatus === "ACTIVE" ? "yayına alındı" : "taslağa alındı"}.`,
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Ürün durumları güncellenemedi.",
      );
    } finally {
      setDeleting(false);
    }
  }
  async function updateProductStatus(product: Product, nextStatus: "DRAFT" | "ACTIVE") {
    try {
      const result = await api<{ updated: number }>("/admin/products/bulk-status", {
        method: "POST", body: JSON.stringify({ ids: [product.id], status: nextStatus }),
      });
      setMessage(`${result.updated} ürün ${nextStatus === "ACTIVE" ? "yayına alındı" : "taslağa alındı"}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ürün durumu güncellenemedi.");
    }
  }
  const [products, setProducts] = useState<Product[]>([]),
    [levels, setLevels] = useState<Level[]>([]),
    [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]),
    [prices, setPrices] = useState<Price[]>([]),
    [costs, setCosts] = useState<Cost[]>([]);
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [imageProduct, setImageProduct] = useState<Product | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [failedImages, setFailedImages] = useState<Record<string, true>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageMessage, setImageMessage] = useState('');
  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    description: "",
    status: "DRAFT",
  });
  const [price, setPrice] = useState({
    productId: "",
    scope: "GLOBAL",
    amount: "",
    dealerLevelId: "",
    dealerPriceGroupId: "",
  });
  const [cost, setCost] = useState({
    productId: "",
    unitCost: "",
    supplierName: "",
    note: "",
  });
  const load = async () => {
    try {
      const current = await api<{ user: { role: string } }>("/auth/me");
      const owner = current.user.role === "SUPER_ADMIN";
      const [a, b, g, c, d] = await Promise.all([
        api<Product[]>("/admin/products"),
        api<Level[]>("/admin/dealers/levels"),
        api<PriceGroup[]>("/admin/dealers/price-groups"),
        api<Price[]>("/admin/prices"),
        owner ? api<Cost[]>("/admin/product-costs") : Promise.resolve([] as Cost[]),
      ]);
      setRole(current.user.role);
        setProducts(a);
        setFailedImages({});
        setLevels(b);
        setPriceGroups(g);
        setPrices(c);
        setCosts(d);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ürünler yüklenemedi");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const shown = useMemo(
    () =>
      products.filter(
        (product) =>
          (status === "ALL" || product.status === status) &&
          [product.name, product.sku, product.barcode, product.slug]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("tr-TR")
            .includes(query.toLocaleLowerCase("tr-TR")),
      ),
    [products, status, query],
  );
  const globalPrice = (id: string) =>
    prices.find((item) => item.product_id === id && item.scope === "GLOBAL");
  const latestCost = (id: string) =>
    costs.find((item) => item.product_id === id);
  const toggle = (id: string) =>
    setSelected((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          barcode: form.barcode || undefined,
          description: form.description || undefined,
        }),
      });
      setForm({
        name: "",
        sku: "",
        barcode: "",
        description: "",
        status: "DRAFT",
      });
      setNewOpen(false);
      setMessage("Ürün kaydedildi.");
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ürün kaydedilemedi");
    }
  }
  async function savePrice(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/admin/prices", {
        method: "POST",
        body: JSON.stringify({
          productId: price.productId,
          scope: price.scope,
          amount: Number(price.amount),
          currency: "TRY",
          dealerLevelId:
            price.scope === "DEALER_LEVEL" ? price.dealerLevelId : undefined,
          dealerPriceGroupId:
            price.scope === "DEALER_PRICE_GROUP"
              ? price.dealerPriceGroupId
              : undefined,
        }),
      });
      setPrice((data) => ({ ...data, amount: "" }));
      setMessage("TL fiyatı kaydedildi.");
      void load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Fiyat kaydedilemedi",
      );
    }
  }
  async function saveCost(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/admin/product-costs", {
        method: "POST",
        body: JSON.stringify({
          ...cost,
          unitCost: Number(cost.unitCost),
          supplierName: cost.supplierName || undefined,
          note: cost.note || undefined,
        }),
      });
      setCost({ productId: "", unitCost: "", supplierName: "", note: "" });
      setMessage("Ürün maliyeti kaydedildi.");
      void load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Maliyet kaydedilemedi",
      );
    }
  }
  function closeImageDialog() {
    if (uploadingImage) return;
    setImageMessage('');
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview("");
    setImageFile(null);
    setImageProduct(null);
  }
  function markImageUnavailable(product: Product) {
    setFailedImages((current) => current[product.id] ? current : { ...current, [product.id]: true });
  }
  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    setImageMessage('');
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageFile(null);
      setImageMessage("Görsel JPG, PNG veya WebP formatında olmalıdır.");
      return;
    }
    if (file.size > 2_000_000) {
      setImageFile(null);
      setImageMessage("Görsel en fazla 2 MB olabilir.");
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }
  async function uploadImage() {
    if (!imageProduct || !imageFile || uploadingImage) return;
    setImageMessage('');
    setUploadingImage(true);
    try {
      const body = new FormData();
      body.append("file", imageFile);
      body.append("placement", `PRODUCT_MAIN:${imageProduct.id}`);
      const uploaded = await api<{ publicUrl?: string }>("/admin/assets/upload", { method: "POST", body });
      if (!uploaded.publicUrl) {
        throw new Error("Görsel depolama adresi dönmedi. Sistem ayarlarındaki görsel depolamayı kontrol edin.");
      }
      setProducts((current) => current.map((product) => product.id === imageProduct.id ? { ...product, image_url: uploaded.publicUrl } : product));
      setFailedImages((current) => {
        const next = { ...current };
        delete next[imageProduct.id];
        return next;
      });
      setMessage(`${imageProduct.name} için görsel yüklendi.`);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImagePreview('');
      setImageFile(null);
      setImageProduct(null);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ürün görseli yüklenemedi.",
      );
      setImageMessage(error instanceof Error ? error.message : 'Ürün Görseli Yüklenemedi.');
    } finally {
      setUploadingImage(false);
    }
  }
  return (
    <main>
      <AdminNav />
      <section className={styles.page}>
        <div className={styles.titleRow}>
          <div>
            <p>ÜRÜN YÖNETİMİ</p>
            <h1>Ürünler</h1>
          </div>
          <div className={styles.catalogLinks}>
            <Link href="/stok">▦ Stok girişi</Link>
            <Link href="/depo-operasyon">⌂ Depo operasyonu</Link>
          </div>
        </div>
        {message && (
          <p className={styles.notice} role="status">
            {message}
          </p>
        )}
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <span>⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ürün adı, SKU, barkod veya site adresi ara"
            />
          </label>
          <label className={styles.statusSelect}>
            Durum
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ALL">Tümü</option>
              <option value="ACTIVE">Yayında</option>
              <option value="DRAFT">Taslak</option>
            </select>
          </label>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={downloadCsv}
          >
            CSV indir
          </button>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => setImportOpen((open) => !open)}
          >
            İçe aktar
          </button>
          {role === "SUPER_ADMIN" && <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => setPriceOpen((open) => !open)}
          >
            ₺ Fiyat / maliyet
          </button>}
          <button type="button" onClick={() => setNewOpen((open) => !open)}>
            ＋ Yeni ürün
          </button>
        </div>
        {importOpen && (
          <div className={styles.editor}>
            <header>
              <h2>Toplu ürün içe aktarma</h2>
              <button
                type="button"
                className={styles.close}
                onClick={() => setImportOpen(false)}
              >
                ×
              </button>
            </header>
            <p>
              Önce dışa aktarma ile şablonu indir; yalnızca{" "}
              <b>name, sku, slug, barcode, description, status</b> sütunlarını
              kullan. Yeni kayıtların SKU ve site adresi benzersiz olmalıdır.
            </p>
            <label>
              CSV dosyası
              <input
                accept=".csv,text/csv"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readCsv(file);
                }}
              />
            </label>
            {importRows.length > 0 && (
              <>
                <p>
                  <b>{importRows.length}</b> ürün kayda hazır.
                </p>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Ürün</th>
                        <th>SKU</th>
                        <th>Site adresi</th>
                        <th>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 10).map((row) => (
                        <tr key={`${row.sku}-${row.slug}`}>
                          <td>{row.name}</td>
                          <td>{row.sku}</td>
                          <td>/{row.slug}</td>
                          <td>
                            {row.status === "ACTIVE" ? "Yayında" : "Taslak"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importRows.length > 10 && (
                  <p>Ön izleme ilk 10 kaydı gösterir.</p>
                )}
                <footer>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => void importProducts()}
                  >
                    {importing
                      ? "İçe aktarılıyor…"
                      : `${importRows.length} ürünü içe aktar`}
                  </button>
                </footer>
              </>
            )}
          </div>
        )}
        {selected.length > 0 && (
          <div className={styles.selection}>
            <b>{selected.length} ürün seçildi</b>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void updateSelectedStatus("ACTIVE")}
            >
              Yayına al
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void updateSelectedStatus("DRAFT")}
            >
              Taslağa al
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void removeSelected()}
            >
              {deleting ? "Siliniyor…" : "Seçili ürünleri sil"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setSelected([])}
            >
              Seçimi kaldır
            </button>
          </div>
        )}
        {newOpen && (
          <form className={styles.editor} onSubmit={submit}>
            <header>
              <h2>Yeni ürün</h2>
              <button
                type="button"
                className={styles.close}
                onClick={() => setNewOpen(false)}
              >
                ×
              </button>
            </header>
            <div className={styles.tabHint}>
              <b>Genel bilgiler</b>
              <span>
                Fiyat, maliyet, stok ve görsel adımları ürün kaydından sonra
                eklenir.
              </span>
            </div>
            <div className={styles.formGrid}>
              <label>
                Ürün adı
                <input
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((data) => ({ ...data, name: e.target.value }))
                  }
                />
              </label>
              <label>
                SKU
                <input
                  required
                  value={form.sku}
                  onChange={(e) =>
                    setForm((data) => ({ ...data, sku: e.target.value }))
                  }
                />
              </label>
              <label>
                Barkod
                <input
                  value={form.barcode}
                  onChange={(e) =>
                    setForm((data) => ({ ...data, barcode: e.target.value }))
                  }
                />
              </label>
              <label>
                Yayın durumu
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((data) => ({ ...data, status: e.target.value }))
                  }
                >
                  <option value="DRAFT">Taslak</option>
                  <option value="ACTIVE">Yayında</option>
                </select>
              </label>
              <label className={styles.wide}>
                Açıklama
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((data) => ({
                      ...data,
                      description: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <footer>
              <button>Ürünü kaydet</button>
            </footer>
          </form>
        )}
        {priceOpen && (
          <div className={styles.priceGrid}>
            <form className={styles.editor} onSubmit={savePrice}>
              <header>
                <h2>Satış fiyatı</h2>
              </header>
              <label>
                Ürün
                <select
                  required
                  value={price.productId}
                  onChange={(e) =>
                    setPrice((data) => ({ ...data, productId: e.target.value }))
                  }
                >
                  <option value="">Ürün seç</option>
                  {products.map((product) => (
                    <option value={product.id} key={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fiyat türü
                <select
                  value={price.scope}
                  onChange={(e) =>
                    setPrice((data) => ({
                      ...data,
                      scope: e.target.value,
                      dealerLevelId: "",
                      dealerPriceGroupId: "",
                    }))
                  }
                >
                  <option value="GLOBAL">Site satış fiyatı</option>
                  <option value="DEALER_LEVEL">Bayi seviye fiyatı</option>
                  <option value="DEALER_PRICE_GROUP">Bayi fiyat grubu</option>
                </select>
              </label>
              {price.scope === "DEALER_LEVEL" && (
                <label>
                  Bayi seviyesi
                  <select
                    required
                    value={price.dealerLevelId}
                    onChange={(e) =>
                      setPrice((data) => ({
                        ...data,
                        dealerLevelId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Seviye seç</option>
                    {levels.map((level) => (
                      <option value={level.id} key={level.id}>
                        {level.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {price.scope === "DEALER_PRICE_GROUP" && (
                <label>
                  Bayi fiyat grubu
                  <select
                    required
                    value={price.dealerPriceGroupId}
                    onChange={(e) =>
                      setPrice((data) => ({
                        ...data,
                        dealerPriceGroupId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Grup seç</option>
                    {priceGroups.map((group) => (
                      <option value={group.id} key={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Tutar (TL)
                <input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  value={price.amount}
                  onChange={(e) =>
                    setPrice((data) => ({ ...data, amount: e.target.value }))
                  }
                />
              </label>
              <footer>
                <button>Fiyatı kaydet</button>
              </footer>
            </form>
            <form className={styles.editor} onSubmit={saveCost}>
              <header>
                <h2>Ürün maliyeti</h2>
              </header>
              <label>
                Ürün
                <select
                  required
                  value={cost.productId}
                  onChange={(e) =>
                    setCost((data) => ({ ...data, productId: e.target.value }))
                  }
                >
                  <option value="">Ürün seç</option>
                  {products.map((product) => (
                    <option value={product.id} key={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Birim maliyet (TL)
                <input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  value={cost.unitCost}
                  onChange={(e) =>
                    setCost((data) => ({ ...data, unitCost: e.target.value }))
                  }
                />
              </label>
              <label>
                Tedarikçi
                <input
                  value={cost.supplierName}
                  onChange={(e) =>
                    setCost((data) => ({
                      ...data,
                      supplierName: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Not
                <input
                  value={cost.note}
                  onChange={(e) =>
                    setCost((data) => ({ ...data, note: e.target.value }))
                  }
                />
              </label>
              <footer>
                <button>Maliyeti kaydet</button>
              </footer>
            </form>
          </div>
        )}
        {imageProduct && (
          <div
            className={styles.imageModal}
            role="dialog"
            aria-modal="true"
            aria-label={`${imageProduct.name} görseli`}
          >
            <div className={styles.imageModalCard}>
              <header>
                <div>
                  <span className={styles.modalIcon}>🖼</span>
                  <div>
                    <h2>Ürün görseli</h2>
                    <p>{imageProduct.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.close}
                  onClick={closeImageDialog}
                  aria-label="Pencereyi kapat"
                  disabled={uploadingImage}
                >
                  ×
                </button>
              </header>
              <div className={styles.imagePreview}>
                {(imagePreview || imageProduct.image_url) && !(imageProduct.image_url && !imagePreview && failedImages[imageProduct.id]) ? (
                  <img
                    src={imagePreview || `${apiBaseUrl}/assets/product/${imageProduct.id}?v=${encodeURIComponent(imageProduct.image_url ?? '')}`}
                    alt={`${imageProduct.name} önizlemesi`}
                    onError={() => markImageUnavailable(imageProduct)}
                  />
                ) : (
                  <span>
                    🖼<small>{imageProduct.image_url ? "Görsel yüklenemedi" : "Henüz görsel yok"}</small>
                  </span>
                )}
              </div>
              <label className={styles.uploadInput}>
                Görsel seç
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingImage}
                  onChange={chooseImage}
                />
                <small>JPG, JPEG, PNG veya WebP · en fazla 2 MB · önerilen ölçü: 1600 × 1600 px (kare)</small>
              </label>
              {imageMessage && <p role="alert">{imageMessage}</p>}
              <footer>
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={closeImageDialog}
                  disabled={uploadingImage}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={!imageFile || uploadingImage}
                  onClick={() => void uploadImage()}
                >
                  {uploadingImage ? "Yükleniyor…" : "Görseli kaydet"}
                </button>
              </footer>
            </div>
          </div>
        )}
        {detailProduct && (
          <div
            className={styles.imageModal}
            role="dialog"
            aria-modal="true"
            aria-label={`${detailProduct.name} ürün detayı`}
          >
            <div className={styles.detailModalCard}>
              <header>
                <div>
                  <span className={styles.modalIcon}>▦</span>
                  <div>
                    <h2>Ürün Detayı</h2>
                    <p>{detailProduct.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.close}
                  onClick={() => setDetailProduct(null)}
                  aria-label="Pencereyi kapat"
                >
                  ×
                </button>
              </header>
              <div className={styles.detailBody}>
                <div className={styles.detailImage}>
                  {detailProduct.image_url && !failedImages[detailProduct.id] ? (
                    <img
                      src={`${apiBaseUrl}/assets/product/${detailProduct.id}?v=${encodeURIComponent(detailProduct.image_url ?? '')}`}
                      alt={`${detailProduct.name} görseli`}
                      onError={() => markImageUnavailable(detailProduct)}
                    />
                  ) : (
                    <span>🖼<small>Ürün Görseli Yok</small></span>
                  )}
                </div>
                <dl className={styles.detailGrid}>
                  <div><dt>Ürün Kodu</dt><dd>{detailProduct.sku}</dd></div>
                  <div><dt>Barkod</dt><dd>{detailProduct.barcode ?? "—"}</dd></div>
                  <div><dt>Stok</dt><dd>{detailProduct.available_quantity ?? 0} Adet</dd></div>
                  <div><dt>Durum</dt><dd>{detailProduct.status === "ACTIVE" ? "Yayında" : "Taslak"}</dd></div>
                  <div className={styles.detailWide}><dt>Ürün Bağlantısı</dt><dd>/{detailProduct.slug}</dd></div>
                </dl>
              </div>
              <section className={styles.descriptionCard}>
                <h3>Ürün Açıklaması</h3>
                <p>{detailProduct.description?.trim() || "Bu ürün için kayıtlı açıklama bulunmuyor."}</p>
              </section>
              <footer>
                <button type="button" className={styles.secondaryAction} onClick={() => setDetailProduct(null)}>
                  Kapat
                </button>
                <button type="button" onClick={() => { setDetailProduct(null); setImageProduct(detailProduct); }}>
                  Görseli Yönet
                </button>
              </footer>
            </div>
          </div>
        )}
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Tüm ürünleri seç"
                    checked={
                      shown.length > 0 && selected.length === shown.length
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? shown.map((product) => product.id)
                          : [],
                      )
                    }
                  />
                </th>
                <th>No</th>
                <th>Görsel</th>
                <th>Ürün bilgileri</th>
                <th>Site fiyatı</th>
                {role === "SUPER_ADMIN" && <th>Maliyet</th>}
                <th>Stok</th>
                <th>Durum</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((product, index) => {
                const sale = globalPrice(product.id),
                  costItem = latestCost(product.id);
                return (
                  <tr key={product.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${product.name} seç`}
                        checked={selected.includes(product.id)}
                        onChange={() => toggle(product.id)}
                      />
                    </td>
                    <td>{index + 1}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.imageButton}
                        onClick={() => setImageProduct(product)}
                        title="Ürün görselini yükle veya değiştir"
                      >
                        {product.image_url && !failedImages[product.id] ? (
                          <img
                            src={`${apiBaseUrl}/assets/product/${product.id}?v=${encodeURIComponent(product.image_url ?? '')}`}
                            alt={`${product.name} görseli`}
                            onError={() => markImageUnavailable(product)}
                          />
                        ) : (
                          <span aria-hidden="true">🖼</span>
                        )}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.productNameButton}
                        onClick={() => setDetailProduct(product)}
                        title="Ürün Detayını Aç"
                      >
                        {product.name}
                      </button>
                      <small>Kodu: {product.sku}</small>
                      <small>
                        Barkod: {product.barcode ?? "—"} · /{product.slug}
                      </small>
                    </td>
                    <td>
                      <b>{sale ? money(sale.amount) : "Fiyat girilmedi"}</b>
                      <small>
                        {sale
                          ? "Site satış fiyatı"
                          : "Fiyat menüsünden ekleyin"}
                      </small>
                    </td>
                    {role === "SUPER_ADMIN" && <td>
                      <b>
                        {costItem
                          ? money(costItem.unit_cost)
                          : "Maliyet girilmedi"}
                      </b>
                      <small>{costItem?.supplier_name ?? "—"}</small>
                    </td>}
                    <td>
                      <Link className={styles.stockLink} href="/stok">
                        ▦ {product.available_quantity ?? 0} adet
                        <small>Kalan stok · depo ve lot bilgisi</small>
                      </Link>
                    </td>
                    <td>
                      <span
                        className={
                          product.status === "ACTIVE"
                            ? styles.active
                            : styles.draft
                        }
                      >
                        {product.status === "ACTIVE" ? "● Yayında" : "● Taslak"}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.mediaAction}
                          onClick={() => setImageProduct(product)}
                          title="Görsel yükle"
                        >
                          <span>🖼</span>
                          <small>Görsel Yükle</small>
                        </button>
                        {role === "SUPER_ADMIN" && <button
                          type="button"
                          className={styles.priceAction}
                          onClick={() => {
                            setPrice((data) => ({
                              ...data,
                              productId: product.id,
                            }));
                            setPriceOpen(true);
                          }}
                          title="Fiyat ve maliyet"
                        >
                          <span>₺</span>
                          <small>Fiyat Gir/Değiştir</small>
                        </button>}
                        <button type="button" className={styles.statusAction} onClick={() => void updateProductStatus(product, product.status === "ACTIVE" ? "DRAFT" : "ACTIVE")} title={product.status === "ACTIVE" ? "Ürünü taslağa al" : "Ürünü yayına al"}>
                          <span>{product.status === "ACTIVE" ? "◌" : "●"}</span>
                          <small>{product.status === "ACTIVE" ? "Yayından Kaldır" : "Yayına Al"}</small>
                        </button>
                        <Link className={styles.stockAction} href={`/stok?productId=${product.id}`} title="Bu ürün için stok girişi aç">
                          <span>▦</span><small>Stok Gir</small>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && (
            <div className={styles.empty}>
              Bu arama ve filtrede ürün bulunamadı.
            </div>
          )}
        </div>
        <p className={styles.count}>{shown.length} ürün listeleniyor.</p>
      </section>
    </main>
  );
}
