# Mezhep definition of done

Hanefî, Şâfiî ve Caferî için bitti sayılmak, ilgili dosyadaki her ölçütün tutması demektir. Mezhep hesabına veya Mezhep kutusuna dokunan bir iş bitmeden önce bu ölçütler kontrol edilir.

Hesap, kayıt ve dipnot ölçütleri:

```bash
node scripts/check-mezhep.mjs
```

Komut çıkış kodu 0 olmalı. Betiğin yazdığı kimlikler (`H1`, `S2`, `C4` gibi) aşağıdaki dosyalardaki maddelerdir.

Arayüz maddeleri betikle görülmez. Aynı yer ve gün için Bugün ile Ay karşılaştırılır; Mezhep kutusu, hesap yöntemi kutusunun açık veya kapalı hali ve dipnot okunur.

Ortak kurallar:

- Üç mezhep aynı **Mezhep** kutusundadır.
- Yeni kurulumda mezhep Hanefî, hesap yöntemi Diyanet’tir.
- Bugün, Ay ve hatırlatma aynı hesabı kullanır.
- Dakika düzeltmesi, mezhebin ürettiği saatin üstüne eklenir.
- Seçim tarayıcıda saklanır. Bozuk kayıt Hanefî’ye döner.
