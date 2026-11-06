# Vakitler

Namaz vakitleri için kurulabilir, çevrimdışı çalışan bir PWA. Hesap tarayıcıda yapılır; GitHub Pages üzerinde sunucu gerekmez.

Uygulama: [https://akifyanbak.github.io/vakitler/](https://akifyanbak.github.io/vakitler/)

## GitHub Pages

1. Depoda **Settings → Pages** bölümünü açın.
2. **Build and deployment** kaynağını **Deploy from a branch** olarak seçin.
3. Dal `main`, klasör `/ (root)` olsun.
4. Kısa süre sonra site [https://akifyanbak.github.io/vakitler/](https://akifyanbak.github.io/vakitler/) adresinde açılır.

Adresler görelidir. Uygulama hem depo sayfasında (`/vakitler/`) hem de alan adının kökünde çalışır. Dosyayı çift tıklayarak `file://` ile açmayın; hizmet çalışanı ancak bir adres üzerinden yüklenir.

## Ne yapar

- İmsak, güneş, öğle, ikindi, akşam ve yatsı, büyük yazıyla tek ekranda
- İl, ilçe ve sık kullanılan şehir araması; tarayıcı konumu veya koordinat
- Kıble açısı ve pusula
- Aylık takvim, hicri tarih
- Diyanet’e yakın Türkiye yöntemi (varsayılan, Hanefî ikindi) ve diğer hesap yöntemleri
- Dakika düzeltmesi, gece/gündüz veya vakte göre renk
- Ana ekrana ekleme ve ilk açılıştan sonra çevrimdışı kullanım
- Sekme açıkken vakit hatırlatması

Vakitler [adhan](https://github.com/batoulapps/adhan-js) (MIT) ile hesaplanır. Türkiye yöntemi Diyanet çizelgesine yakındır; resmi ilandan birkaç dakika sapabilir. Hicri tarih Ümmü’l-Kurâ takvimidir ve Diyanet’in ilan ettiği günden bir gün farklı olabilir.

İl ve ilçe koordinatları [turkey-cities-districts-json](https://github.com/BuNickTamYirmiHarfli/turkey-cities-districts-json) verisinden gelir.
