'use client';

import { currencyTotals } from '../lib/report-totals';
import { financeDateTime } from '../lib/finance-report';
import { paymentLabel } from '../lib/payment-label';
import styles from './portal.module.css';

export type DealerOrderDetail = {
  id:string;order_number:string;status:string;total_amount:string;currency:string;created_at:string;
  cod_service_fee?:string;refunded_amount?:string;net_amount?:string;has_shipment?:boolean;
  payment_method?:string|null;payment_status?:string|null;payment_amount?:string|null;
  payment_currency?:string|null;payment_verified_at?:string|null;
  items:{id:string;product_name:string;sku:string;quantity:number;unit_amount:string;line_total:string}[];
  address:{recipient_name:string;phone:string;city:string;district:string;address_line:string;postal_code:string|null}|null;
  returns?:{id:string;status:string;requested_at:string;completed_at:string|null;quantity:number;refund_amount:string|null;refund_currency:string|null;refunded_to_wallet?:boolean}[];
  commissions?:{id:string;order_item_id:string|null;amount:string;currency:string;status:string;entry_kind:string;created_at:string;available_at:string|null;note:string|null}[];
  deductions?:{id:string;amount:string;currency:string;note:string;created_at:string}[];
};
const money=(amount:string,currency:string)=>Number(amount).toLocaleString('tr-TR',{style:'currency',currency});
const orderStatuses:Record<string,string>={PENDING_PAYMENT:'Ödeme bekliyor',PAID:'Onaylandı',PROCESSING:'Hazırlanıyor',REGISTERED:'Kargo kaydı hazır',SHIPPED:'Kargoda',DELIVERED:'Teslim edildi',CARRIER_RETURN:'Kargo iadesi',CANCELLED:'İptal edildi',REFUNDED:'İade edildi'};
const paymentStatuses:Record<string,string>={PENDING:'Ödeme bekliyor',INITIATED:'Başlatıldı',SUCCEEDED:'Ödeme doğrulandı',FAILED:'Başarısız',REFUNDED:'Geri ödendi',CANCELLED:'İptal edildi'};
const returnStatuses:Record<string,string>={REQUESTED:'Talep alındı',APPROVED:'Onaylandı',REJECTED:'Reddedildi',RECEIVED:'Teslim alındı',INSPECTED:'İncelendi',REFUNDED:'Geri ödeme tamamlandı',CANCELLED:'İptal edildi'};
const commissionStatuses:Record<string,string>={PENDING:'Teslimat bekliyor',CONFIRMED:'Kesinleşti',AVAILABLE:'Kullanılabilir',PAID:'Ödendi',REVERSED:'Geri alındı',USED:'Kullanıldı',RESERVED:'Ayrıldı'};

