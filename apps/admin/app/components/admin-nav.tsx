"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, logout } from "../lib/api";

type Entry = { label: string; href: string };
type Menu = { label: string; href: string; icon: string; groups: { title: string; entries: Entry[] }[] };
const menus: Menu[] = [
  { label: "PRİMLER", href: "/primler/yonetim", icon: "reports", groups: [{ title: "Prim İşlemleri", entries: [{ label: "Prim Ayarları Ve Hakedişler", href: "/primler/yonetim" }, { label: "Önceki Prim Kayıtları", href: "/primler" }, { label: "Bayi Prim Talepleri", href: "/primler/bayi" }] }] },
  { label: "FİNANS", href: "/finans", icon: "finance", groups: [{ title: "Finans Operasyonu", entries: [{ label: "Finans Özeti", href: "/finans" }, { label: "Mutabakat Raporu", href: "/finans/mutabakat" }, { label: "Finans Uyarıları", href: "/finans/uyarilar" }, { label: "Masraflar", href: "/finans/masraflar" }, { label: "Kargo Tahsilat Planı", href: "/finans/kargo-tahsilat" }, { label: "PayTR Kasası", href: "/finans/paytr" }, { label: "Prim Yönetimi", href: "/primler/yonetim" }, { label: "Bayi Prim Talepleri", href: "/primler/bayi" }, { label: "Kârlılık", href: "/karlilik" }] }] },
  { label: "STOK", href: "/stok", icon: "stock", groups: [{ title: "Stok Yönetimi", entries: [{ label: "Stok Ve Envanter", href: "/stok" }, { label: "Kargo İşlemleri", href: "/kargo" }] }] },
  { label: "SİPARİŞLER", href: "/siparisler", icon: "orders", groups: [{ title: "Sipariş Durumları", entries: [{ label: "Tüm Siparişler", href: "/siparisler" }, { label: "Onay Bekleyenler", href: "/siparisler?durum=PENDING_PAYMENT" }, { label: "Onaylananlar", href: "/siparisler?durum=PAID" }, { label: "Hazırlananlar", href: "/siparisler?durum=PROCESSING" }, { label: "Kargo Kaydı Hazır", href: "/siparisler?durum=REGISTERED" }, { label: "Kargolananlar", href: "/siparisler?durum=SHIPPED" }, { label: "Teslim Edilenler", href: "/siparisler?durum=DELIVERED" }, { label: "İade Edilenler", href: "/siparisler?durum=REFUNDED" }, { label: "İade Talepleri", href: "/iadeler" }, { label: "İptal Edilenler", href: "/siparisler?durum=CANCELLED" }] }, { title: "Operasyon", entries: [{ label: "Hızlı Satış", href: "/siparisler/yeni" }, { label: "Bekleyen Havale Eşleştirme", href: "/siparisler/havaleler" }] }] },
  { label: "ÜRÜNLER", href: "/urunler", icon: "products", groups: [{ title: "Ürün Yönetimi", entries: [{ label: "Ürünler", href: "/urunler" }] }, { title: "Ürün İşlemleri", entries: [{ label: "Toplu Ürün Güncelleme", href: "/urunler?islem=toplu" }, { label: "İçe / Dışa Aktarma", href: "/urunler?islem=aktar" }] }] },
  { label: "PAZARYERİ", href: "/pazaryeri", icon: "marketplace", groups: [{ title: "Kanallar", entries: [{ label: "Mağazalar", href: "/pazaryeri" }] }, { title: "Senkronizasyon", entries: [{ label: "Ürün eşleştirmeleri", href: "/pazaryeri/eslestirmeler" }, { label: "Ürün gönderimleri", href: "/pazaryeri/gonderimler" }, { label: "Fiyat rekabeti analizi", href: "/pazaryeri/fiyat-rekabeti" }] }] },
  { label: "KAMPANYALAR", href: "/kampanyalar", icon: "campaigns", groups: [{ title: "Fiyatlandırma", entries: [{ label: "Kampanya yönetimi", href: "/kampanyalar" }, { label: "Hediye çekleri", href: "/kampanyalar?tab=coupons" }, { label: "Hızlı indirimler", href: "/kampanyalar?tab=discounts" }, { label: "E-posta ve SMS bültenleri", href: "/bildirimler" }] }] },
  { label: "BAYİLER", href: "/bayiler", icon: "customers", groups: [{ title: "Bayi Yönetimi", entries: [{ label: "Bayiler", href: "/bayiler" }, { label: "Bayi Başvuruları", href: "/bayiler?sekme=basvurular" }, { label: "Bayi Seviyeleri Ve Fiyatlar", href: "/bayiler?sekme=bayiler#seviyeler" }, { label: "Bayi Satış Raporu", href: "/bayiler/satis-raporu" }] }] },
  { label: "MÜŞTERİLER", href: "/musteriler", icon: "customers", groups: [{ title: "Müşteri Yönetimi", entries: [{ label: "Müşteriler", href: "/musteriler" }, { label: "Cari Ve Bakiye", href: "/cari" }] }, { title: "İletişim", entries: [{ label: "Müşteri Talepleri", href: "/destek" }, { label: "Müşteri Grupları", href: "/musteriler?tab=gruplar" }] }] },
  { label: "RAPORLAR", href: "/raporlar", icon: "reports", groups: [{ title: "Analiz", entries: [{ label: "Rapor Merkezi", href: "/raporlar" }, { label: "Özel Rapor", href: "/raporlar/ozel" }, { label: "Satış Raporu", href: "/raporlar/satis" }] }] },
  { label: "ARAÇLAR", href: "/yonetim/araclar", icon: "tools", groups: [{ title: "Sistem", entries: [{ label: "Araçlar merkezi", href: "/yonetim/araclar" }, { label: "Bildirimler", href: "/bildirimler" }, { label: "Muhasebe / ERP", href: "/yonetim/araclar?tab=erp" }, { label: "Eklentiler", href: "/yonetim/araclar?tab=eklentiler" }] }] },
  { label: "AYARLAR", href: "/yonetim/ayarlar", icon: "settings", groups: [{ title: "Yönetim", entries: [{ label: "Genel ayarlar", href: "/yonetim/ayarlar?tab=genel" }, { label: "Sipariş ayarları", href: "/yonetim/ayarlar?tab=siparis" }, { label: "İade ayarları", href: "/yonetim/ayarlar?tab=iade" }, { label: "Ürün ayarları", href: "/yonetim/ayarlar?tab=urun" }, { label: "Müşteri ayarları", href: "/yonetim/ayarlar?tab=musteri" }, { label: "Bayi ayarları", href: "/yonetim/ayarlar?tab=bayi" }, { label: "Bayi XML ayarları", href: "/yonetim/ayarlar?tab=xml" }, { label: "Bayi API ayarları", href: "/yonetim/ayarlar?tab=api" }, { label: "Personeller ve yetkiler", href: "/personel" }, { label: "Güvenlik ve iki aşamalı doğrulama", href: "/yonetim/guvenlik" }, { label: "Sistem bütünlüğü", href: "/yonetim/sistem-durumu" }, { label: "İşlem kayıtları", href: "/islem-kayitlari" }, { label: "Bakım modu", href: "/yonetim/ayarlar?tab=bakim" }] }] },
];
function NavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6"/></>,
    finance: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 14h3"/></>, stock: <><path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/></>,
    orders: <><path d="M4 7h16l-1 13H5L4 7Z"/><path d="M8 7a4 4 0 0 1 8 0M8 12h8"/></>, products: <><path d="M5 8h14v11H5z"/><path d="M7 5h10v3M8 12h8M8 16h5"/></>,
    marketplace: <><path d="M4 9h16v11H4z"/><path d="M3 9 5 4h14l2 5M8 20v-6h8v6"/></>, campaigns: <><path d="M4 10h16v10H4z"/><path d="M12 10v10M4 14h16M12 10c-3 0-4-1.2-4-2.5S9 5 12 10Zm0 0c3 0 4-1.2 4-2.5S15 5 12 10Z"/></>,
    customers: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-4 2.5-6 5.5-6s5 2 5.5 6M16 6a3 3 0 0 1 0 5.8M16 14c2.4.2 4 2.1 4.5 5"/></>, design: <><path d="m5 19 11-11 3 3L8 22H5v-3Z"/><path d="m14 6 2-2 3 3-2 2"/></>,
    reports: <><path d="M5 20V10M10 20V4M15 20v-7M20 20V7"/><path d="M3 20h19"/></>, tools: <><path d="m14 6 4-4 2 2-4 4"/><path d="m13 7-8 8v4h4l8-8M15 15l4 4M17 13l4 4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7L10.5 2h-3l-.7 2.3-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2.3.7v3l2.3.7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2.3h3l.7-2.3 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7 2.3-.7Z"/></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.settings}</svg>;
}
const ownerOnlyMenus = new Set(["FİNANS", "RAPORLAR", "AYARLAR"]);
const navResources:Record<string,string>={"FİNANS":"FINANCE","RAPORLAR":"REPORTS","PRİMLER":"COMMISSIONS","STOK":"STOCK","SİPARİŞLER":"ORDERS","ÜRÜNLER":"PRODUCTS","BAYİLER":"DEALERS","MÜŞTERİLER":"CUSTOMERS","PAZARYERİ":"MARKETPLACE","KAMPANYALAR":"CAMPAIGNS","TASARIM":"CONTENT","ARAÇLAR":"NOTIFICATIONS"};
const managerMenuKey: Record<string, string> = { "SİPARİŞLER": "ORDERS", "STOK": "STOCK", "ÜRÜNLER": "PRODUCTS", "PAZARYERİ": "MARKETPLACE", "KAMPANYALAR": "CAMPAIGNS", "BAYİLER": "CUSTOMERS", "MÜŞTERİLER": "CUSTOMERS", "TASARIM": "DESIGN", "ARAÇLAR": "TOOLS" };
function active(pathname: string, menu: Menu) { return pathname === menu.href || (menu.href !== "/" && pathname.startsWith(menu.href + "/")) || menu.groups.some(g => g.entries.some(e => e.href.split("?")[0].split("#")[0] === pathname)); }
function NavigationMenu({menu,current,open,onOpen,onClose}:{menu:Menu;current:boolean;open:boolean;onOpen:()=>void;onClose:()=>void}) {
 const host=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState({left:12,top:100,width:240,maxHeight:400,above:false});
 const place=useCallback(()=>{
  const rect=host.current?.getBoundingClientRect();if(!rect)return false;
  if(rect.bottom<=0||rect.top>=window.innerHeight){onClose();return false;}
  const width=Math.min(menu.groups.length>1?340:240,Math.max(120,window.innerWidth-24));
  const below=window.innerHeight-rect.bottom-12,above=rect.top-12;
  const flip=below<180&&above>below;
  setPosition({left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:flip?rect.top+1:rect.bottom-1,width,maxHeight:Math.max(40,flip?above:below),above:flip});return true;
 },[menu.groups.length,onClose]);
 const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const cancelClose = useCallback(() => {
   if (closeTimer.current !== null) clearTimeout(closeTimer.current);
   closeTimer.current = null;
 }, []);
 useEffect(() => cancelClose, [cancelClose]);
 const show = () => {
   cancelClose();
   if (place()) onOpen();
 };
 const leave = () => {
   cancelClose();
   closeTimer.current = setTimeout(onClose, 180);
 };
 useEffect(()=>{if(!open)return;const update=(event:Event)=>{if(event.target instanceof Node&&host.current?.querySelector('.nav-dropdown')?.contains(event.target))return;place();};const outside=(event:PointerEvent)=>{if(!host.current?.contains(event.target as Node))onClose();};window.addEventListener('resize',update);window.addEventListener('scroll',update,true);document.addEventListener('pointerdown',outside);return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);document.removeEventListener('pointerdown',outside);};},[open,place,onClose]);
 return <div ref={host} className={`nav-menu ${current?'active':''}`} data-open={open} onMouseEnter={show} onMouseLeave={leave} onFocusCapture={show} onBlurCapture={event=>{if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget))onClose();}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.currentTarget.querySelector('a')?.focus();onClose();}}}>
  <Link href={menu.href} aria-expanded={open} aria-controls={'nav-popup-'+menu.href.replaceAll('/','-')}><i><NavIcon name={menu.icon}/></i>{menu.label}<small>⌄</small></Link>
  <div id={'nav-popup-'+menu.href.replaceAll('/','-')} className="nav-dropdown" style={{position:'fixed',left:position.left,top:position.top,right:'auto',width:position.width,maxHeight:position.maxHeight,transform:position.above?'translateY(-100%)':'none',gridTemplateColumns:menu.groups.length>1?'repeat(2,minmax(0,1fr))':'1fr'}}>{menu.groups.map(group=><section key={group.title}><h3>{group.title}</h3>{group.entries.map(entry=><Link href={entry.href} key={entry.label} onClick={onClose}>{entry.label}</Link>)}</section>)}</div>
 </div>;
}
function AdminNavContent() {
 const [accessProfile,setAccessProfile]=useState<{configured:boolean;grants:string[]|null}|null|undefined>(undefined);
 useEffect(()=>{let active=true;void api<{configured:boolean;grants:string[]|null}>('/admin/access/me').then(result=>{if(active)setAccessProfile(result);}).catch(()=>{if(active)setAccessProfile(null);});return()=>{active=false};},[]);
 const [openMenu,setOpenMenu]=useState<string|null>(null);
 const router=useRouter(); const pathname=usePathname(); const searchParams=useSearchParams(); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [panelSearch,setPanelSearch]=useState(""); const [role,setRole]=useState(""); const [managerMenu,setManagerMenu]=useState<Record<string,boolean>>({}); const lock=useRef(false);
 useEffect(()=>{setOpenMenu(null);},[pathname,searchParams]);
 useEffect(()=>{let active=true;api<{user:{role:string}}>("/auth/me").then(async result=>{if(!active)return;setRole(result.user.role);if(result.user.role==="ADMIN"){try{const menu=await api<Record<string,boolean>>("/admin/settings/manager-menu");if(active)setManagerMenu(menu);}catch{if(active)setManagerMenu({});}}}).catch(()=>{if(active)setRole("")});return()=>{active=false};},[]);
 useEffect(()=>{if(!role||role==='ADMIN'&&accessProfile===undefined)return; if(role==='DEALER'&&pathname!=='/bayi-portal'){router.replace('/bayi-portal');return;} const current=menus.find(menu=>active(pathname,menu)); const managerCollectionScreen=pathname==='/finans/havaleler';const granted=role==='ADMIN'&&current&&accessProfile?.configured&&accessProfile.grants?.includes((navResources[current.label]??'')+'.VIEW');if(role!=='SUPER_ADMIN'&&current&&ownerOnlyMenus.has(current.label)&&!managerCollectionScreen&&!granted)router.replace('/urunler');},[role,pathname,router,accessProfile]);
 const visibleMenus=useMemo(()=>menus.filter(menu=>{if(role==='SUPER_ADMIN')return true;if(role==='ADMIN'&&accessProfile?.configured){const resource=navResources[menu.label];return !!resource&&!!accessProfile.grants?.includes(resource+'.VIEW');}if(menu.label==='PRİMLER')return ['ADMIN','FINANCE'].includes(role);if(ownerOnlyMenus.has(menu.label))return false;const key=managerMenuKey[menu.label];return role!=="ADMIN"||!key||managerMenu[key]!==false;}),[role,managerMenu,accessProfile]);
 const searchEntries=useMemo(()=>[{label:"Ana sayfa",href:"/panel"},...visibleMenus.flatMap(m=>[{label:m.label,href:m.href},...m.groups.flatMap(g=>g.entries)])],[visibleMenus]);
 function submit(e:FormEvent){e.preventDefault(); const q=panelSearch.trim().toLocaleLowerCase("tr-TR"); const match=searchEntries.find(x=>x.label.toLocaleLowerCase("tr-TR").includes(q)); if(!q)return; if(!match){setError("Panel aramasında eşleşen bir bölüm bulunamadı.");return;} setError("");setPanelSearch("");router.push(match.href);}
 async function signOut(){if(lock.current)return;lock.current=true;setBusy(true);try{await logout();router.replace("/giris");router.refresh();}catch{setError("Çıkış tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.");}finally{lock.current=false;setBusy(false);}}
 return <header className="admin-header"><div className="header-main"><Link className="header-brand" href="/panel"><img src="/brand/trex-tea-logo.png" alt="TREX Tea"/><span>YÖNETİM PANELİ</span></Link><form className="panel-search" onSubmit={submit}><input aria-label="Panelde ara" value={panelSearch} onChange={e=>setPanelSearch(e.target.value)} placeholder="Panelde ara"/><button type="submit" aria-label="Panelde ara"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></svg></button></form><div className="header-links"><a href="https://www.trextea.com.tr" target="_blank" rel="noreferrer">Siteyi görüntüle ↗</a><Link href="/bildirimler">● Bildirimler</Link><button disabled={busy} onClick={()=>void signOut()}>{busy?"Çıkış yapılıyor…":"Çıkış"}</button></div></div>{error&&<p role="alert">{error}</p>}<nav className="header-nav" aria-label="Yönetim menüsü"><Link className={pathname==="/panel"?"active":""} href="/panel"><i><NavIcon name="home"/></i> ANA SAYFA</Link>{visibleMenus.map(menu=><NavigationMenu key={menu.label} menu={menu} current={active(pathname,menu)} open={openMenu===menu.href} onOpen={()=>setOpenMenu(menu.href)} onClose={()=>setOpenMenu(value=>value===menu.href?null:value)}/>)}</nav></header>;
}
export function AdminNav(){return <Suspense fallback={<header className="admin-header" aria-label="Yönetim menüsü"/>}><AdminNavContent/></Suspense>;}
