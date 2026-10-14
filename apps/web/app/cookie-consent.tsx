'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const key = 'trex_cookie_consent_v1';
const panel = { position: 'fixed' as const, zIndex: 50, left: '1rem', right: '1rem', bottom: '1rem', maxWidth: '760px', margin: 'auto', padding: '1rem 1.2rem', display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', background: '#fff', color: '#4b0a78', border: '1px solid #d6b2e5', boxShadow: '0 18px 48px #4b0a7840' };
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(!window.localStorage.getItem(key)); }, []);
  function choose(value: 'necessary' | 'all') { window.localStorage.setItem(key, JSON.stringify({ value, acceptedAt: new Date().toISOString() })); setVisible(false); }
  if (!visible) return null;
  return <aside style={panel} aria-label="Çerez tercihleri"><div><strong>Çerez tercihlerin</strong><p style={{ margin: '.4rem 0', fontSize: '.9rem', lineHeight: 1.4 }}>Mağazanın çalışması için zorunlu çerezler kullanılır. İsteğe bağlı çerezler için seçimini kaydedebilirsin.</p><Link style={{ textDecoration: 'underline', fontSize: '.9rem' }} href="/yasal">Gizlilik ve yasal metinler</Link></div><div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', justifyContent: 'end' }}><button type="button" onClick={() => choose('necessary')}>Sadece zorunlu</button><button type="button" style={{ background: 'linear-gradient(135deg,#580681,#a82fd0)', borderColor: '#580681', color: '#fff' }} onClick={() => choose('all')}>Tümünü kabul et</button></div></aside>;
}
