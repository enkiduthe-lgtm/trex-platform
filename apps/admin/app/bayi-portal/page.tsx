'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, clearToken, logout } from '../lib/api';

type Me = { user: { email: string; role: string } };

export default function DealerPortal() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<Me>('/auth/me').then(({ user }) => {
      if (user.role !== 'DEALER') { setError('Bu alan yalnızca bayi hesapları içindir.'); return; }
      setEmail(user.email);
    }).catch(() => setError('Oturum bulunamadı. Lütfen yeniden giriş yapın.'));
  }, []);
  async function exit() { try { await logout(); } finally { clearToken(); window.location.assign('/giris'); } }
  return <main><section><p>BAYİ PORTALI</p><h1>Bayi portalı</h1>{email && <p>Hoş geldiniz, {email}</p>}<p>Bayi hesabınız aktiftir. Ürün, sipariş, cari hesap ve prim işlemleriniz bu portalda yönetilecektir.</p>{error ? <><p role="alert">{error}</p><Link href="/giris">Girişe dön</Link></> : <><div className="cards"><article><h2>Yeni sipariş</h2><p>Size tanımlı fiyatlarla sipariş oluşturma alanı hazırlanıyor.</p></article><article><h2>Siparişlerim</h2><p>Hazırlanan, kargolanan ve teslim edilen siparişleriniz burada listelenecek.</p></article><article><h2>Primlerim</h2><p>Hak ediş, onay ve ödeme durumlarınız burada görüntülenecek.</p></article><article><h2>Cari hesabım</h2><p>Bakiye, tahsilat ve vade hareketlerinizi buradan takip edeceksiniz.</p></article></div><button className="secondary" type="button" onClick={() => void exit()}>Güvenli çıkış</button></>}</section></main>;
}
