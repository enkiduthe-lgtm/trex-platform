import './globals.css';
import type { Metadata } from 'next';
import { CookieConsent } from './cookie-consent';
export const metadata: Metadata = { title: 'Trex Tea Yönetim Portalı', description: 'Trex Tea bayi ve yönetim operasyon portalı', metadataBase: new URL('https://www.trextea.com.tr') };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="tr"><body>{children}<CookieConsent /></body></html>; }
