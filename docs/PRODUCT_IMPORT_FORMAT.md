# Ürün toplu aktarım biçimi

Yönetici oturumu ile `POST /v1/admin/products/import` çağrısı en fazla 250 ürünü tek işlemde kaydeder. Bir satır geçersizse veya SKU/barkod/bağlantı adı tekrar ederse hiçbir ürün kaydedilmez.

```json
{
  "products": [
    {
      "sku": "TREX-001",
      "barcode": "8690000000001",
      "slug": "trex-klasik-cay",
      "name": "Trex Klasik Çay",
      "description": "Ürün açıklaması.",
      "status": "DRAFT"
    }
  ]
}
```

Zorunlu alanlar: `sku`, `slug`, `name`.

- `sku`: İşletme içi benzersiz ürün kodu.
- `barcode`: Varsa ürün barkodu; benzersiz olmalıdır.
- `slug`: Site bağlantısıdır; yalnızca küçük harf, sayı ve tire içerir. Örnek: `trex-klasik-cay`.
- `status`: Kontrol için önce `DRAFT`; satışa hazır ürün için `ACTIVE` kullanılır.

Fiyat, stok, ürün görseli ve kargo ayarları ayrı kontrollü kayıtlar olduğundan bu aktarımda yer almaz. Böylece bir dosya yanlışlıkla satış fiyatını veya depodaki stoğu değiştiremez.
