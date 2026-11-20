'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MetricChart } from '../components/metric-chart';
import { monthlySeries } from '../lib/chart-data';
import { api, clearToken, logout } from '../lib/api';
import { currencyTotals, multiplyMoney } from '../lib/report-totals';
import { dealerPackSummary } from '../lib/dealer-pack-summary';
import { downloadXlsx } from '../lib/xlsx';
import styles from './portal.module.css';
import { WalletPanel, createWalletView } from './wallet-panel';
import { TrackingPanel } from './tracking-panel';
import { ProductCatalog, type PortalProduct } from './product-catalog';
import { OrderDetails, type DealerOrderDetail } from './order-details';
import { matchesDealerOrder, dealerOrderProductsLabel, type DealerOrderHistory } from '../lib/dealer-order-history';
import { createRequestGate } from '../lib/async-controls';

type Summary = { company_name: string; code: string; level_name?:string|null; has_primary_iban?:boolean; dealer_balance: string; order_count: string; agreement_accepted_at: string | null };
type Product = PortalProduct;
type Options = { exchangeRate?:number; products: Product[]; warehouses: { id: string; name: string }[] };
type Order = DealerOrderHistory & { id: string; can_cancel?: boolean; order_number: string; status: string; total_amount: string; refunded_amount?: string; net_amount?: string; cod_service_fee?:string; currency: string; created_at: string };
type CreatedOrder = Pick<Order,'id'|'order_number'|'status'|'total_amount'|'currency'>;
type OrderDetail = DealerOrderDetail;
type Ledger = { id: string; direction: string; amount: string; currency: string; description: string; reference_type: string; created_at: string };
type Shipment = { id: string; order_id?:string; order_number: string; provider: string; tracking_number: string | null; status: string; created_at:string; tracking_checked_at:string|null;tracking_error?:string|null };
type Item = { packSize?:number; packAmount?:string; baseAmount:string; productId: string; quantity: number; unitAmount: string; currency: string };
const tabs = ['Yeni Sipariş', 'Ürünler', 'Siparişlerim', 'Kargo Takibi', 'Primlerim', 'Cari Hesabım'] as const;
type Tab = typeof tabs[number];
const statuses: Record<string, string> = { PENDING_PAYMENT: 'Ödeme Bekliyor', PAID: 'Onaylandı', PROCESSING: 'Hazırlanıyor', REGISTERED: 'Kargo Kaydı Açıldı', SHIPPED: 'Kargoda', DELIVERED: 'Teslim Edildi', CARRIER_RETURN: 'Kargo İadesi', CANCELLED: 'İptal Edildi', REFUNDED: 'İade Edildi', PENDING: 'Bekliyor', CONFIRMED: 'Kesinleşti', AVAILABLE: 'Kullanılabilir', CREATED: 'Kargo Kaydı Oluşturuldu', IN_TRANSIT: 'Kargoda', FAILED: 'İşlem Başarısız' };
const shipmentOrderStatuses:Record<string,string>={IN_TRANSIT:'SHIPPED',CREATED:'REGISTERED'};
const money = (value: string, currency = 'TRY') => Number(value).toLocaleString('tr-TR', { style: 'currency', currency });
function refundSummary(order: Order) {
  if (!order.refunded_amount || Number(order.refunded_amount) <= 0) return null;
  return <small>İade {money(order.refunded_amount, order.currency)} · İade sonrası {money(order.net_amount ?? order.total_amount, order.currency)}</small>;
}
const date = (value: string) => new Date(value).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
const initial = { recipientName: '', contactEmail: '', phone: '', city: '', district: '', addressLine: '', postalCode: '', paymentMethod: 'TRANSFER', currency:'TRY', productId: '', quantity: 1 };

