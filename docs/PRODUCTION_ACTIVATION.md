# TREX canlı aktivasyon planı

Bu dosya, canlı bağlantılar açılırken tek tek ve geri alınabilir ilerlemek için
uygulanacak sırayı tanımlar. Gizli anahtarlar Git'e, e-postaya veya sohbet
mesajlarına yazılmaz; yalnızca Render hizmetinin ortam değişkenlerine eklenir.

## 1. Ödeme — PayTR

Ön koşul: PayTR işyeri sözleşmesi, test mağaza bilgileri ve callback izinleri.

Render API hizmetine şu değişkenler girilir:

| Anahtar | Test aşaması | Canlı aşama |
| --- | --- | --- |
| `PAYMENT_PROVIDER` | `paytr` | `paytr` |
| `PAYTR_MERCHANT_ID` | PayTR test kimliği | canlı kimlik |
| `PAYTR_MERCHANT_KEY` | test anahtarı | canlı anahtar |
| `PAYTR_MERCHANT_SALT` | test salt değeri | canlı salt değeri |
| `PAYTR_TEST_MODE` | `1` | `0` |
| `PUBLIC_WEB_URL` | `https://www.trextea.com.tr` | `https://www.trextea.com.tr` |

Önce yalnız test modu açılır. Başarılı ödeme, başarısız ödeme ve aynı callback'in
tekrar gelmesi senaryoları doğrulanmadan `PAYTR_TEST_MODE=0` yapılmaz.

## 2. Kargo — Aras Kargo

Ön koşul: Aras müşteri kodu, SetOrder kullanıcı hesabı, şifre, sözleşmedeki
endpoint ve test gönderisi için çıkış/teslimat adresleri.

Render API hizmetine şu değişkenler girilir:

| Anahtar | Değer |
| --- | --- |
| `SHIPPING_PROVIDER` | `aras` |
| `ARAS_CUSTOMER_CODE` | Aras'ın verdiği müşteri kodu |
| `ARAS_SET_ORDER_USERNAME` | SetOrder kullanıcı adı |
| `ARAS_SET_ORDER_PASSWORD` | SetOrder şifresi |
| `ARAS_SET_ORDER_ENDPOINT` | sözleşmedeki test veya canlı endpoint |

Aras'ın sözleşmeye özel SetOrder alanları alındığında gönderi şeması bu belgeye
göre bağlanır. İlk gerçek etiket ve takip hareketi doğrulanana kadar canlı sipariş
akışında kargo sağlayıcısı değiştirilmez.

## 3. Bildirimler

İlk canlı e-posta adaptörü Brevo olarak hazırdır. Ücretsiz paketi, küçük
başlangıç hacimleri için günlük e-posta kotası sunar. Render API hizmetine
`NOTIFICATION_PROVIDER=brevo`, `BREVO_API_KEY` ve doğrulanmış göndereni
içeren `BREVO_FROM_EMAIL` eklenir. SMS sağlayıcısı seçilene kadar SMS ve push
bildirimleri güvenli biçimde başarısız kayda düşer; e-posta akışı etkilenmez.
Testte şu üç olay kayıt altına alınır: gönderim, başarısız gönderim ve tekrar
deneme.

## 4. Görsel depolama — Cloudflare R2

| Anahtar | Değer |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare hesap kimliği |
| `R2_ACCESS_KEY_ID` | sadece R2 için sınırlı erişim anahtarı |
| `R2_SECRET_ACCESS_KEY` | gizli R2 anahtarı |
| `R2_BUCKET` | `trex-media` |
| `R2_PUBLIC_BASE_URL` | ör. `https://media.trextea.com.tr` |

Bir ürün görseli yüklenir, panelde ve vitrinde açıldığı doğrulanır; sonra aynı
görsel geri alınarak silme/geri dönüş kontrolü yapılır.

## 5. Operasyon provası

1. Üretim veritabanının yedeği alınır ve ayrı bir veritabanında geri dönüş
   denemesi yapılır.
2. Migration, önce yedek üzerinde çalıştırılır.
3. Redis bağlantısı, işlem kuyruğu ve sağlık ekranı doğrulanır.
4. Bir yönetici, bir personel ve bir bayi ile giriş, sipariş, iptal, depo ve
   teslimat akışı test edilir.
5. Ödeme, kargo ve bildirim test sonuçları işletme sorumlusu tarafından kayda
   alınır.

## 6. Alan adı ve izleme

`www.trextea.com.tr` ana alanı doğrulanır. API için kullanılacak alan adı
belirlenirse Render'da eklenir, DNS CNAME kaydı oluşturulur ve HTTPS sertifikası
doğrulanır. Hata izleme hizmetinin proje anahtarı yalnız Render ortam
değişkeninde tutulur.

## Açma sırası

1. R2 test yüklemesi
2. PayTR sandbox
3. Aras sandbox etiketi ve takip
4. Bildirim sağlayıcısı testi
5. Yedek/geri dönüş ve kullanıcı kabul testi
6. Sağlayıcıların canlı anahtarları ve kontrollü yayın

Her adımda sorun çıkarsa ilgili sağlayıcı değeri tekrar `mock` konumuna alınır;
sipariş ve ürün verileri silinmez.
