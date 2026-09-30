import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Trex Tea', description: 'Trex Tea online mağaza', metadataBase: new URL('https://www.trextea.com.tr') };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="tr"><body>{children}</body></html>; }