export default function DealerPortal() {
  const [tab, setTabState] = useState<Tab>('Yeni Sipariş');
  const [walletView,setWalletView]=useState(createWalletView);
  const orderViewGate=useRef(createRequestGate());
  const setTab=(value:Tab)=>{orderViewGate.current.invalidate();setTabState(value);};
  useEffect(()=>()=>orderViewGate.current.invalidate(),[]);
  const [chartCurrency,setChartCurrency]=useState('TRY');
  const [email, setEmail] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [options, setOptions] = useState<Options>({ products: [], warehouses: [] });
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [createdOrder,setCreatedOrder]=useState<CreatedOrder|null>(null);
  const [cancelCandidate,setCancelCandidate]=useState<Order|null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [form, setForm] = useState(initial);
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [editingItemId,setEditingItemId]=useState<string|null>(null);
  const [historyQuery,setHistoryQuery]=useState('');
  const [historyStatus,setHistoryStatus]=useState('ALL');
  const [historyError,setHistoryError]=useState('');
  const [trackingOrder,setTrackingOrder]=useState<string|null>(null);
  const [packSize,setPackSize] = useState(1);
  const [codServiceFee,setCodServiceFee] = useState('75');
  const [priceOverride, setPriceOverride] = useState('');
  const [currencyChange, setCurrencyChange] = useState<{method:string;currency:string}|null>(null);
  const actionLock = useRef(false);
  const pendingOrder = useRef<{ body: string; key: string } | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const validRange = !dateFrom || !dateTo || dateFrom <= dateTo;
  const inRange = (value: string) => {
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date(value));
    return validRange && (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
  };
  const matchesHistory=(value:string)=>value.toLocaleLowerCase('tr-TR').includes(historyQuery.trim().toLocaleLowerCase('tr-TR'));
  const shownOrders = orders.filter(row => inRange(row.created_at)&&matchesDealerOrder(row,historyQuery)&&(historyStatus==='ALL'||row.status===historyStatus));
  const shownShipments = shipments.filter(row => inRange(row.created_at)&&matchesHistory(row.order_number+' '+(row.tracking_number??''))&&
    (historyStatus==='ALL'||(shipmentOrderStatuses[row.status]??row.status)===historyStatus));
  const shownLedger = ledger.filter(row => inRange(row.created_at));
  const product = options.products.find(row => row.id === form.productId);
  const selectedPack = product?.packs?.find(pack=>pack.size===packSize);
  const selectedBase = packSize===1 ? product?.amount : selectedPack?.amount;
  const lineTotal = (row:Item) => row.packSize ? multiplyMoney(row.packAmount!,row.quantity/row.packSize) : multiplyMoney(row.unitAmount,row.quantity);
  const balances = useMemo(() => currencyTotals(ledger.map(row => ({ currency: row.currency, amount: row.direction === 'DEBIT' ? row.amount : `-${row.amount}` }))), [ledger]);
  const [available, setAvailable] = useState<{ currency: string; amount: string }[]>([]);
  const totals = useMemo(() => currencyTotals(items.map(row => ({ currency: row.currency, amount: lineTotal(row) }))), [items]);
  const commissionBalance=available.find(row=>row.currency==='TRY')?.amount??'0';
  const commissionRemainder=currencyTotals([
    {currency:'TRY',amount:commissionBalance},
    ...totals.filter(row=>row.currency==='TRY').map(row=>({currency:'TRY',amount:'-'+row.amount})),
  ])[0].amount;
  const insufficientCommission=form.paymentMethod==='COMMISSION'&&commissionRemainder.startsWith('-');
  const estimatedMargin = useMemo(() => currencyTotals(items.flatMap(row => {
    const base = row.baseAmount;
    return base === null || base === undefined ? [] : [{currency:row.currency,amount:lineTotal(row)},{currency:row.currency,amount:'-'+multiplyMoney(base,row.packSize?row.quantity/row.packSize:row.quantity)}];
  })), [items, options.products]);
  const change = (key: keyof typeof initial, value: string | number) => setForm(current => ({ ...current, [key]: value }));
  async function changePayment(method:string,currency:string,clearCart=false) {
    if (!ready || actionLock.current) return;
    if (currency === form.currency) {
      setForm(current => ({ ...current, paymentMethod: method }));
      setCurrencyChange(null);
      setMessage('');
      return;
    }
    if (items.length && !clearCart) {
      setCurrencyChange({method,currency});
      return;
    }
    await action(async()=>{
      const next=await api<Options>('/dealer-portal/creation-options?currency='+currency);
      setOptions(next);setPriceOverride('');setPackSize(1);
      setEditingItemId(null);
      if (clearCart) setItems([]);
      setCurrencyChange(null);
      setForm(current=>({...current,paymentMethod:method,currency,productId:'',quantity:1}));
      setMessage('Ürün fiyatları yeni para biriminde gösteriliyor.');
    });
  }
  async function load() {
    setReady(false);
    setOrderDetail(null);
    const me = await api<{ user: { email: string; role: string } }>('/auth/me');
    if (me.user.role !== 'DEALER') throw new Error('Bu Alan Yalnızca Bayi Hesapları İçindir.');
    const [account, products, listed, movements, deliveries, commissionBalances] = await Promise.all([
      api<Summary>('/dealer-portal/summary'), api<Options>('/dealer-portal/creation-options?currency='+form.currency), api<Order[]>('/dealer-portal/orders'),
      api<Ledger[]>('/dealer-portal/ledger'), api<Shipment[]>('/dealer-portal/shipments'), api<{ currency: string; amount: string }[]>('/dealer-portal/commission-balances'),
    ]);
    setEmail(me.user.email); setSummary(account); setOptions(products); setOrders(listed); setLedger(movements); setShipments(deliveries); setAvailable(commissionBalances);
    setForm(current => ({ ...current, contactEmail: current.contactEmail || me.user.email })); setReady(true);
  }
  async function refreshAfterAction(confirmation: string) {
    try {
      await load();
      setMessage(confirmation);
    } catch {
      setMessage(confirmation + ' Güncel Bilgiler Yüklenemedi. Bilgileri Yenile Düğmesini Kullanın.');
    }
  }
  async function refreshAccountSummary() {
    try {
      const [account,movements,commissionBalances]=await Promise.all([
        api<Summary>('/dealer-portal/summary'),api<Ledger[]>('/dealer-portal/ledger'),
        api<{currency:string;amount:string}[]>('/dealer-portal/commission-balances'),
      ]);
      setSummary(account);setLedger(movements);setAvailable(commissionBalances);
    } catch {setMessage('Hesap özeti yenilenemedi. Bilgileri Yenile düğmesini kullanın.');}
  }
  async function openOrder(id:string) {
    await action(async()=>{
      const ticket=orderViewGate.current.begin();
      let detail:OrderDetail;
      try { detail=await api<OrderDetail>(`/dealer-portal/orders/${id}`); }
      catch(error){if(orderViewGate.current.isCurrent(ticket))throw error;return;}
      if(!orderViewGate.current.isCurrent(ticket))return;
      setOrderDetail(detail);
      setTrackingOrder(null);setTab('Siparişlerim');
      requestAnimationFrame(()=>document.getElementById('bayi-siparis-detayi')?.focus());
    });
  }
  async function confirmCancellation() {
    if(!cancelCandidate||!orders.some(row=>row.id===cancelCandidate.id&&row.can_cancel))return;
    await action(async()=>{
      await api(`/dealer-portal/orders/${cancelCandidate.id}/cancel`,{method:'POST'});
      const number=cancelCandidate.order_number;
      setCancelCandidate(null);
      await refreshAfterAction(number+' numaralı sipariş iptal edildi.');
    });
  }
  function openTracking(id:string) {
    setTrackingOrder(id);
    requestAnimationFrame(()=>document.getElementById('bayi-kargo-hareketleri')?.focus());
  }
  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : 'Bayi Bilgileri Yüklenemedi.')); }, []);
  useEffect(()=>{
    if(!ready||!['Siparişlerim','Kargo Takibi'].includes(tab))return;
    let active=true,inFlight=false;
    const refresh=async()=>{
      if(inFlight||document.visibilityState!=='visible'||actionLock.current)return;
      inFlight=true;
      try {
        const [listed,deliveries]=await Promise.all([
          api<Order[]>('/dealer-portal/orders'),api<Shipment[]>('/dealer-portal/shipments'),
        ]);
        if(active&&!actionLock.current){setOrders(listed);setShipments(deliveries);setHistoryError('');}
      } catch(error) {
        if(active)setHistoryError(error instanceof Error?error.message:'Sipariş ve kargo bilgileri yenilenemedi.');
      } finally {inFlight=false;}
    };
    const timer=window.setInterval(()=>void refresh(),30_000);
    const visible=()=>{void refresh();};
    window.addEventListener('focus',visible);
    document.addEventListener('visibilitychange',visible);
    void refresh();
    return ()=>{
      active=false;window.clearInterval(timer);
      window.removeEventListener('focus',visible);
      document.removeEventListener('visibilitychange',visible);
    };
  },[ready,tab]);
  function addItem(quickProduct?: Product) {
    if (actionLock.current) return;
    if (!ready) return setMessage('Ürün Ve Hesap Bilgilerini Önce Yenileyin.');
    const selected=quickProduct??product;
    const count=quickProduct?1:form.quantity;
    if (!selected || selected.amount === null || !selected.currency) return setMessage('Fiyatı Tanımlı Bir Ürün Seçin.');
    const size=quickProduct?1:packSize;
    if(count*size>100000)return setMessage('Toplam Ürün Adedi 100000 Sınırını Aşamaz.');
    const floor=size===1?selected.amount:selected.packs?.find(pack=>pack.size===size)?.amount;
    if(floor===undefined||floor===null)return setMessage('Bu Paket İçin Fiyat Tanımlanmamış.');
    const amount = !quickProduct && priceOverride ? Number(priceOverride) : Number(floor);
    if (!Number.isFinite(amount) || amount < Number(floor)) return setMessage('Satış Fiyatı Bayi Fiyatının Altında Olamaz.');
    if (!Number.isInteger(count) || count < 1 || count > 100000) return setMessage('Geçerli Bir Adet Girin.');
    if (selected.available_quantity !== undefined && count*size > selected.available_quantity) return setMessage('Bu alım için yeterli stok yok.');
    const replacingId=quickProduct?null:editingItemId;
    if (items.some(row => row.productId === selected.id && row.productId !== replacingId)) return setMessage('Bu Ürün Zaten Siparişte Bulunuyor.');
    if (items.some(row => row.currency !== selected.currency)) return setMessage('Farklı Para Birimleri İçin Ayrı Sipariş Oluşturun.');
    const nextItem={ productId: selected.id, quantity: count*size, packSize:size===1?undefined:size, packAmount:size===1?undefined:amount.toFixed(2), baseAmount:floor, unitAmount:amount.toFixed(2), currency: selected.currency! };
    setItems(current => replacingId?current.map(row=>row.productId===replacingId?nextItem:row):[...current,nextItem]);
    setEditingItemId(null);
    setPriceOverride(''); setPackSize(1);
    setForm(current => ({ ...current, productId: '', quantity: 1 })); setMessage(''); setTab('Yeni Sipariş');
  }
  async function action(work: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : 'İşlem Tamamlanamadı.'); } finally { actionLock.current = false; setBusy(false); }
  }
  function updateQuantity(productId: string, quantity: number) {
    if (actionLock.current) return;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000 || items.some(row=>row.productId===productId&&row.packSize&&quantity%row.packSize!==0)) return setMessage('Adet 1 İle 100000 Arasında Olmalı Ve Seçilen Paket Adedinin Katı Olmalı.');
    setItems(current => current.map(row => row.productId === productId ? { ...row, quantity } : row));
    setMessage('');
  }
  function editItem(row:Item) {
    if(actionLock.current||!ready)return;
    setEditingItemId(row.productId);setPackSize(row.packSize??1);
    setPriceOverride(row.packAmount??row.unitAmount);
    setForm(current=>({...current,productId:row.productId,quantity:row.quantity/(row.packSize??1)}));
    setMessage('');setTab('Yeni Sipariş');
    document.getElementById('bayi-urun-secimi')?.scrollIntoView({block:'center',behavior:'smooth'});
  }
  function cancelItemEdit() {
    setEditingItemId(null);setPackSize(1);setPriceOverride('');
    setForm(current=>({...current,productId:'',quantity:1}));
  }
  function exportHistory() {
    if (!ready || !validRange || busy) return;
    const period = [['Başlangıç Tarihi', dateFrom || 'Tüm Tarihler'], ['Bitiş Tarihi', dateTo || 'Tüm Tarihler'], ['Bayi Kodu', summary?.code ?? ''], []];
    if (tab === 'Siparişlerim') {
      const totals = currencyTotals(shownOrders.filter(row => !['CANCELLED', 'REFUNDED'].includes(row.status)).map(row => ({ currency: row.currency, amount: row.net_amount ?? row.total_amount })));
      downloadXlsx('bayi-siparislerim.xlsx', 'Siparişlerim', [...period,
        ['Sipariş No', 'Tarih', 'Sipariş Tutarı', 'İade', 'İade Sonrası Tutar', 'Para Birimi', 'Durum', 'Alıcı', 'Ürünler ve Adetleri', 'Takip Numarası'],
        ...shownOrders.map(row => [row.order_number, date(row.created_at), Number(row.total_amount), Number(row.refunded_amount ?? 0), Number(row.net_amount ?? row.total_amount), row.currency, statuses[row.status] ?? row.status, row.recipient_name??'', dealerOrderProductsLabel(row), row.tracking_number??'']),
        [], ['Net Sipariş Toplamı'], ...totals.map(row => ['Toplam', '', '', '', Number(row.amount), row.currency]),
      ]);
    } else if (tab === 'Kargo Takibi') {
      downloadXlsx('bayi-kargo-takibi.xlsx','Kargo Takibi',[...period,
        ['Sipariş','Kayıt Tarihi','Kargo Firması','Takip Numarası','Durum','Son Kontrol'],
        ...shownShipments.map(row=>[row.order_number,date(row.created_at),row.provider==='aras'?'Aras Kargo':row.provider,row.tracking_number??'',statuses[row.status]??row.status,row.tracking_checked_at?date(row.tracking_checked_at):'Henüz Kontrol Edilmedi']),
      ]);
    } else if (tab === 'Cari Hesabım') {
      const debit = currencyTotals(shownLedger.filter(row => row.direction === 'DEBIT').map(row => ({ currency: row.currency, amount: row.amount })));
      const credit = currencyTotals(shownLedger.filter(row => row.direction === 'CREDIT').map(row => ({ currency: row.currency, amount: row.amount })));
      downloadXlsx('bayi-cari-hareketler.xlsx', 'Cari Hareketler', [...period,
        ['Tarih', 'İşlem', 'Tutar', 'Para Birimi', 'Açıklama'],
        ...shownLedger.map(row => [date(row.created_at), row.direction === 'DEBIT' ? 'Borç' : 'Alacak', Number(row.amount), row.currency, row.description]),
        [], ['Seçilen Dönemin Hareket Toplamları; Tüm Dönem Bakiyesi Değildir'],
        ...debit.map(row => ['Borç Toplamı', row.currency, Number(row.amount)]), ...credit.map(row => ['Alacak Toplamı', row.currency, Number(row.amount)]),
      ]);
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!ready) return setMessage('Sipariş Vermeden Önce Bilgileri Yenileyin.');
    if (currencyChange) return setMessage('Para birimi değişikliğini tamamlayın veya vazgeçin.');
    if (editingItemId) return setMessage('Siparişi oluşturmadan önce ürün değişikliğini kaydedin veya düzenlemeden vazgeçin.');
    if (!items.length) return setMessage('Siparişe En Az Bir Ürün Ekleyin.');
    if (insufficientCommission) return setMessage('Primle ödeme için kullanılabilir priminiz siparişin tamamına yetmeli.');
    if (!items.every(item => item.currency === form.currency)) return setMessage('Sipariş ve ürün fiyatları aynı para biriminde olmalı.');
    const insufficient = items.find(item=>{
      const stock = options.products.find(product=>product.id===item.productId)?.available_quantity;
      return stock !== undefined && item.quantity > stock;
    });
    if (insufficient) return setMessage('Sepette stok miktarını aşan ürün var. Adedi güncelleyip tekrar deneyin.');
    if (!options.warehouses[0]) return setMessage('Genel Stok Tanımı Bulunamadı. Yöneticiyle İletişime Geçin.');
    await action(async () => {
      const {productId:_selection,quantity:_count,...delivery}=form;
      const body = JSON.stringify({ ...delivery,codServiceFee:form.paymentMethod.startsWith('COD_')?Number(codServiceFee):undefined, warehouseId: options.warehouses[0].id, currency: items[0].currency, items: items.map(({ productId, quantity, unitAmount,packSize,packAmount }) => ({ productId, quantity,packSize,packAmount:packSize?Number(packAmount):undefined, unitAmount:packSize?undefined:Number(unitAmount) })), priceChangeReason: 'Bayi Portalı Fiyatı' });
      if (pendingOrder.current?.body !== body) pendingOrder.current = { body, key: crypto.randomUUID() };
      const result = await api<CreatedOrder>('/dealer-portal/orders', { method: 'POST', headers: { 'Idempotency-Key': pendingOrder.current.key }, body });
      pendingOrder.current = null;
      setCreatedOrder(result);
      setEditingItemId(null);
      setItems([]); setForm({ ...initial, currency:form.currency, paymentMethod:form.paymentMethod, contactEmail: email }); setCodServiceFee('75'); setTab('Siparişlerim');
      await refreshAfterAction(`${result.order_number} Numaralı Sipariş Oluşturuldu.`);
    });
  }
  return <main className={styles.page}>
    <header className={styles.header}><div><p>Bayi Paneli</p><h1>{summary?.company_name || 'Bayi Paneli'}</h1><p>{summary?.code} · {email}</p>{summary?.level_name&&<span className={styles.levelBadge}><span aria-hidden="true">★</span> {summary.level_name}</span>}</div><div className={styles.actions}><button type="button" className="secondary" disabled={busy} onClick={() => void action(load)}>Bilgileri Yenile</button><button type="button" className="secondary" onClick={() => void action(async () => { try { await logout(); } finally { clearToken(); window.location.assign('/giris'); } })}>Güvenli Çıkış</button></div></header>
    {message && <p role="status" className="notice">{message}</p>}
    {createdOrder&&<section className={styles.orderResult} aria-label="Son oluşturulan sipariş">
  <div><h2>Siparişiniz kaydedildi</h2><p><strong>{createdOrder.order_number}</strong> · {money(createdOrder.total_amount,createdOrder.currency)} · {statuses[createdOrder.status]??createdOrder.status}</p></div>
  <div className={styles.actions}>
    <button type="button" disabled={busy||!ready} onClick={()=>void openOrder(createdOrder.id)}>Sipariş Detayını Aç</button>
    <button type="button" className="secondary" disabled={busy} onClick={()=>{setCreatedOrder(null);setTab('Yeni Sipariş');}}>Yeni Siparişe Geç</button>
    <button type="button" className="secondary" onClick={()=>setCreatedOrder(null)}>Bildirimi Kapat</button>
  </div>
</section>}
{cancelCandidate&&<section id="bayi-iptal-onayi" className={styles.cancelConfirmation} role="alertdialog" aria-labelledby="bayi-iptal-basligi" aria-describedby="bayi-iptal-aciklamasi" tabIndex={-1}>
  <h2 id="bayi-iptal-basligi">{cancelCandidate.order_number} · Sipariş iptali</h2>
  <p id="bayi-iptal-aciklamasi">Bu siparişi iptal etmek istediğinizi onaylayın. Stok ve varsa kullanılan prim bakiyesi işlem sırasında güncellenir.</p>
  {!orders.some(row=>row.id===cancelCandidate.id&&row.can_cancel)&&<p role="status">Siparişin durumu değiştiği için iptal işlemi kullanılamıyor. Güncel detayını kontrol edin.</p>}
  <div className={styles.actions}>
    <button type="button" disabled={busy||!orders.some(row=>row.id===cancelCandidate.id&&row.can_cancel)} onClick={()=>void confirmCancellation()}>{busy?'İşleniyor…':'İptali Onayla'}</button>
    <button type="button" className="secondary" disabled={busy} onClick={()=>setCancelCandidate(null)}>Vazgeç</button>
  </div>
</section>}
<section className={styles.cards} aria-label="Hesap Özeti"><article><h2>Siparişlerim</h2><strong>{summary?.order_count ?? '—'}</strong></article><article><h2>Kullanılabilir Prim</h2>{available.length ? available.map(row => <strong key={row.currency}>{money(row.amount, row.currency)}</strong>) : <p>Kayıt Bulunmuyor.</p>}<small>Tüm Kesinleşen Ve Kullanılabilir Kayıtlar</small></article><article><h2>Cari Bakiye</h2>{balances.length ? balances.map(row => <strong key={row.currency}>{money(row.amount, row.currency)}</strong>) : <p>Kayıt Bulunmuyor.</p>}</article></section>
    <nav className={styles.tabs} aria-label="Bayi Paneli Bölümleri">{tabs.map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => {setTab(value);setHistoryStatus('ALL');}}>{value}</button>)}</nav>
    {['Siparişlerim', 'Cari Hesabım', 'Kargo Takibi'].includes(tab) && <section className={styles.box} aria-label="Tarih Filtresi"><div className={styles.grid}><label>Başlangıç Tarihi<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label><label>Bitiş Tarihi<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label><button type="button" className="secondary" onClick={() => { setDateFrom(''); setDateTo(''); }}>Tarihleri Temizle</button><button type="button" onClick={exportHistory} disabled={!ready || busy || !validRange || (tab === 'Siparişlerim' ? !shownOrders.length : tab==='Kargo Takibi' ? !shownShipments.length : !shownLedger.length)}>Excel&apos;e Aktar</button></div><p>Filtreler tablolara, sipariş grafiklerine ve Excel raporuna uygulanır. Üstteki hesap bakiyeleri tüm dönemleri kapsar.</p>{!validRange && <p role="alert">Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz.</p>}</section>}
    {['Siparişlerim','Kargo Takibi'].includes(tab)&&<section className={styles.box} aria-label="Sipariş arama ve durum filtresi">
  <div className={styles.grid}>
    <label>{tab==='Kargo Takibi'?'Sipariş veya takip numarası':'Sipariş, alıcı veya ürün ara'}<input type="search" value={historyQuery} onChange={event=>setHistoryQuery(event.target.value)} placeholder={tab==='Kargo Takibi'?'Sipariş veya takip numarası':'Sipariş, alıcı, ürün, SKU veya takip numarası'}/></label>
    <label>Durum<select value={historyStatus} onChange={event=>setHistoryStatus(event.target.value)}>
      <option value="ALL">Tüm durumlar</option>
      {(tab==='Siparişlerim'?['PENDING_PAYMENT','PAID','PROCESSING','REGISTERED','SHIPPED','DELIVERED','CARRIER_RETURN','REFUNDED','CANCELLED']:['REGISTERED','SHIPPED','DELIVERED','CARRIER_RETURN','FAILED','CANCELLED']).map(value=><option key={value} value={value}>{statuses[value]??value}</option>)}
    </select></label>
    <button type="button" className="secondary" onClick={()=>{setHistoryQuery('');setHistoryStatus('ALL');}}>Aramayı Temizle</button>
  </div>
  <p>{tab==='Siparişlerim'?shownOrders.length:shownShipments.length} kayıt gösteriliyor. Açık ekran 30 saniyede bir yenilenir.</p>
  {historyError&&<p className="notice" role="alert">{historyError} Son yüklenen kayıtlar gösteriliyor.</p>}
</section>}
{ready&&trackingOrder&&['Siparişlerim','Kargo Takibi'].includes(tab)&&<TrackingPanel orderId={trackingOrder} onClose={()=>setTrackingOrder(null)}/>}
{!ready ? <section className={styles.box}><p>Bayi Bilgileri Bekleniyor.</p></section> : <>
    {tab === 'Siparişlerim' && orderDetail && <OrderDetails order={orderDetail} onClose={()=>setOrderDetail(null)}
      onTrack={()=>openTracking(orderDetail.id)} onOpenCommissions={()=>{setTab('Primlerim');requestAnimationFrame(()=>document.getElementById('bayi-prim-ekrani')?.focus());}}/>}
    {tab === 'Yeni Sipariş' && <section className={styles.box}><h2>Yeni Bayi Siparişi</h2>{!ready ? <p role="status">Sipariş Bilgileri Hazır Değil. Bilgileri Yenile Düğmesini Kullanın.</p> : !summary?.agreement_accepted_at ? <><p>Sipariş Vermek İçin Bayilik Sözleşmesini Kabul Edin. IBAN Bilgisi İsteğe Bağlıdır.</p><button disabled={busy} onClick={() => void action(async () => { await api('/dealer-portal/agreement/accept', { method: 'POST' }); await refreshAfterAction('Bayilik Sözleşmesi Kabul Edildi.'); })}>Sözleşmeyi Kabul Ediyorum</button></> : <form onSubmit={event => void create(event)}><fieldset disabled={busy} className={styles.orderFields}>
      <div className={styles.grid}>{([['recipientName', 'Alıcı Adı'], ['contactEmail', 'E-Posta'], ['phone', 'Telefon'], ['city', 'İl'], ['district', 'İlçe'], ['postalCode', 'Posta Kodu']] as const).map(([key, label]) => <label key={key}>{label}<input required={key !== 'postalCode'} type={key === 'contactEmail' ? 'email' : 'text'} value={form[key]} onChange={event => change(key, event.target.value)} /></label>)}<label>Ödeme Yöntemi<select value={form.paymentMethod} disabled={busy} onChange={event => void changePayment(event.target.value,['TRANSFER','HAND_CASH'].includes(event.target.value)?form.currency:'TRY')}><option value="TRANSFER">Havale / EFT</option><option value="COMMISSION">Kesinleşmiş Primimle Öde</option><option value="COD_CASH">Kapıda Nakit</option><option value="COD_CARD">Kapıda Kart</option><option value="HAND_CASH">Elden Tahsilat</option></select></label><label>Para Birimi<select disabled={busy||!['TRANSFER','HAND_CASH'].includes(form.paymentMethod)} value={form.currency} onChange={event=>void changePayment(form.paymentMethod,event.target.value)}><option value="TRY">TL</option><option value="EUR">Euro</option><option value="USD">Dolar</option></select></label>{form.currency!=='TRY'&&<p>Ortak Kur: 1 {form.currency} = {options.exchangeRate} TL · Sipariş Kaydında Güncel Kur Doğrulanır.</p>}{form.paymentMethod.startsWith('COD_')&&<label>Kapıda Ödeme Hizmet Bedeli (TL)<input type="number" min="0" max="9999999999.99" step="0.01" required value={codServiceFee} onChange={e=>setCodServiceFee(e.target.value)}/></label>}{form.paymentMethod.startsWith('COD_')&&<div role="note" style={{gridColumn:'1 / -1',padding:16,border:'1px solid #cbd5e1',borderRadius:8,background:'#f8fafc',color:'#0f172a'}}><strong>Aras Kapıda Ödeme</strong><p>Tahsilat: {form.paymentMethod==='COD_CARD'?'Kredi Kartı':'Nakit'} · Kargo Ücreti: Gönderici Ödemeli</p><p>Ürünler Ve Hizmet Bedeli Müşteriden Birlikte Tahsil Edilir.</p></div>}<label className={styles.full}>Açık Adres<textarea required value={form.addressLine} onChange={event => change('addressLine', event.target.value)} /></label></div>{currencyChange && <div className="notice"><p>Para birimi {currencyChange.currency} olarak değiştiğinde sepetteki ürünler temizlenecek.</p><div className={styles.actions}><button type="button" onClick={() => void changePayment(currencyChange.method,currencyChange.currency,true)}>Değiştir ve sepeti temizle</button><button type="button" className="secondary" onClick={() => setCurrencyChange(null)}>Vazgeç</button></div></div>}
      {product&&<section className={styles.box}><h3>{product.name} · Seviyene Özel Alım Fiyatları</h3>{product.available_quantity!==undefined&&<p>Satılabilir stok {product.available_quantity} adet</p>}<div className={styles.grid}><div><b>Tekli</b><p>{product.amount!==null?money(product.amount,product.currency || form.currency):'Tanımlanmamış'}</p></div>{product.packs?.map(pack=>{const currency=product.currency || form.currency;const summary=dealerPackSummary({...pack,currency},product.amount!==null?{amount:product.amount,currency}:undefined,pack.size);return <div key={pack.size}><b>{pack.size}’li Toplam</b><p>{money(pack.amount,currency)}</p>{summary&&<small>Adet Başına: {summary.unitPrice}{summary.saving&&<><br/>{summary.saving} Tasarruf</>}</small>}</div>;})}</div></section>}
      <h3 id="bayi-urun-secimi">{editingItemId?'Sepetteki Ürünü Düzenle':'Ürün Ekle'}</h3><div className={styles.grid}><label>Ürün<select value={form.productId} onChange={event => { change('productId', event.target.value); setPriceOverride('');setPackSize(1); }}><option value="">Ürün Seçin</option>{options.products.filter(row => row.amount !== null).map(row => <option key={row.id} value={row.id}>{row.name} · {money(row.amount!, row.currency || 'TRY')}</option>)}</select></label><label>Alım Seçeneği<select value={packSize} onChange={event=>{setPackSize(Number(event.target.value));setPriceOverride('');}}><option value="1">Tekli</option>{product?.packs?.map(pack=><option key={pack.size} value={pack.size}>{pack.size}’li · {money(pack.amount,product?.currency || form.currency)} Toplam</option>)}</select></label><label>{packSize===1?'Adet':'Paket Adedi'}<input type="number" min="1" max="100000" value={form.quantity} onChange={event => change('quantity', Number(event.target.value))} /></label><label>{packSize===1?'Satış Birim Fiyatı':'Satış Paket Toplam Fiyatı'}<input type="number" min={selectedBase ?? 0} step="0.01" value={priceOverride} placeholder={selectedBase ?? 'Önce Ürün Seçin'} onChange={event => setPriceOverride(event.target.value)} /></label><div className={styles.actions}>{packSize>1&&Number.isInteger(form.quantity)&&form.quantity>0&&<small>{form.quantity} Paket × {packSize} Adet = {form.quantity*packSize} Adet · Tek Sipariş</small>}<button type="button" disabled={busy} onClick={() => addItem()}>{editingItemId?'Değişikliği Kaydet':'Siparişe Ekle'}</button>{editingItemId&&<button type="button" className="secondary" onClick={cancelItemEdit}>Düzenlemeden Vazgeç</button>}</div></div>
      <div className={styles.table}><table><thead><tr><th>Ürün</th><th>Ürün Adedi</th><th>Satış Fiyatı</th><th>Satır Toplamı</th><th>İşlem</th></tr></thead><tbody>{items.map(row => <tr key={row.productId}><td>{options.products.find(p => p.id === row.productId)?.name}</td><td><input aria-label={`${options.products.find(p => p.id === row.productId)?.name ?? 'Ürün'} Adedi`} type="number" min={row.packSize??1} step={row.packSize??1} max="100000" value={row.quantity} disabled={busy||editingItemId===row.productId} onChange={event => updateQuantity(row.productId, Number(event.target.value))} />{row.packSize&&<small>{row.quantity/row.packSize} Paket × {row.packSize} Adet = {row.quantity} Adet</small>}</td><td>{row.packSize?`${row.packSize}’li Paket: `:''}{money(row.packAmount??row.unitAmount, row.currency)}</td><td>{money(lineTotal(row), row.currency)}</td><td><div className={styles.actions}><button type="button" className="secondary" disabled={busy} onClick={()=>editItem(row)}>Düzenle</button><button type="button" className="secondary" disabled={busy} onClick={() => {setItems(current => current.filter(item => item.productId !== row.productId));if(editingItemId===row.productId)cancelItemEdit();}}>Çıkar</button></div></td></tr>)}{!items.length && <tr><td colSpan={5}>Henüz Ürün Eklenmedi.</td></tr>}</tbody></table></div><div className={styles.actions}>{totals.map(row => <strong key={row.currency}>Ürünler: {money(row.amount, row.currency)} · Hizmet: {money(form.paymentMethod.startsWith('COD_')?codServiceFee:'0',row.currency)} · Toplam: {money((Number(row.amount)+(form.paymentMethod.startsWith('COD_')?Number(codServiceFee):0)).toFixed(2),row.currency)}</strong>)}{estimatedMargin.map(row => <strong key={row.currency}>Tahmini Bayi Primi: {money(row.amount,row.currency)}</strong>)}<small>Seviye Fiyatının Üstündeki Farktır. Prim Teslimatta Kesinleşir.</small>
{form.paymentMethod==='COMMISSION'&&<div className={styles.paymentSummary} role="status">
  <strong>Kullanılabilir prim {money(commissionBalance)}</strong>
  {insufficientCommission?<p>Bu sipariş için {money(commissionRemainder.slice(1))} prim eksik. Başka bir ödeme yöntemi seçebilirsiniz.</p>:<p>Sipariş sonrası kullanılabilir prim {money(commissionRemainder)}</p>}
  <small>Kaydetme sırasında güncel bakiye yeniden kontrol edilir.</small>
</div>}
<button type="submit" disabled={busy || !items.length || currencyChange !== null || insufficientCommission || editingItemId !== null}>{busy ? 'İşleniyor…' : 'Siparişi Oluştur'}</button></div></fieldset>
    </form>}</section>}
    {tab === 'Ürünler' && <ProductCatalog products={options.products} currency={form.currency} busy={busy} onSingle={row=>addItem(row)}
      onPack={(row,size)=>{setEditingItemId(null);setForm(current=>({...current,productId:row.id,quantity:1}));setPackSize(size);setPriceOverride('');setTab('Yeni Sipariş');}}/>}
    {tab === 'Siparişlerim' && <div><div className="chart-controls"><label>Grafik Para Birimi<select value={chartCurrency} onChange={e=>setChartCurrency(e.target.value)}>{[...new Set(['TRY',...orders.map(row=>row.currency)])].map(c=><option key={c} value={c}>{c}</option>)}</select></label></div><div className="analytics-grid"><MetricChart loading={!ready&&!message} unavailable={!ready&&!!message} title="Aylık Sipariş Tutarlarım" description="Son 6 Ay · Tablo Filtresi Uygulanır · Kısmi İadeler Düşülür · İptal Ve Tam İadeler Hariç" currency={chartCurrency} data={monthlySeries(shownOrders.filter(row=>!['CANCELLED','REFUNDED'].includes(row.status)).map(row=>({created_at:row.created_at,amount:row.net_amount??row.total_amount,currency:row.currency})),chartCurrency,dateTo?new Date(dateTo+'T12:00:00+03:00'):new Date())}/><MetricChart loading={!ready&&!message} unavailable={!ready&&!!message} title="Sipariş Durumlarım" description="Tablodaki Tarih Filtresine Göre · Tüm Para Birimlerinde Sipariş Adedi" variant="ring" data={Object.entries(shownOrders.reduce<Record<string,number>>((map,row)=>{const label=statuses[row.status]??row.status;map[label]=(map[label]??0)+1;return map;},{})).map(([label,value])=>({label,value}))}/></div></div>}
    {tab === 'Siparişlerim' && <section className={styles.box}><h2>Siparişlerim</h2>
      <div className={styles.table}><table className={styles.orderHistory}><thead><tr><th>Sipariş</th><th>Alıcı ve ürünler</th><th>Tutar</th><th>Durum</th><th>İşlemler</th></tr></thead><tbody>
        {shownOrders.map(row=><tr key={row.id}>
          <td><button type="button" className="secondary" disabled={busy} onClick={()=>void openOrder(row.id)}>{row.order_number} · Detay</button><small>{date(row.created_at)}</small></td>
          <td><strong>{row.recipient_name||'Alıcı bilgisi bulunamadı'}</strong>
            {row.items?.length?<ul className={styles.orderProducts}>{row.items.map(item=><li key={item.id}><span>{item.product_name}</span><b>{item.quantity} adet</b></li>)}</ul>:<small>Ürün bilgileri için detayı açın.</small>}
          </td>
          <td>{money(row.total_amount,row.currency)}{refundSummary(row)}</td>
          <td><span className={styles.statusBadge}>{statuses[row.status]??row.status}</span>{row.tracking_number&&<small>Takip: {row.tracking_number}</small>}</td>
          <td><div className={styles.orderActions}>
            {['REGISTERED','SHIPPED','DELIVERED','CARRIER_RETURN'].includes(row.status)&&<button type="button" className="secondary" onClick={()=>openTracking(row.id)}>Kargo Hareketleri</button>}
            {row.can_cancel&&<button type="button" disabled={busy} onClick={()=>{setCancelCandidate(row);requestAnimationFrame(()=>document.getElementById('bayi-iptal-onayi')?.focus());}}>Siparişi İptal Et</button>}
          </div></td>
        </tr>)}
        {!shownOrders.length&&<tr><td colSpan={5}>Seçilen filtrelere uygun sipariş bulunmuyor.</td></tr>}
      </tbody></table></div>
    </section>}
    {tab === 'Kargo Takibi' && <section className={styles.box}><h2>Kargo Kayıtlarım</h2><p>Şube kabulü sonrasında alınan takip numarası ve son kargo durumu burada gösterilir. Ayrıntılar için hareketleri açın.</p><div className={styles.table}><table><thead><tr><th>Sipariş</th><th>Kayıt Tarihi</th><th>Kargo Firması</th><th>Takip Numarası</th><th>Kayıt Durumu</th><th>Son Kontrol</th></tr></thead><tbody>{shownShipments.map(row => <tr key={row.id}><td>{row.order_number}{row.order_id&&<button type="button" className="secondary" onClick={()=>{if(row.order_id)openTracking(row.order_id);}}>Hareketleri Gör</button>}</td><td>{date(row.created_at)}</td><td>{row.provider==='aras'?'Aras Kargo':row.provider}</td><td>{row.tracking_number || 'Henüz Oluşmadı'}</td><td>{statuses[row.status] ?? row.status}</td><td>{row.tracking_checked_at?date(row.tracking_checked_at):'Henüz Kontrol Edilmedi'}{row.tracking_error&&<small>{row.tracking_error}</small>}</td></tr>)}{!shownShipments.length && <tr><td colSpan={6}>Seçilen filtrelere uygun kargo kaydı bulunmuyor.</td></tr>}</tbody></table></div></section>}
    {tab === 'Primlerim' && <WalletPanel view={walletView} onViewChange={setWalletView} hasPrimaryIban={summary?.has_primary_iban} onChange={()=>void refreshAccountSummary()} onOpenOrder={id=>void openOrder(id)}/>}
    {tab === 'Cari Hesabım' && <section className={styles.box}><h2>Cari Hesap Hareketlerim</h2><div className={styles.table}><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Tutar</th><th>Açıklama</th></tr></thead><tbody>{shownLedger.map(row => <tr key={row.id}><td>{date(row.created_at)}</td><td>{row.direction === 'DEBIT' ? 'Borç' : 'Alacak'}</td><td>{money(row.amount, row.currency)}</td><td>{row.description || '—'}</td></tr>)}{!shownLedger.length && <tr><td colSpan={4}>Seçilen Tarihlerde Cari Hareket Bulunmuyor.</td></tr>}</tbody></table></div></section>}
    </>}
  </main>;
}
