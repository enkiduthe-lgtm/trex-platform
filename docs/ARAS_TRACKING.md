# Aras Otomatik Takip

## Doğrulanan Sözleşme

Aras esasweb XML Servisleri mevcut üyeliği GetQueryDS kullanıyor. Üyeliği değiştirmeyin.
HTTPS servis: https://customerservices.araskargo.com.tr/ArasCargoCustomerIntegrationService/ArasCargoIntegrationService.svc
SOAP 1.1 action: http://tempuri.org/IArasCargoIntegrationService/GetQueryDS
loginInfo/queryInfo XML string parametreleridir. QueryType=1, IntegrationCode=siparişin kaydedilmiş provider_reference değeri.
Resmî PDF: Aras Kargo Müşteri Bilgi Sorgulama Servisleri, revizyon 31.07.2017, s.7–9; canlı WSDL/xsd0 4 Kasım 2026 tarihinde doğrulandı.

## Etkinleştirme

- ARAS_QUERY_USERNAME: mevcut XML sorgulama üyeliğinin kullanıcı adı.
- ARAS_QUERY_PASSWORD: mevcut XML sorgulama üyeliğinin şifresi.
- ARAS_CUSTOMER_CODE: mevcut müşteri kodu.
- ARAS_TRACKING_ENABLED=true: otomatik sorguyu açar. Varsayılan kapalıdır.
- SetOrder üyeliğinin şifresini sorgulama şifresiyle aynı varsaymayın.
- Kimlik bilgilerini repoya, loglara veya örnek dosyaya yazmayın.

## Davranış

API açılışında ve çalışırken her 5 dakikada en fazla 20 gönderi kontrol edilir. Veritabanı kilidi birden fazla API örneğinin eşzamanlı taramasını önler. En eski kontrol edilen gönderiler önce gelir; yüksek hacimde tüm gönderilerin taranması 5 dakikadan uzun sürebilir. PostgreSQL kontrol zamanı restart sonrası da saklanır.

Referans tek kayıtla eşleşmelidir. Bilinmeyen durum, SOAP hatası veya boş sonuç teslimat oluşturmaz. DURUM KODU=6 tam teslimattır; 5 parçalı teslimat tamamlanmış sayılmaz. TIP KODU=3 iadedir ve kod6 ile birlikte gelse bile müşteri teslimatı veya prim oluşturmaz. İade kontrolü depo/finans iade kabulünün yerine geçmez.

Sipariş, kargo, durum geçmişi ve teslimat primi tek veritabanı işleminde güncellenir. Tekrarlanan teslimat primi tekrar oluşturmaz. İptal/teslim edilmiş siparişler geriye taşınmaz. Aktif otomatik Aras takibinde elle teslimat/durum değiştirme engellenir.

Müdür gerektiğinde POST /v1/admin/orders/:id/shipment/sync veya /v1/admin/orders/shipping/sync üzerinden aynı doğrulanmış sorguyu başlatabilir. Bu yollar yöneticiye servis seviyesinde kapalıdır.

## Barındırma Sınırı

Zamanlayıcı API süreci çalışırken işler. Uyuyan ücretsiz Render instance üzerinde kesintisiz zamanlama garantisi yoktur; servis yeniden açılınca sorgu başlar. Kesintisiz otomatik takip için sürekli çalışan instance veya ayrıca yetkilendirilmiş bir zamanlama hizmeti gerekir. Ücretli plan otomatik açılmamalıdır.

## Kabul Kontrolü

Canlıda önce bir mevcut gönderinin salt okunur GetQueryDS cevabının şeması/referansı doğrulanmalı; ardından durum güncellemesi ve teslimatta prim tekilleştirmesi denetlenmelidir. Bu testler tamamlanmadan canlı Aras doğrulandı olarak işaretlemeyin.

## SetOrder Sözleşmesi — 4 Kasım 2026
Mevcut Render gönderi adresi customerws.araskargo.com.tr/arascargoservice.asmx olarak salt okunur doğrulandı. Resmî işlem açıklaması: https://customerws.araskargo.com.tr/arascargoservice.asmx?op=SetOrder . SOAP 1.1 zarfı http://schemas.xmlsoap.org/soap/envelope/, Content-Type text/xml; charset=utf-8 ve SOAPAction "http://tempuri.org/SetOrder". Önceki kodda sorgulama servisine ait IArasCargoIntegrationService/SetOrder action yanlış kullanılmıştı; düzeltildi. Sorgulama/GetQueryDS adresi farklıdır, değiştirilmedi.

CodAmount, CodCollectionType, CodBillingType ve IsCod alanları gerçek SetOrder şemasında mevcuttur. Şema bunları string olarak tanımlar; değerlerin sözleşmedeki anlamları bu sayfada açıklanmaz. Sorgulama PDF’sindeki tahsilat tipi değerleri, gönderi oluşturmanın bütün kodları doğrulandı anlamına gelmez. Kodları tahmin ederek COD gönderisi oluşturmayın. Bu değişiklik yalnız SOAP uyumunu düzeltir; kapıda tahsilat aktarımı hâlâ tamamlanmamıştır.

scripts/verify-aras-request.cjs gerçek provider kodunu sahte HTTP cevabı ile çalıştırıp header/zarf, XML escape, paket barkodu ve sonuç ayrıştırmasını doğrular; Aras’a gönderi isteği göndermez.