export function OrderDetails({order,onClose,onTrack,onOpenCommissions}:{
  order:DealerOrderDetail;onClose:()=>void;onTrack:()=>void;onOpenCommissions:()=>void;
}) {
  const commissions=order.commissions??[];
  const deductions=order.deductions??[];
  const pending=currencyTotals(commissions.filter(row=>row.status==='PENDING').map(row=>({currency:row.currency,amount:row.amount})));
  const settled=currencyTotals([
    ...commissions.filter(row=>row.status!=='PENDING').map(row=>({currency:row.currency,amount:row.amount})),
    ...deductions.map(row=>({currency:row.currency,amount:'-'+row.amount})),
  ]);
  const feeTotals=currencyTotals(deductions);
  return <section className={styles.box} aria-label="Sipariş detayı">
    <div className={styles.header}>
      <div><h2>Sipariş {order.order_number}</h2><p>{financeDateTime(order.created_at)}</p><span className={styles.statusBadge}>{orderStatuses[order.status]??order.status}</span></div>
      <div className={styles.actions}>
        {order.has_shipment&&<button type="button" onClick={onTrack}>Kargo Hareketleri</button>}
        <button type="button" className="secondary" onClick={onOpenCommissions}>Primlerimi Aç</button>
        <button type="button" className="secondary" onClick={onClose}>Detayı Kapat</button>
      </div>
    </div>
    <div className={styles.table}><table><thead><tr><th>Sipariş toplamı</th><th>Hizmet bedeli</th><th>İade edilen tutar</th><th>İade sonrası tutar</th></tr></thead><tbody><tr>
      <td>{money(order.total_amount,order.currency)}</td><td>{money(order.cod_service_fee??'0',order.currency)}</td>
      <td>{money(order.refunded_amount??'0',order.currency)}</td><td>{money(order.net_amount??order.total_amount,order.currency)}</td>
    </tr></tbody></table></div>
    <h3>Ödeme</h3>
    <div className={styles.table}><table><thead><tr><th>Ödeme yöntemi</th><th>Durum</th><th>Tutar</th><th>Doğrulama zamanı</th></tr></thead><tbody><tr>
      <td>{paymentLabel(order.payment_method)}</td><td>{order.payment_status?paymentStatuses[order.payment_status]??order.payment_status:'Ödeme kaydı yok'}</td>
      <td>{order.payment_amount!==undefined&&order.payment_amount!==null?money(order.payment_amount,order.payment_currency??order.currency):'—'}</td>
      <td>{order.payment_verified_at?financeDateTime(order.payment_verified_at):'—'}</td>
    </tr></tbody></table></div>
    <h3>Teslimat bilgileri</h3>
    {order.address?<div className={styles.grid}>
      <p><b>Alıcı</b><br/>{order.address.recipient_name}</p><p><b>Telefon</b><br/>{order.address.phone}</p>
      <p><b>Adres</b><br/>{order.address.address_line}, {order.address.district} / {order.address.city} {order.address.postal_code}</p>
    </div>:<p>Teslimat bilgisi bulunamadı.</p>}
    <h3>Ürünler</h3>
    <div className={styles.table}><table><thead><tr><th>Ürün</th><th>SKU</th><th>Adet</th><th>Sipariş birim fiyatı</th><th>Satır toplamı</th></tr></thead><tbody>
      {order.items.map(item=><tr key={item.id}><td>{item.product_name}</td><td>{item.sku}</td><td>{item.quantity}</td><td>{money(item.unit_amount,order.currency)}</td><td>{money(item.line_total,order.currency)}</td></tr>)}
    </tbody></table></div>
    <h3>Bu siparişten primim</h3>
    <div className={styles.cards}>
      <article><h4>Kesinleşmiş net prim</h4>{settled.length?settled.map(row=><strong key={row.currency}>{money(row.amount,row.currency)}</strong>):<p>Kesinleşmiş hareket yok.</p>}</article>
      <article><h4>Bekleyen prim</h4>{pending.length?pending.map(row=><strong key={row.currency}>{money(row.amount,row.currency)}</strong>):<p>Bekleyen hareket yok.</p>}</article>
      <article><h4>İade kargo kesintisi</h4>{feeTotals.length?feeTotals.map(row=><strong key={row.currency}>{money(row.amount,row.currency)}</strong>):<p>Kesinti yok.</p>}</article>
    </div>
    <p>Kullanılabilir toplam bakiyenizi Primlerim bölümünden görebilirsiniz.</p>
    <div className={styles.table}><table><thead><tr><th>Prim tarihi</th><th>Ürün</th><th>Prim hareketi</th><th>Durum</th><th>Açıklama</th></tr></thead><tbody>
      {commissions.map(row=><tr key={row.id}><td>{financeDateTime(row.entry_kind==='REVERSAL'?row.created_at:row.available_at??row.created_at)}</td><td>{order.items.find(item=>item.id===row.order_item_id)?.product_name??'Sipariş primi'}</td>
        <td>{money(row.amount,row.currency)}</td><td>{row.entry_kind==='REVERSAL'?'Prim ters kaydı':commissionStatuses[row.status]??row.status}</td><td>{row.note??'—'}</td></tr>)}
      {deductions.map(row=><tr key={'fee-'+row.id}><td>{financeDateTime(row.created_at)}</td><td>İade kargosu</td><td>−{money(row.amount,row.currency)}</td><td>Kesinti</td><td>{row.note}</td></tr>)}
      {!commissions.length&&!deductions.length&&<tr><td colSpan={5}>Bu sipariş için henüz prim hareketi kaydedilmemiş.</td></tr>}
    </tbody></table></div>
    {!!order.returns?.length&&<>
      <h3>İade hareketleri</h3><div className={styles.table}><table><thead><tr><th>Talep tarihi</th><th>Adet</th><th>Durum</th><th>Geri ödenen tutar</th><th>Tamamlanma</th></tr></thead><tbody>
        {order.returns.map(row=><tr key={row.id}><td>{financeDateTime(row.requested_at)}</td><td>{row.quantity}</td><td>{returnStatuses[row.status]??row.status}</td>
          <td>{row.refund_amount&&row.refund_currency?money(row.refund_amount,row.refund_currency):'—'}{row.refunded_to_wallet&&<small>Prim bakiyesine döndü</small>}</td>
          <td>{row.completed_at?financeDateTime(row.completed_at):'—'}</td></tr>)}
      </tbody></table></div>
    </>}
  </section>;
}
