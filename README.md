# Not a Fake Ad

O reklamlardaki kapı-koşu oyununun gerçekten oynanabilir hali. Nimoriq · Google Play ve App Store.

## Klasörler

| Klasör | İçinde |
| --- | --- |
| `src/` | Oyunun kodu (three.js, tek sayfa). Giriş noktası `src/main.js`, ekranlar `src/index.html` |
| `vendor/three/` | three.js r186 (MIT) |
| `scripts/` | Derleme, ekran görüntüsü, ikon ve tanıtım görseli scriptleri |
| `assets/icons/` | iOS `AppIcon.appiconset`, Android `mipmap-*` (adaptif + tema ikonu), Play 512 ikon |
| `assets/brand/` | Açılış ekranı (2732) ve Play tanıtım görseli (1024×500) |
| `assets/store/` | Mağaza ekran görüntüleri, EN + TR (App Store 1320×2868, Play 1080×1920) |
| `site/` | nimoriq.com sayfaları: `not-a-fake-ad-privacy/`, `not-a-fake-ad-support/` |
| `supabase/` | Veritabanı kurulumu (Kelime Köyü ile aynı Supabase projesi) |
| `android/`, `ios/` | Capacitor 8 kabukları (`com.nimoriq.notafakead`) |
| `.github/workflows/` | Android (Play `.aab`) ve iOS (TestFlight) derlemeleri, bkz. `MOBIL-YAYIN.md` |

## Derleme

```
npm install
npm run build
```

Çıktı: `dist/not-a-fake-ad.html` (web önizleme; hesaplar tarayıcıda taklit edilir) ve `dist/app/index.html`
(Capacitor'ın paketlediği sürüm; fontlar yerel, hesaplar gerçek Supabase).

## Supabase

`supabase/001_not_a_fake_ad.sql` dosyasını Kelime Köyü projesinde SQL Editor'da bir kez çalıştır.
Sadece `nfa_` önekli tablo ve fonksiyon ekler, Kelime Köyü'nün tablolarına dokunmaz.

## Henüz test modunda olanlar

Giriş ve bulut kaydı gerçek (Supabase, `src/cloud.js`). Satın almalar (`src/payments.js`), reklamlar (`src/ads.js`),
Game Center / Play Games ve bildirimler (`src/platform.js`) yayından önce bağlanacak. Ayrıntı: `MOBIL-YAYIN.md`.
