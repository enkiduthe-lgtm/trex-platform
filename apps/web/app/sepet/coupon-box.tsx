'use client';
import { useEffect, useState } from 'react';

const couponKey = 'trex_coupon_code';

export function CouponBox() {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => setCode(window.localStorage.getItem(couponKey) ?? ''), []);

  function prepare() {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      window.localStorage.removeItem(couponKey);
      setMessage('Önce kupon kodunu yazmalısın.');
      return;
    }
    window.localStorage.setItem(couponKey, normalized);
    setCode(normalized);
    setMessage('Kupon ödeme adımına eklendi. İndirim, stok ve sipariş tutarı doğrulanırken uygulanacak.');
  }

  return <div className="coupon"><label htmlFor="coupon">İndirim kodun var mı?</label><div><input id="coupon" value={code} onChange={event=>setCode(event.target.value.toUpperCase())} placeholder="Örn. TREX10" maxLength={64}/><button type="button" onClick={prepare}>Uygula</button></div>{message&&<p role="status">{message}</p>}<small>Kupon, sipariş tamamlanmadıkça kullanım hakkından düşmez.</small></div>;
}
