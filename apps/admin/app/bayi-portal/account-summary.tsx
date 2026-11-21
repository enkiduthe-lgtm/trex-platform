import styles from './portal.module.css';
type Total={currency:string;amount:string};
const money=(row:Total)=>Number(row.amount).toLocaleString('tr-TR',{style:'currency',currency:row.currency});
export function AccountSummary({ready,loading,orderCount,available,balances}:{ready:boolean;loading:boolean;orderCount?:string;available:Total[];balances:Total[]}){
 const totals=(rows:Total[])=>!ready?<p>{loading?'Yükleniyor…':'Bilgiler alınamadı.'}</p>:
  rows.length?rows.map(row=><strong key={row.currency}>{money(row)}</strong>):<p>Kayıt bulunmuyor.</p>;
 return <section className={styles.cards} aria-label="Hesap Özeti" aria-busy={loading}>
  <article><h2>Siparişlerim</h2><strong>{ready?orderCount??'—':'—'}</strong></article>
  <article><h2>Kullanılabilir Prim</h2>{totals(available)}<small>Tüm kesinleşen ve kullanılabilir kayıtlar</small></article>
  <article><h2>Cari Bakiye</h2>{totals(balances)}</article>
 </section>;
}
