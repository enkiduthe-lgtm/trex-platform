# V1 toplu yayın kontrolü

V1 tamamlanmadan V2'ye geçilmez. Bu dosya bir tamamlandı beyanı değildir.
Çalışma sırası: migration → backend → API → yetki → UI → test → regression.
Canlıya yayın, aşağıdaki kapanış kontrollerinden sonra tek paket olarak yapılacak.

## Mevcut kapsam

- Auth, roller/yetkiler, kullanıcı yönetimi, oturum iptali.
- Ürünler, satış fiyatları, müşteriler ve bayiler.
- Siparişler, değişmez sipariş kalemi fiyatı, yönetici siparişi düzenleme/iptali.
- Ödemeler, PayTR bildirimi, havale ve elden nakit; yönetici TL/USD/EUR desteği.
- Depolar, stok, rezervasyonlar ve stok hareketleri.
- Denetim kayıtları ve temel admin/mağaza ekranları.

## Henüz yayınlanmamış düzeltmeler

- İlk yönetici kurulumu/parola sıfırlaması denetim kaydıyla tek işlemde yapılır;
  e-posta kilidiyle eşzamanlı kurulum korunur. SUPER_ADMIN dışı hesap değiştirilmez.
  Açıkça istenen parola sıfırlamasında mevcut oturumlar iptal edilir.

- Mağaza fiyat sorguları yalnızca PUBLIC_WEB kanalını kullanır.
- Ürün listesi/detayı ve fiyat motoru aynı öncelik ve tarih sırasını kullanır.
- Fiyat ve denetim kaydı tek veritabanı işlemiyle yazılır.
- Mağaza sepeti/checkout fiyatsız veya TRY dışı kalemleri reddeder; kur dönüşümü yapmaz.
- Ödeme ve ödeme denemesi tek işlemle yazılır; eşzamanlı istekler checkout kilidi
  altında yeniden kontrol edilir. Dış ödeme sağlayıcısı çağrısı kilidin dışında kalır.
- Operasyon durum değişiklikleri ADMIN/SUPER_ADMIN/WAREHOUSE ile sınırlıdır;
  yalnızca PAID → PROCESSING → SHIPPED → DELIVERED sırası kabul edilir.
  İptal ayrı stok/ödeme kontrollü akışa gider; aynı durum yeniden yazılmaz.
  Bu kontrol gerçek kargo gönderimini veya sağlayıcı doğrulamasını temsil etmez.
- Checkout tüm sepet ürünlerini kontrol eder; pasif ürünleri sessizce atlamaz.
  Ürün/depo satırları işlem boyunca kilitlenir, stok kilitleri ürün sırasıyla alınır.
  Yeni rezervasyonlar aynı işlem içinde RESERVATION stok hareketi oluşturur.
- İmzalı PayTR bildirimleri yalnızca PENDING ödemeyi sonuçlandırır;
  SUCCEEDED/FAILED/REFUNDED kayıtları yinelenen veya çelişen bildirimle değişmez.
  Başarısız ödeme, ödeme denemesi ve denetim kaydı birlikte yazılır.
- Ödeme-sipariş dönüşümü boş/para birimi uyumsuz kalemleri ve eksik rezervasyonu
  yazma işleminden önce reddeder. Aktif rezervasyonlar kalem adetleriyle eşleşmeli,
  tek depoda bulunmalı ve kilitli stok satırında karşılığı olmalıdır.
  Ürün adı/fiyatı ve teslimat adresi checkout snapshot'ından kopyalanır.
  Bu ret sağlayıcıdan alınmış parayı iade etmez; uyuşmazlık için operasyonel
  uzlaştırma gerekir. İmzalı başarılı bildirimde OPEN checkout süresi dolmuş olsa
  da korunmuş aktif rezervasyon doğrulanarak tamamlanabilir. Kayıt eşleşmiyorsa
  OK dönülmez; sağlayıcı yeniden deneyebilir.

