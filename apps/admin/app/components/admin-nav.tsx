"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useRef, useState } from "react";
import { logout } from "../lib/api";

type Entry = { label: string; href?: string };
type Menu = {
  label: string;
  href?: string;
  icon: string;
  groups?: { title: string; entries: Entry[] }[];
};
const menus: Menu[] = [
  {
    label: "ETİKETLER",
    href: "/etiketler",
    icon: "🏷️",
    groups: [
      {
        title: "Barkod ve yazdırma",
        entries: [
          { label: "Ürün etiketi", href: "/etiketler" },
          { label: "Stok yönetimi", href: "/stok" },
          { label: "Kargo işlemleri", href: "/kargo" },
        ],
      },
    ],
  },
  {
    label: "FİNANS",
    href: "/finans",
    icon: "💳",
    groups: [
      {
        title: "Finans operasyonu",
        entries: [
          { label: "Finans özeti", href: "/finans" },
          { label: "Finans uyarıları", href: "/finans/uyarilar" },
          { label: "Bekleyen havaleler", href: "/finans/havaleler" },
          { label: "Masraflar", href: "/finans/masraflar" },
          { label: "Bütçe ve nakit akışı", href: "/finans/butce" },
          { label: "PayTR kasası", href: "/finans/paytr" },
          { label: "Prim yönetimi", href: "/primler" },
        ],
      },
    ],
  },
  {
    label: "STOK / DEPO",
    href: "/stok",
    icon: "🏭",
    groups: [
      {
        title: "Yönetim",
        entries: [
          { label: "Stok girişi", href: "/stok" },
          { label: "Toplama ve paketleme", href: "/depo-operasyon" },
          { label: "Satın alma", href: "/satinalma" },
          { label: "Stok silme", href: "/stok#stok-silme" },
          { label: "Depo silme", href: "/stok#depo-silme" },
          { label: "Ürün silme", href: "/urunler" },
        ],
      },
    ],
  },
  {
    label: "SİPARİŞLER",
    href: "/siparisler",
    icon: "📦",
    groups: [
      {
        title: "Sipariş durumları",
        entries: [
          { label: "Tüm siparişler", href: "/siparisler" },
          {
            label: "Onay bekleyenler",
            href: "/siparisler?durum=PENDING_PAYMENT",
          },
          { label: "Hazırlananlar", href: "/siparisler?durum=PROCESSING" },
          { label: "Kargolananlar", href: "/siparisler?durum=SHIPPED" },
          {
            label: "Teslim edilenler",
            href: "/siparisler?durum=DELIVERED",
          },
          { label: "İade talepleri", href: "/iadeler" },
          { label: "İptal edilenler", href: "/siparisler?durum=CANCELLED" },
        ],
      },
      {
        title: "Operasyon",
        entries: [
          { label: "Hızlı satış", href: "/siparisler/yeni" },
          { label: "Depo ve stok", href: "/stok" },
          { label: "Kargo işlemleri", href: "/kargo" },
          { label: "Havale bildirimleri", href: "/finans/havaleler" },
          { label: "Sipariş etiketleri", href: "/etiketler" },
        ],
      },
    ],
  },
  {
    label: "ÜRÜNLER",
    href: "/urunler",
    icon: "🍵",
    groups: [
      {
        title: "Katalog",
        entries: [
          { label: "Ürünler", href: "/urunler" },
          { label: "Kategoriler", href: "/katalog/categories" },
          { label: "Markalar", href: "/katalog/brands" },
          { label: "Etiketler", href: "/katalog/tags" },
          { label: "Nitelikler", href: "/katalog/attributes" },
          { label: "Stok birimleri", href: "/katalog/units" },
        ],
      },
      {
        title: "Ürün işlemleri",
        entries: [
          { label: "Stok yönetimi", href: "/stok" },
          { label: "Ürün görselleri", href: "/medya" },
          { label: "Fiyat ve kârlılık", href: "/karlilik" },
          { label: "Toplu ürün güncelleme", href: "/urunler" },
          { label: "İçe / dışa aktarma", href: "/urunler" },
        ],
      },
    ],
  },
  {
    label: "PAZARYERİ",
    href: "/pazaryeri",
    icon: "🛍️",
    groups: [
      {
        title: "Kanallar",
        entries: [
          { label: "Mağazalar", href: "/pazaryeri" },
          { label: "Bayi satış kanalı", href: "/toptan" },
        ],
      },
      {
        title: "Senkronizasyon",
        entries: [
          { label: "Ürün eşleştirmeleri", href: "/pazaryeri/eslestirmeler" },
          { label: "Ürün gönderimleri", href: "/pazaryeri/gonderimler" },
          {
            label: "Fiyat rekabeti analizi",
            href: "/pazaryeri/fiyat-rekabeti",
          },
        ],
      },
    ],
  },
  {
    label: "KAMPANYALAR",
    href: "/kampanyalar",
    icon: "🎁",
    groups: [
      {
        title: "Fiyatlandırma",
        entries: [
          { label: "Kampanya yönetimi", href: "/kampanyalar" },
          { label: "Hediye çekleri", href: "/kampanyalar?tab=coupons" },
          {
            label: "Hızlı indirimler",
            href: "/kampanyalar?tab=discounts",
          },
          { label: "Bayi indirimleri", href: "/bayiler" },
          { label: "E-posta ve SMS bültenleri", href: "/bildirimler" },
        ],
      },
    ],
  },
  {
    label: "MÜŞTERİLER",
    href: "/musteriler",
    icon: "👥",
    groups: [
      {
        title: "Müşteri yönetimi",
        entries: [
          { label: "Müşteriler", href: "/musteriler" },
          { label: "Bayiler", href: "/bayiler" },
          { label: "Cari ve bakiye", href: "/cari" },
        ],
      },
      {
        title: "İletişim",
        entries: [
          { label: "Bildirim merkezi", href: "/bildirimler" },
          { label: "Müşteri talepleri", href: "/destek" },
          { label: "Müşteri grupları", href: "/musteriler" },
        ],
      },
    ],
  },
  {
    label: "TASARIM",
    href: "/yonetim/tasarim",
    icon: "🎨",
    groups: [
      {
        title: "Mağaza",
        entries: [
          { label: "Tasarım merkezi", href: "/yonetim/tasarim" },
          { label: "İçerikler", href: "/icerikler" },
          { label: "Medya merkezi", href: "/medya" },
          { label: "SEO optimizasyonu", href: "/yonetim/tasarim" },
        ],
      },
      {
        title: "İçerik",
        entries: [
          { label: "Bannerlar ve görseller", href: "/medya" },
          { label: "Sayfalar", href: "/icerikler" },
          { label: "Yasal metinler", href: "/icerikler/yasal" },
          { label: "Yönlendirmeler", href: "/yonetim/tasarim" },
        ],
      },
    ],
  },
  {
    label: "RAPORLAR",
    href: "/raporlar",
    icon: "📊",
    groups: [
      {
        title: "Analiz",
        entries: [
          { label: "Rapor merkezi", href: "/raporlar" },
          { label: "Kârlılık raporu", href: "/karlilik" },
          { label: "Satış performansı", href: "/raporlar" },
          { label: "Stok raporları", href: "/stok" },
        ],
      },
    ],
  },
  {
    label: "ARAÇLAR",
    href: "/yonetim/araclar",
    icon: "🧰",
    groups: [
      {
        title: "Entegrasyonlar",
        entries: [
          { label: "Araçlar merkezi", href: "/yonetim/araclar" },
          { label: "Ödeme yöntemleri", href: "/finans" },
          { label: "Kargo ve teslimat", href: "/stok" },
          { label: "Pazaryeri bağlantıları", href: "/pazaryeri" },
        ],
      },
      {
        title: "Sistem",
        entries: [
          { label: "Bildirimler", href: "/bildirimler" },
          { label: "Muhasebe / ERP", href: "/yonetim/araclar" },
          { label: "Eklentiler", href: "/yonetim/araclar" },
        ],
      },
    ],
  },
  {
    label: "AYARLAR",
    href: "/yonetim/ayarlar",
    icon: "⚙️",
    groups: [
      {
        title: "Yönetim",
        entries: [
          { label: "Genel ayarlar", href: "/yonetim/ayarlar?tab=genel" },
          { label: "Sipariş ayarları", href: "/yonetim/ayarlar?tab=siparis" },
          { label: "İade ayarları", href: "/yonetim/ayarlar?tab=iade" },
          { label: "Ürün ayarları", href: "/yonetim/ayarlar?tab=urun" },
          { label: "Müşteri ayarları", href: "/yonetim/ayarlar?tab=musteri" },
          { label: "Bayi ayarları", href: "/yonetim/ayarlar?tab=bayi" },
          { label: "Bayi XML ayarları", href: "/yonetim/ayarlar?tab=xml" },
          { label: "Bayi API ayarları", href: "/yonetim/ayarlar?tab=api" },
          { label: "Personeller ve yetkiler", href: "/personel" },
          {
            label: "Güvenlik ve iki aşamalı doğrulama",
            href: "/yonetim/guvenlik",
          },
          { label: "Sistem bütünlüğü", href: "/yonetim/sistem-durumu" },
          { label: "İşlem kayıtları", href: "/islem-kayitlari" },
          { label: "Bildirim ayarları", href: "/bildirimler" },
          { label: "Bakım modu", href: "/yonetim/ayarlar?tab=bakim" },
        ],
      },
      {
        title: "Ticari",
        entries: [
          { label: "Mağaza ayarları", href: "/yonetim/ayarlar?tab=genel" },
          { label: "Para birimleri", href: "/yonetim/ayarlar?tab=genel" },
          { label: "Yazdırma etiketleri", href: "/yonetim/ayarlar" },
        ],
      },
    ],
  },
];
function active(pathname: string, menu: Menu) {
  return (
    Boolean(
      menu.href &&
      (pathname === menu.href ||
        (menu.href !== "/" && pathname.startsWith(`${menu.href}/`))),
    ) ||
    Boolean(
      menu.groups?.some((g) => g.entries.some((e) => e.href === pathname)),
    )
  );
}
function AdminNavContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [panelSearch, setPanelSearch] = useState("");
  const lock = useRef(false);
  const activeMenu = menus.find((menu) => active(pathname, menu));
  const secondaryEntries =
    activeMenu?.groups
      ?.flatMap((group) => group.entries)
      .filter((entry): entry is Entry & { href: string } => Boolean(entry.href))
      .filter(
        (entry, index, entries) =>
          entries.findIndex((candidate) => candidate.href === entry.href) ===
          index,
      ) ?? [];
  const currentHref = searchParams.size
    ? `${pathname}?${searchParams.toString()}`
    : pathname;
  const searchEntries = useMemo(
    () => [
      { label: "Ana sayfa", href: "/" },
      ...menus.flatMap((menu) => [
        ...(menu.href ? [{ label: menu.label, href: menu.href }] : []),
        ...(menu.groups?.flatMap((group) =>
          group.entries
            .filter((entry): entry is Entry & { href: string } =>
              Boolean(entry.href),
            )
            .map((entry) => ({ label: entry.label, href: entry.href })),
        ) ?? []),
      ]),
    ],
    [],
  );
  function submitPanelSearch(event: FormEvent) {
    event.preventDefault();
    const query = panelSearch.trim().toLocaleLowerCase("tr-TR");
    if (!query) return;
    const match = searchEntries.find((entry) =>
      entry.label.toLocaleLowerCase("tr-TR").includes(query),
    );
    if (!match) {
      setError("Panel aramasında eşleşen bir bölüm bulunamadı.");
      return;
    }
    setError("");
    setPanelSearch("");
    router.push(match.href);
  }
  async function signOut() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await logout();
      router.replace("/giris");
      router.refresh();
    } catch {
      setError(
        "Çıkış tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <header className="admin-header">
      <div className="header-main">
        <Link className="header-brand" href="/">
          <img src="/brand/trex-tea-logo.png" alt="TREX Tea" />
          <span>YÖNETİM PANELİ</span>
        </Link>
        <form className="panel-search" onSubmit={submitPanelSearch}>
          <input
            aria-label="Panelde ara"
            value={panelSearch}
            onChange={(event) => setPanelSearch(event.target.value)}
            placeholder="Panelde ara"
          />
          <button type="submit" aria-label="Panelde ara">
            ⌕
          </button>
        </form>
        <div className="header-links">
          <a href="https://www.trextea.com.tr" target="_blank" rel="noreferrer">
            Siteyi görüntüle ↗
          </a>
          <Link href="/bildirimler">● Bildirimler</Link>
          <button disabled={busy} onClick={() => void signOut()}>
            {busy ? "Çıkış yapılıyor…" : "Çıkış"}
          </button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <nav className="header-nav" aria-label="Yönetim menüsü">
        <Link className={pathname === "/" ? "active" : ""} href="/">
          <i>🏠</i> ANA SAYFA
        </Link>
        {menus.map((menu) => (
          <div
            className={`nav-menu ${active(pathname, menu) ? "active" : ""}`}
            key={menu.label}
          >
            {menu.href ? (
              <Link href={menu.href}>
                <i>{menu.icon}</i>
                {menu.label}
                <small>⌄</small>
              </Link>
            ) : (
              <button type="button">
                <i>{menu.icon}</i>
                {menu.label}
                <small>⌄</small>
              </button>
            )}
            <div className="nav-dropdown">
              {menu.groups?.map((group) => (
                <section key={group.title}>
                  <h3>{group.title}</h3>
                  {group.entries.map((entry) =>
                    entry.href ? (
                      <Link href={entry.href} key={entry.label}>
                        {entry.label}
                      </Link>
                    ) : (
                      <span className="soon" key={entry.label}>
                        {entry.label}
                        <em>Yakında</em>
                      </span>
                    ),
                  )}
                </section>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {activeMenu && secondaryEntries.length > 0 && (
        <nav
          className="header-subnav"
          aria-label={`${activeMenu.label} alt menüsü`}
        >
          <span>{activeMenu.label}</span>
          <div>
            {secondaryEntries.map((entry) => (
              <Link
                key={entry.href}
                className={currentHref === entry.href ? "active" : ""}
                href={entry.href}
              >
                {entry.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

export function AdminNav() {
  return (
    <Suspense fallback={<header className="admin-header" aria-label="Yönetim menüsü" />}>
      <AdminNavContent />
    </Suspense>
  );
}
