# V1 tek paket yayın teslimi

## Yerel paket durumu

Yerel test koşusu geçti. `V1_RELEASE_CHECKLIST.md` kanıtları ve açık kabul
maddelerini listeler. Bu belge üretim kabul onayı değildir.

## Yayından önce

1. Mevcut canlı commit ve servis ayarlarını kaydet; veritabanı yedeğinin alınabildiğini
   ve geri yüklenebildiğini staging üzerinde doğrula. Üretim yedeğini yerel repoya alma.
2. Ayrı PostgreSQL/Redis kabul ortamında migration çalıştırıcısını ve başlangıç
   yönetici hesabı akışını doğrula. Gizli bilgileri sohbet veya Git içine koyma.
3. Yetki/API ve ekran kabul listesinde açık maddeleri kapat. Yerel testler için
   `scripts/verify-v1.ps1` çalıştır. PGlite test bağımlılığı yoksa testleri atlama.
4. Yalnızca V1 paketine ait dosyaları commit et. Mevcut `.env.example`, `README.md`,
   `render.yaml` ve `apps/admin/tsconfig.tsbuildinfo` değişikliklerini ayrıca incele;
   bunlar bu pakette otomatik olarak sahiplenilmez.

## Tek paket yayın

API ve admin aynı commit ile yayınlanmalı. Bu pakette mağaza/bayi ekranı kodu
değişmedi; sırf paket için bu servisleri yeniden yayınlamak gerekmez.
API başlangıcı migration'ları kontrol eder. Bu geliştirme paketinde yeni migration
yoktur; mevcut 035 migration yerel sıfırdan kurulum provasına dahil edilmiştir.
trextea.com.tr mağazanın tek üretim domain ailesidir; Render test adresleri ayrı
üretim mağazası olarak sunulmaz.

## Yayın sonrası salt-okunur kontroller

- Servis sağlık durumları ve doğru commit.
- Admin giriş, ürün/müşteri/bayi/depo/sipariş ekranları ve işlem kayıtları.
- Mağaza ürün fiyatı ve sepete aktarım; gerçek ödeme yapmadan akış kontrolü.
- Mevcut siparişlerin durum, para birimi ve kasa hareketlerinin korunması.

## Geri dönüş

Uygulama hatasında son doğrulanmış API/admin commit'ine geri dön. Bu paket yeni
migration içermediğinden şema geri alma işlemi gerekmez. Veri tutarsızlığında
üretim kayıtlarını silerek veya tüm veritabanını körlemesine geri yükleyerek düzeltme
yapma; yeni tahsilatları koruyarak uzlaştırma planı çıkar. Yedekten dönüş yalnızca
doğrulanmış hedef, geri yükleme provası ve açık operasyon kararıyla yapılır.
