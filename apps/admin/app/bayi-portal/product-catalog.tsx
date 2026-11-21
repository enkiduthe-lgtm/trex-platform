'use client';

import { useState } from 'react';
import { dealerPackSummary } from '../lib/dealer-pack-summary';
import styles from './portal.module.css';

export type PortalProduct = {
  id:string;name:string;sku:string;amount:string|null;currency:string|null;
  available_quantity?:number;description?:string|null;image_url?:string|null;
  packs?:{size:number;amount:string}[];
};
const money=(amount:string,currency:string)=>Number(amount).toLocaleString('tr-TR',{style:'currency',currency});

export function ProductCatalog({products,currency,busy,onSingle,onPack}:{
  products:PortalProduct[];currency:string;busy:boolean;
  onSingle:(product:PortalProduct)=>void;onPack:(product:PortalProduct,size:number)=>void;
}) {
  const [search,setSearch]=useState('');
  const [failedImages,setFailedImages]=useState<Record<string,string>>({});
  const shown=products.filter(product=>(product.name+' '+product.sku).toLocaleLowerCase('tr-TR').includes(search.trim().toLocaleLowerCase('tr-TR')));
  return <section className={styles.box}>
    <h2>Ürünler ve Bayi Fiyatları</h2>
    <label>Ürün ara<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Ürün adı veya SKU"/></label>
    <div className={styles.catalogGrid}>
      {shown.map(product=>{
        const priceCurrency=product.currency??currency;
        const hasStock=product.available_quantity===undefined||product.available_quantity>0;
        return <article className={styles.productCard} key={product.id}>
          <div className={styles.productImage}>
            {product.image_url&&failedImages[product.id]!==product.image_url?
              <img src={product.image_url} alt={product.name} loading="lazy" onError={()=>setFailedImages(current=>({...current,[product.id]:product.image_url!}))}/>:
              <span>{product.image_url?'Görsel yüklenemedi':'Ürün görseli eklenmemiş'}</span>}
          </div>
          <div className={styles.productContent}>
            <h3>{product.name}</h3><small>{product.sku}</small>
            {product.available_quantity!==undefined&&<p className={styles.stockLabel}>{hasStock?product.available_quantity+' adet stokta':'Stokta yok'}</p>}
            <div className={styles.priceChoices}>
              <div><span>Tekli alım</span><strong>{product.amount===null?'Fiyat tanımlanmamış':money(product.amount,priceCurrency)}</strong>
                <button type="button" disabled={busy||product.amount===null||!hasStock} onClick={()=>onSingle(product)}>1 Adet Ekle</button>
              </div>
              {[2,3,5].map(size=>{
                const pack=product.packs?.find(row=>row.size===size);
                const advantage=pack?dealerPackSummary({...pack,currency:priceCurrency},product.amount!==null?{amount:product.amount,currency:priceCurrency}:undefined,size):null;
                return <div key={size}><span>{size}’li paket toplamı</span><strong>{pack?money(pack.amount,priceCurrency):'Fiyat tanımlanmamış'}</strong>
                  {advantage&&<small>Adet başına {advantage.unitPrice}{advantage.saving&&<><br/>{advantage.saving} tasarruf</>}</small>}
                  {pack&&<button type="button" disabled={busy||product.amount===null||!hasStock||product.available_quantity!==undefined&&product.available_quantity<size} onClick={()=>onPack(product,size)}>{size}’li Paketi Seç</button>}
                </div>;
              })}
            </div>
            {product.amount===null&&<p className={styles.stockLabel}>Sipariş için tekli bayi seviye fiyatı da tanımlanmalıdır. Fiyat tanımı için yöneticiyle iletişime geçin.</p>}
            <details className={styles.productDescription}><summary>Ürün bilgileri</summary><p>{product.description?.trim()||'Bu ürün için açıklama eklenmemiş.'}</p></details>
          </div>
        </article>;
      })}
    </div>
    {!shown.length&&<p role="status">Aramanıza uygun ürün bulunmuyor.</p>}
  </section>;
}
