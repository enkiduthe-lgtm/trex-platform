# B2B Panel Kontrol Listesi — 6 Kasım 2026

Bu liste kullanıcının son 11 maddesini izler. Kodda bulunması canlı kabul testi yerine geçmez. Hazır düzeltmeler henüz yayımlanmamıştır.

| No | Talep | Durum / Kabul Ölçütü |
| --- | --- | --- |
| 1 | Aras barkod ve şube kabulü | AÇIK / KRİTİK. 20261106-000005 için 06.11.2026 16:16 İstanbul sorgusunda servis MÖK ve paket barkodunu eşleştirdi; şube ise kayıt bulamadı. Takip numarası yok. Servis kaydı, şube kabulü olarak sunulmayacak. Aynı sipariş yeniden gönderilmedi. |
| 2 | Tekrarlayan alt sekmeler | Kod düzeltildi: ortak üst gezinmedeki ikinci alt menü kaldırıldı. Açılır menü ve sayfaya özgü işlem sekmeleri korunuyor. Yayın ve ekran kontrolü bekliyor. |
| 3 | Bayi siparişlerinin merkezden gönderilmesi | Portal AdminOrderService ile ortak orders tablosuna DEALER_PORTAL olarak yazıyor; merkez listesi kanal belirtilmeden hepsini sorguluyor. Portal yönlendirme testleri geçti. Canlı bayi siparişi → merkez liste → hazırlama → Aras kabul testi açık. Merkez listeye kimlik/tarih sıralı geçmiş sayfalama ve Daha Eski Siparişleri Yükle düğmesi eklendi. Filtreler yüklenen kayıtları kapsadığını açıkça belirtir. Canlıya çıkmadı. |
| 4 | Görünür işlem butonları | Açılır menülere yüksek kontrastlı, renkli kutulu bağlantılar eklendi. Sayfa içi bütün işlemler için görsel kontrol devam ediyor. |
| 5 | Kutu oranları / sağ boşluk | Açılır menüler sekmenin konumuna ve ekran genişliğine göre sınırlandı, boyutları küçültüldü. Diğer modüllerde masaüstü/tablet/mobil kontrolü açık. |
| 6 | Instagram/site/pazaryeri perakende primi | Mevcut eşleştirme RETAIL. Teslimat hakedişinde yedi kanal için test eklendi; testler geçti (7 kanal). Geçmiş hakedişler değiştirilmedi. |
| 7 | Basit sıralı sipariş akışı | Mevcut akış: Hazırla → Paketle → Aras Kaydı/Takip. Kargo Kaydı Hazır ayrı liste sekmesine alındı; CREATED artık kargolanan olarak sayılmıyor. 2 kuyruk testi geçti. Tamamlanan adımlar ve sonraki işlem netleştirilecek; servis sorgusu ile fiziksel kabul ayrı kalacak. Canlı işlem testi açık. |
| 8 | Render uyanma ekranı | Ücretsiz servis 15 dakika boşta uyur ve uyanırken Render ekranı gösterir. 6 Kasım resmi fiyat: en küçük ücretli web servisi 7 USD/ay. Panel+API iki servis için taban 14 USD/ay; veritabanı, vergi ve ek kullanımlar hariç. Ücretli değişiklik yapılmadı. |
| 9 | B2B işleyişi / rapor doğruluğu | Sürekli kabul ölçütü: bayi+merkez siparişleri, stok, muhasebe, prim ve kargo kayıtları uzlaştırılmalı. Paket içinde ana sayfa/Excel çoklu para birimi düzeltmeleri ve tahsilat tarih filtresi var. Pazaryeri entegrasyonları bu kontrol sonrasına ertelendi. |
| 10 | Bayi seviye ikonu / müşteri kartları | Gerçek seviye adını gösteren rozet bayi listesine ve detay kartına eklendi. Var olan müşteri ve bayi detayları korunuyor. Müşteri kartından bayiyle bağlantı ve tüm bilgi kapsamı ayrıca denetlenecek. |
| 11 | Hiçbir maddenin atlanmaması | Bu liste kapanış kaydıdır. Açık maddeler tamamlandı denmeyecek; yayın, canlı kontrol ve dış servis kabulü ayrı raporlanacak. |

## Aras inceleme kanıtı

- Sipariş: 20261106-000005
- Sipariş kimliği: 7045b6f1-3181-49ce-a919-15ae126507d0
- Mevcut MÖK: 7045B6F1318149CEA91915AE126507D0
- Mevcut paket barkodu: TRX-PKG-1793962119089
- Canlı panelin yalnız sorgula işlemi: eşleşti, yeni gönderim yapılmadı.
- Açık bilgi: şubenin adı, sorgu ekranı, kullanılan müşteri/sözleşme hesabı ve ret yanıtı.
- Sonraki adım: Aras'ın aynı müşteri hesabında bu MÖK'ü şube kabul sisteminde incelemesi. MÖK'ü yalnız etiket üzerinde değiştirmek ya da doğrulamadan mükerrer kayıt açmak çözüm sayılmaz.

## Kaynaklar

- https://render.com/docs/free
- https://render.com/pricing

## Bu tur kontrolleri

- API: perakende prim grupları, bayi portalı ve Aras yanıt doğrulaması: 3 test dosyası, 23 test geçti.
- Sipariş kuyrukları: 2 test geçti. İptal/iade kayıtları kargo geçmişiyle yeniden açılmaz.
- Canlı merkez listesinde 2 perakende kayıt var; bayi kanalıyla canlı sipariş kabul testi yapılmadı.

