# Görsel depolama kurulumu

Trex yönetim panelindeki medya rehberi görselin ölçüsünü kontrol eder. Görselin siteye kalıcı olarak yayınlanması için Cloudflare R2 kullanılacaktır.

## Sahip tarafından yapılacaklar

1. Cloudflare hesabında R2'yi etkinleştir.
2. `trex-media` adlı özel bir bucket oluştur.
3. Bu bucket için yalnızca okuma/yazma yetkili bir R2 API anahtarı oluştur.
4. Anahtarı GitHub'a, sohbet mesajına veya kaynak koda yazma. Yalnızca Render servisinin gizli ortam değişkenlerine ekle.

## Render'a eklenecek gizli değişkenler

| Değişken | Değer |
| --- | --- |
| `ASSET_STORAGE_PROVIDER` | `r2` |
| `R2_ACCOUNT_ID` | Cloudflare hesap kimliği |
| `R2_ACCESS_KEY_ID` | R2 erişim anahtarı |
| `R2_SECRET_ACCESS_KEY` | R2 gizli anahtarı |
| `R2_BUCKET` | `trex-media` |
| `R2_PUBLIC_BASE_URL` | Görseller için sonradan belirlenecek özel alan adı |

Anahtarları yalnızca Render'ın Environment ekranında sakla. Bir anahtar bir yere yanlışlıkla yazılırsa hemen Cloudflare'dan iptal edilip yenisi oluşturulmalıdır.

## Yayın kuralı

Yüklenen dosya önce ölçü/tür/boyut denetiminden geçer. Başarılı dosya özel bucket'a kaydedilir; yalnızca yayınlanan görselin genel URL'si vitrinde kullanılır. Ödeme veya müşteri verileri medya deposuna yazılmaz.
