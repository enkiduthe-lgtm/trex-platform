# Bayi Çoklu Alım Ve Kapıda Ödeme

## Kullanım

- Ürünler → Fiyat Gir/Değiştir → Bayi Seviyesi: ürün, seviye ve Tekli / 2’li / 3’lü / 5’li seçilir. Çoklu alımda girilen tutar **paketin toplam fiyatıdır**. Her ürün ve seviye için ayrı kaydedilir.
- Bayi panelinin Ürünler tablosunda yalnız kendi seviyesinin fiyatları ve tekli alıma göre pozitif tasarruf görünür. Başka seviyelerin fiyatları gösterilmez.
- Bayi paket seçip paket adedini ve isterse tabanın üzerindeki toplam satış fiyatını girer. Sepette gerçek ürün adedi görünür. Birden fazla ürün aynı siparişe eklenebilir. Beşli alım beş sipariş oluşturmaz.
- Bayi primi = (satış paket toplamı − sipariş anındaki seviye paket toplamı) × paket adedi. Teslimatta kesinleşir. Yönetici ve müdür primi gerçek ürün adedi üzerinden mevcut kurallarla hesaplanır.
- Normal ve bayi yeni siparişinde kapıda ödeme varsayılan hizmet bedeli 75 TL’dir; kayıttan önce elle değiştirilebilir. Ürünlerden ayrı gösterilir, sipariş ve ödeme toplamına eklenir, prim oluşturmaz. Paraşüt’e ayrı hizmet satırı olarak gönderilir.

## Veri Güvenliği Ve Doğrulama

Migration 074 mevcut siparişlerde hizmet bedelini 0, mevcut fiyatlarda paket boyunu 1 kabul eder; geçmiş sipariş veya fiyatlar yeniden hesaplanmaz. Paket fiyatı yeni ürün oluşturmaz. Rezervasyon ve çıkış aynı ürünün gerçek adetlerinden yapılır.

Kuruşa tam bölünmeyen paketlerde aynı sipariş içinde gerçek ürün birimleri kuruş bazında dağıtılır. Örneğin 3’lü toplam 1.000 TL, iki fiyat satırına dağıtılabilir; toplam yine tam 1.000 TL, stok adedi 3 olur. Her satırın bayi tabanı sipariş anındaki denetim kaydında saklanır; sonradan fiyat değişikliği eski hakedişi değiştirmez.

İzole veritabanı testi: `scripts/verify-pack-orders.cjs`. Gerçek migration, sipariş servisi, paket dağıtımı ve personel prim servisi kullanılır; canlı bağlantı yoktur. Test; tek siparişte 5+3 ürün, tam toplamlar, bayi fark primi, gerçek adetli yönetici/müdür primi, varsayılan/manuel hizmet bedeli, stok rezervasyonu, tekrar gönderim, taban altı satış ve geçersiz adet geri alma senaryolarını içerir.

API ve panel aynı paketle yayınlanmalı; API migration tamamlanmadan yeni panel devreye alınmamalıdır. Gerçek fiyatlar kullanıcı tarafından girilir; örnek rakamlar ürün fiyatlarına kaydedilmez.