## Canlı SetOrder ayar güncellemesi — 6 Kasım 2026

- Kullanıcının açık onayıyla mevcut API servisindeki yalnız SetOrder kullanıcı adı, SetOrder şifresi ve müşteri kodu e-postadaki canlı bilgilerle güncellendi. Kimlik değerleri bu belgeye veya kaynak koda kaydedilmedi.
- ARAS_QUERY_USERNAME ve ARAS_QUERY_PASSWORD değiştirilmedi.
- Render: Save and deploy, mevcut 744dc30 sürümü; yayın dep-dbmtblvf3r2c73bjgc40 başarılı / Live.
- 20261106-000005 için 16:30:06 İstanbul sorgusu yine MÖK ve paket eşleşmesi verdi. Yeni gönderim yapılmadı, takip numarası hâlâ yok.
- Sonuç: canlı kimlik ayarları güncellendi; şubenin kaydı bulamaması çözülmüş sayılmaz. Şube/müşteri sözleşmesi ve MÖK kabul sorgusunun Aras tarafından karşılaştırılması gerekiyor.

## Merkez Sipariş Geçmişi

- Onaylananlar sekmesi ve Kargo Kaydı Hazır URL filtresi düzeltildi.
- Sipariş geçmişi 100 kayıtlık gruplarla yüklenebilir; bayi kanalı dahil mevcut liste sözleşmesi korunur. Yeni gelen siparişler eski sayfaların sınırını kaydırmaz.
- Üç API testi geçti; panel TypeScript kontrolü geçti. Tam üretim derlemesi ve canlı ekran kabulü bekliyor.

## Sıralı Hazırlama Düğmeleri

- Liste ve detay aynı hazırlama kuralını kullanıyor: Hazırla → Paketle → Kargo Kaydı. Mevcut gönderi ve terminal siparişlerde hazırlama tekrar açılmaz.
- Takip durumuna göre liste etiketi ve takip düğmesi tutarlı; yinelenen takip bağlantısı kaldırıldı. İade Detayı bağlantısı eklendi.
- Üç akış testi geçti. Henüz yayımlanmadı; fiziksel Aras kabulü açık.

## Siparişten Müşteri Kartına Geçiş

- Sipariş detayı gerçek customer_id değerini döndürüyor. Kayıtlı müşteriler için Müşteri Kartı Ve Geçmiş Siparişleri Aç bağlantısı eklendi.
- Müşteri ekranı istenen kayıt kimliğine ait mevcut kartı açar; eşleşmeyen kayıtta açık mesaj gösterir. E-posta üzerinden tahminle eşleştirme yapılmaz.
- Bayi kartıyla doğrudan ilişkilendirme ayrı kontrol olarak açık; canlı ekran kontrolü bekliyor.

## Siparişte Bayi Ve Alıcı Ayrımı

- Sipariş detayında oluşturma kaydındaki bayi kimliğinden bayi adı, güncel seviye rozeti ve bayi kartına bağlantı gösterilir. Alıcı ve adres bilgileri değişmez.
- Eski kayıtta bayi kimliği bulunmuyorsa benzer e-posta/ad ile ilişki uydurulmaz.
- Müşteri kartı değişikliğinin iki detay testi geçti. Bayi bağlantısı için kod ve test kontrolü sürüyor; canlı doğrulama yapılmadı.

## Toplu Derleme — 7 Kasım 2026

- API üretim derlemesi başarılı.
- Panel üretim derlemesi ayrı .next-check-20261107 klasöründe başarılı; 53 sayfa, lint ve tür kontrolü geçti.
- Yerel kontrol klasörü için TREX_BUILD_DIR isteğe bağlı ayarı eklendi. Normal yayın .next kullanmaya devam eder. Derlemenin eklediği yerel referanslar temizlendi.
- Sipariş liste/detay testleri: 2 dosya, 5 test başarılı. Akış testleri: 3 başarılı.
- Ekran görünümü ve canlı bayi siparişi kabulü bekliyor. Aras şube kabulü kritik açık madde; bu derleme sonucu onu çözülmüş saymaz.

## Giriş Ve Yetki Kontrolü — 7 Kasım

- Giriş bölümü ayrımı, güncel rol/oturum denetimi ve çıkış: 3 dosyada 21 test geçti.
- İlk HTTP rol testi denemesi yerel 127.0.0.1 bağlantısında EACCES nedeniyle sonuçlanamadı (113 vaka). Ağ izni alındı ve yalnız bu dosya yeniden başlatıldı.
- Bu testler canlı farklı cihaz/hesap kabul testinin yerine geçmez.

- Ağ izni sonrası HTTP rol denetimi yeniden çalıştırıldı: 113/113 başarılı. Giriş/oturum/çıkışla birlikte toplam 134 test geçti. Canlı hesap ve farklı cihaz kontrolü ayrıca açık.

## Stok Hazırlama Ve Bayi Primi — 7 Kasım

- Küçük grup yeniden çalıştırması: prepare-order ve dealer-margin, 2 dosya / 16 test başarılı.
- Ödeme/rezervasyon engelleri, tekrar hazırlamanın engellenmesi ve kayıtlı fiyat üzerinden bayi fark primi kontrol edildi.
- Canlı sipariş, stok, kargo kabulü ve hakediş uzlaştırması ayrıca açık.
