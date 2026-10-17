import Link from "next/link";
import { AdminNav } from "../../components/admin-nav";

const areas = [
  {
    icon: "🛡️",
    title: "Güvenlik ayarları",
    description:
      "İki aşamalı doğrulama, açık oturumlar ve yönetici hesabı güvenliği.",
    href: "/yonetim/guvenlik",
    action: "Güvenliği yönet",
  },
  {
    icon: "👥",
    title: "Personeller ve yetkiler",
    description:
      "Yönetici, depo ve finans ekiplerinin hesapları ile erişim rolleri.",
    href: "/personel",
    action: "Personelleri yönet",
  },
  {
    icon: "🔔",
    title: "Bildirim merkezi",
    description:
      "Sistem, sipariş ve operasyon bildirimlerini tek ekrandan takip edin.",
    href: "/bildirimler",
    action: "Bildirimleri aç",
  },
  {
    icon: "🧾",
    title: "İşlem kayıtları",
    description:
      "Panelde yapılan önemli yönetim hareketlerini ve denetim kayıtlarını inceleyin.",
    href: "/islem-kayitlari",
    action: "Kayıtları incele",
  },
  {
    icon: "📡",
    title: "Sistem bütünlüğü",
    description:
      "Bağlantıları, servislerin durumunu ve sistem kontrollerini görüntüleyin.",
    href: "/yonetim/sistem-durumu",
    action: "Sistemi kontrol et",
  },
  {
    icon: "💳",
    title: "Ticari ayarlar",
    description:
      "Ödeme, havale ve finans operasyonlarına ilişkin yönetim ekranları.",
    href: "/finans",
    action: "Finans ayarlarını aç",
  },
];

export default function SettingsHubPage() {
  return (
    <main>
      <AdminNav />
      <section>
        <p>AYARLAR / YÖNETİM MERKEZİ</p>
        <h1>Ayarlar</h1>
        <p>
          İşletme yönetimi, erişim güvenliği ve sistem kontrollerini buradan
          düzenleyin. Her bölüm kendi ekranında çalışır ve yetkinize göre
          erişilebilir.
        </p>
        <div className="cards">
          {areas.map((area) => (
            <article key={area.href}>
              <p aria-hidden="true" style={{ fontSize: "28px", margin: 0 }}>
                {area.icon}
              </p>
              <h2>{area.title}</h2>
              <p>{area.description}</p>
              <Link className="financeLink" href={area.href}>
                {area.action} →
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
