# Panel Kontrolü — 9 Kasım 2026

Bu belge tüm taleplerin tamamlandığı beyanı değildir. Yerel kontroller ile canlı kabul ayrı tutulur.

## Toplu Yayını Bekleyen Paket

Son doğrulanmış canlı sürüm: 0b550b4. Bu sürümden sonraki kaynak değişiklikleri henüz bu kontrol sırasında yayınlanmadı.

- Ana sayfa kartları ve grafikler için ortak, ekran genişliğine uyumlu yerleşim.
- Sipariş listesinde ürün adları, gerçek toplam adetler ve ödeme yöntemi.
- Türkçe kanal / ürün / SKU araması; ekran ve raporda aynı tarih filtreleri.
- Havale eşleştirmesinin yalnız bekleyen havale ödemelerinde gösterilmesi.
- Sipariş açıklamalarının geçmiş sayfalarda yüklenmesi, bağımsız kaydı ve taslak korunması.
- Sipariş ve müşteri Excel raporlarında ürün satırları, Türkçe alanlar ve tekrar etmeyen toplamlar.
- Bayi paketlerinde adet başına fiyat, gerçek tekli fiyatla karşılaştırma ve gerçek ürün adedinin gösterimi.
- Bayi priminde ürün alımı iadeleri ve rapor toplamları; yönetici priminde kuruş hassasiyetinde toplamlar.
- Giriş / başvuru ve prim işlemlerinde eşzamanlı tekrar gönderim kontrolü.
- Güvenlik ekranında yükleme hatalarının açık gösterimi ve yatay oturum tablosu.

## Yerel Doğrulama

- Panel yardımcı modülleri: son toplu koşuda 35 test geçti.
- Son kaynak değişikliklerinde panel TypeScript kontrolü geçti.
- Son fiyat değişikliğinden sonra PricingService grubundaki 5 test geçti.
- Kullanıcının PowerShell oturumunda tam Next.js üretim derlemesi geçti: derleme, lint / tip denetimi, sayfa verileri, 53/53 statik sayfa, build traces ve optimizasyon tamamlandı. Bu oturumdaki EPERM engeli nedeniyle aynı kontrol kullanıcı oturumunda yapıldı; sonuç kullanıcı çıktısıyla doğrulandı.
- API derlemesi, son API değişikliklerinden sonra geçti.
- Sunucu toplu regresyonu: sekiz grupta 57 test doğrulandı. İlk koşuda 54 geçti, eski rol modelini bekleyen üç test hata verdi; Müdür/Yönetici kuralına güncellenen staff-security grubunun 18 testi tekrar koşuda geçti. Diğer yedi grup ilk koşuda geçti.
- Kontroller: rol ayrımlı giriş, iki saatlik oturum sınırı, hesap pasifleştirme / parola sıfırlamada oturum iptali, merkezi sipariş geçmişi, ürün satırlı Excel, bayi marjı, perakende kanal grubu ve eski prim erişim sınırları.

## Sonraki Kontrolde Tamamlananlar

- Bayi ve müşteri kartlarında yükleme hatası ile boş kayıt ayrıldı; tekrar deneme eklendi.
- Ürün fiyatı / maliyeti, havale ve masraf kaydında işlem sırasında yazılan yeni taslakların korunması.
- Ürün fiyatı alınamadığında fiyat yokmuş gibi gösterimin kaldırılması; kayıtlı para biriminin kullanılması.
- Ürün önizlemesinde siteye özel fiyatın genel fiyattan önce seçilmesi; eşit başlangıç tarihinde oluşturulma zamanı ve kimlik sırası.
- Yeni siparişte müşteri değişince önceki teslimat adresinin temizlenmesi; seçenekler için tekrar deneme.
- Kargo ve masraf işlemlerinin ayrı yönetici izinlerine bağlanması.
- Kargo özetinde kayıt hazır / taşımada ayrımı; başarısız yükleme sonrasında eski verilerle işlem ve aktarım engeli.
- Masraf kayıtları için yükleme durumu ve yenileme; başarısız yükleme sırasında kayıt / silme / aktarım engeli.

## Canlıda Kabul Gerektirenler