## Kapanışta doğrulanacak

### Eklenen yerel kontroller

- `v1-role-http.spec.ts`: on dört API rotasında tüm roller, bilinmeyen rol ve
  oturumsuz erişim; gerçek RolesGuard ve rota dekoratörleri kullanılır.
  Kimlik doğrulama bu testte taklittir; JWT doğrulaması ayrı testlerle kapsanır.
- `test-v1-migrations.cjs`: 35 migration sıfırdan izole PGlite veritabanına
  uygulanır; V1 tabloları ve satış kanalı seed kayıtları kontrol edilir.
  Varsayılan kullanıcı/parola yaratılmadığı doğrulanır. PGlite ortamında yalnızca
  pgcrypto kurulum satırı atlanır; gerçek PostgreSQL extension kurulumu ve
  migration çalıştırıcısının provası bununla tamamlanmış sayılmaz.

- [ ] Yeni ve mevcut veritabanı için migration/seed provası; geri dönüş yöntemi.
- [ ] Her V1 API için kimlik, rol ve kayıt erişimi olumsuz senaryoları.
- [ ] Ürün/müşteri/bayi ekranları ve kayıt doğrulama kontrolleri.
- [x] Stok hareketleri ve iptal/rezervasyon serbest bırakma tutarlılığı (izole test).
- [x] Ödeme başarısızlığı, yinelenen bildirim ve sipariş fiyat snapshot senaryoları (izole test).
- [x] API derlemesi; API, admin, web ve bayi TypeScript kontrolü.
- [x] Tam test paketi ve veritabanı SQL regression senaryoları (yerel).
- [x] Test ödeme kabulü ile gerçek tahsilatın ayrı tutulması (kasa SQL testi).
- [ ] Üretim ayarları, yedekleme ve trextea.com.tr domain kontrolü.
- [ ] Tek paket yayın sonrası sağlık ve salt-okunur ekran kontrolleri.

Aras Kargo, picking/packing geliştirmeleri ve diğer V2 işleri bu kapanışın
koşulu değildir. Gerçek ödeme, stok değişikliği veya üretim kayıt silme işlemleri
test amacıyla otomatik yapılmaz.

## Son yerel koşu — 7 Ekim 2026

346 test / 40 test grubu geçti (ilk yönetici kurulumu ek kontrolleri dahil).
`scripts/verify-v1.ps1` dört TypeScript projesini
ve 10 ek test scriptini hatada duracak şekilde çalıştırır. API `nest build` geçti.
İzole servis akışı gerçek Argon2 parola ve JWT doğrulaması, refresh sonrası eski
oturumun iptali, logout, sepet, checkout replay, havale, iptal, stok serbest bırakma,
gecikmiş imzalı PayTR bildirimi, tekrar bildirim ve snapshot korumasını doğrular.
PGlite tek bağlantılıdır; bu testler üretim havuzu eşzamanlılık provasının yerine geçmez.
İlk yönetici kurulum/sıfırlama akışı da gerçek SQL ile çalıştırıldı; eski parola ve
oturumun sıfırlama sonrasında geçersiz olduğu doğrulandı.

Gerçek PostgreSQL/Redis kabul ortamı bu bilgisayarda mevcut değil; `.env` bağlantısı
ve yerel PostgreSQL/Docker komutu bulunmadı. Bu yüzden tüm V1'in üretim kabulünün
tamamlandığı veya yedeklemenin doğrulandığı iddia edilmez. Canlıya yayın yapılmadı.
Render bağlantısının hesap kontrolünde Trex'in enkiduthe@gmail.com hesabı yerine
farklı bir hesap görüldü; yanlış workspace içinde veritabanı inceleme/değişiklik
yapılmadı. Kabul ortamı erişimi bu nedenle de açık kalır.

Bildirim referansı: https://dev.paytr.com/iframe-api/iframe-api-2-adim
