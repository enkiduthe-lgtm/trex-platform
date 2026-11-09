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

- Panel yardımcı modülleri: 30 test geçti.
- Son kaynak değişikliklerinde panel TypeScript kontrolü geçti.
- API derlemesi, son API değişikliklerinden sonra geçti.
- Sunucu toplu regresyonu: sekiz grupta 57 test doğrulandı. İlk koşuda 54 geçti, eski rol modelini bekleyen üç test hata verdi; Müdür/Yönetici kuralına güncellenen staff-security grubunun 18 testi tekrar koşuda geçti. Diğer yedi grup ilk koşuda geçti.
- Kontroller: rol ayrımlı giriş, iki saatlik oturum sınırı, hesap pasifleştirme / parola sıfırlamada oturum iptali, merkezi sipariş geçmişi, ürün satırlı Excel, bayi marjı, perakende kanal grubu ve eski prim erişim sınırları.

## Canlıda Kabul Gerektirenler

- Tam panel üretim derlemesi ve ana sayfa grafiklerinin gerçek ekran ölçülerinde görsel kontrolü.
- Müdür, kısıtlı yönetici ve bayi hesaplarıyla ayrı giriş / erişim kabulü.
- Kayıtlı ürün fiyatlarıyla paket, adet, stok, teslimat primi ve iade senaryosu.
- Gerçek Excel dosyalarının örnek kayıtlarla açılıp karşılaştırılması.
- Kayıt silme, ödeme, gönderi oluşturma gibi canlı veriyi değiştiren işlemler kabul testi adı altında kendiliğinden yapılmaz.

## Dış Doğrulama Bekleyenler

- Aras: servis kayıt eşleşmesi şube kabulü değildir. 20261106-000005 için şubede okunamama sorunu, gerçek takip numarası ve kabul doğrulanmadan kapanmış sayılmaz. Mükerrer gönderi oluşturulmaz.
- Etiket ölçüsü depo tarafından henüz kesinleştirilmedi.
- Hepsiburada ve N11 bağlantıları, panel eksikleri tamamlandıktan sonra ele alınacak.
