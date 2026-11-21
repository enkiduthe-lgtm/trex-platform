'use client';
import type {DealerDeliveryCandidate} from '../lib/dealer-delivery-reuse';
import styles from './portal.module.css';
export function DeliveryReuseDialog({candidate,busy,onConfirm,onCancel}:{candidate:DealerDeliveryCandidate;busy:boolean;onConfirm:()=>void;onCancel:()=>void}){
 const {delivery,sourceOrderNumber}=candidate;
 return <section id="bayi-alici-kullan" className={styles.box} role="alertdialog" aria-labelledby="bayi-alici-baslik" aria-describedby="bayi-alici-aciklama" tabIndex={-1}>
  <h2 id="bayi-alici-baslik">{sourceOrderNumber} · Alıcı bilgilerini kullan</h2>
  <p id="bayi-alici-aciklama">Mevcut teslimat bilgileri aşağıdaki alıcıyla değiştirilecek. Sepetinizdeki ürünler ve satış fiyatları korunur. Bildirim e-postası bayi adresiniz olacak.</p>
  <div className={styles.grid}><p><b>Alıcı</b><br/>{delivery.recipientName}</p><p><b>Telefon</b><br/>{delivery.phone}</p><p><b>E-posta</b><br/>{delivery.contactEmail}</p><p className={styles.full}><b>Teslimat adresi</b><br/>{delivery.addressLine}, {delivery.district} / {delivery.city} {delivery.postalCode}</p></div>
  <p>Yeni siparişi kaydetmeden önce alıcı, adres ve e-posta bilgilerini kontrol edin.</p>
  <div className={styles.actions}><button type="button" disabled={busy} onClick={onConfirm}>Alıcıyı Kullan ve Yeni Siparişe Geç</button><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Vazgeç</button></div>
 </section>;
}
