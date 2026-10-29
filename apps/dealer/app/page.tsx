export default function Dealer() {
  return (
    <main>
      <aside>
        <b>
          TREX
          <br />
          BAYİ PORTALI
        </b>

        <a>📊 Dashboard</a>
        <a>📦 Ürünler</a>
        <a>🛒 Siparişler</a>
        <a>👥 Alt Bayiler</a>
        <a>💰 Primler</a>
        <a>📋 Cari Hesap</a>
      </aside>

      <section>
        <p>BAYİ PORTALI</p>

        <h1>Hoş Geldiniz</h1>

        <div className="cards">
          <article>
            <span>Bu Ay Satış</span>
            <strong>₺147.350</strong>
          </article>

          <article>
            <span>Bekleyen Sipariş</span>
            <strong>12</strong>
          </article>

          <article>
            <span>Kullanılabilir Prim</span>
            <strong>₺8.450</strong>
          </article>

          <article>
            <span>Cari Hesap</span>
            <strong>₺52.100</strong>
          </article>
        </div>

        <div className="dashboard-grid">
          <article className="panel">
            <h2>Son Siparişler</h2>

            <ul>
              <li>TRX-1045 - Hazırlanıyor</li>
              <li>TRX-1044 - Kargoda</li>
              <li>TRX-1043 - Teslim Edildi</li>
            </ul>
          </article>

          <article className="panel">
            <h2>Bayi Bilgileri</h2>

            <p>Durum: Aktif</p>
            <p>Fiyat Grubu: Gold</p>
            <p>Alt Bayi Sayısı: 8</p>
          </article>
        </div>
      </section>
    </main>
  );
}