- Ana sayfa grafiklerinin ve diğer değişen ekranların gerçek ekran ölçülerinde görsel kontrolü.
- Müdür, kısıtlı yönetici ve bayi hesaplarıyla ayrı giriş / erişim kabulü.
- Kayıtlı ürün fiyatlarıyla paket, adet, stok, teslimat primi ve iade senaryosu.
- Gerçek Excel dosyalarının örnek kayıtlarla açılıp karşılaştırılması.
- Kayıt silme, ödeme, gönderi oluşturma gibi canlı veriyi değiştiren işlemler kabul testi adı altında kendiliğinden yapılmaz.

## Dış Doğrulama Bekleyenler

- Aras: servis kayıt eşleşmesi şube kabulü değildir. 20261106-000005 için şubede okunamama sorunu, gerçek takip numarası ve kabul doğrulanmadan kapanmış sayılmaz. Mükerrer gönderi oluşturulmaz.
- Etiket ölçüsü depo tarafından henüz kesinleştirilmedi.
- Hepsiburada ve N11 bağlantıları, panel eksikleri tamamlandıktan sonra ele alınacak.

## 10 Kasım Yerel Görsel Kontrolü

- Müdür hesabıyla uygulama içi yerel panel erişimi doğrulandı. Ana sayfanın kart ve grafik alanları masaüstü görünümde incelendi.
- Ana sayfada onaylı sipariş sayısının ödeme bekleyenlere yönlenmesi düzeltildi.
- Durum grafiğinin kargo kaydı hazır siparişlerini dışarıda bırakması düzeltildi; yeni iki test ve TypeScript kontrolü geçti. Bu son düzeltmeden sonra tam üretim derlemesi ve yeni ekran kontrolü henüz yapılmadı.
- Yerel panel canlı eski API’ye bağlı: sipariş ürün adları ve ödeme yöntemi gibi eklenen API alanları henüz dönmüyor. Bu alanlar için API ve panel aynı paketle yayınlanıp birlikte doğrulanmalı; eksik veri uydurulmadı.

## Sipariş Detayı 500 — 10 Kasım

- Yerel panelden mevcut sipariş detayı okunurken canlı API 500 döndü. Render çalışma günlüğü OrdersService.detail içinde operator does not exist: text = uuid hatasını doğruladı.
- audit_logs.entity_id çekirdek migrationda text; sipariş / iade kimlikleri uuid. UUID tarafını text olarak karşılaştıracak şekilde sipariş detayı, bayi portalı, bayi raporları / kartı, prim satış özeti ve iade listesi düzeltildi. İş kayıtları veya tablo türleri değiştirilmedi.
- API derlemesi geçti. Bayi portalı ve sipariş listesi gruplarında 15 test geçti. Eski bayi servis testindeki eksik bildirim bağımlılığı test kurulumuna eklendi.
- Canlı API henüz bu düzeltmeyi içermiyor. Sipariş detayı / müşteri bağlantısının başarılı ekran kontrolü API yayını sonrasında yapılmalı.

## SQL Tür Hatasının İzole Doğrulaması

- scripts/verify-order-audit-types.cjs canlı bağlantı olmadan bellek içi PGlite PostgreSQL motorunda çalıştırıldı.
- OrdersService.detail içindeki gerçek ilk SQL sorgusu kaynak dosyadan okunarak çalıştırıldı. Eski karşılaştırmanın text = uuid hatası verdiği, düzeltmenin doğru sipariş / bayi / seviye verisi döndürdüğü doğrulandı. İlgisiz metin kimlikli işlem günlüğü ve işlem geçmişi olmayan sipariş senaryoları geçti.
- Test bağımlılığı yalnız tmp/order-sql-check içinde; üretim package.json veya lock dosyaları değiştirilmedi. Çalıştırma: node scripts/verify-order-audit-types.cjs tmp/order-sql-check

- İzole sipariş detayı kontrolü dokuz gerçek SQL sorgusunun tamamına genişletildi. Kaynak sorgular doğrudan çalıştırıldı; test teslimat adresi, beş adetlik ürün, paket barkodu ve tamamlanmış hazırlık kaydıyla sonuçlar doğrulandı. Bu kontrol canlı veritabanı şema farklarını veya tam HTTP / yetki akışını doğrulamaz.
