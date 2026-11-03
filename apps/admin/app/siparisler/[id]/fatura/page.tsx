'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

export default function InvoiceDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setMessage('');
    void api<{ ready: boolean; url?: string }>(`/admin/orders/${id}/invoice/pdf`, { cache: 'no-store' }).then(result => {
      if (cancelled) return;
      if (!result.ready || !result.url) { setMessage('Fatura PDF’si Henüz Hazır Değil. Bir Süre Sonra Tekrar Deneyin.'); return; }
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Güvenli Fatura Bağlantısı Alınamadı.');
      window.location.replace(url.href);
    }).catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Fatura Açılamadı.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, retry]);
  return <main><section className="table-card"><h1>Fatura Yazdır</h1>
    <p role="status">{loading ? 'Paraşüt Fatura PDF’si Açılıyor…' : message || 'Fatura PDF’sine Yönlendiriliyorsunuz…'}</p>
    <p>PDF Açıldığında Belgenin Yazdır Düğmesini Kullanın. Bu İşlem Yeni Fatura Oluşturmaz.</p>
    <div className="button-row">{!loading && message && <button onClick={() => setRetry(value => value + 1)}>Tekrar Dene</button>}
      <Link href={`/siparisler/${id}#fatura`}>Fatura Hazırlığına Dön</Link><Link href="/siparisler">Siparişlere Dön</Link>
    </div></section></main>;
}
