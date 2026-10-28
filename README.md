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

## Derleme

```
npm install
npm run build
```

Çıktı: `dist/not-a-fake-ad.html` (tek dosya web sürümü) ve `dist/app/index.html` (Capacitor'ın paketleyeceği sürüm, fontlar yerel).

## Supabase

`supabase/001_not_a_fake_ad.sql` dosyasını Kelime Köyü projesinde SQL Editor'da bir kez çalıştır.
Sadece `nfa_` önekli tablo ve fonksiyon ekler, Kelime Köyü'nün tablolarına dokunmaz.

## Henüz bağlanmayanlar

Oyunda şu an test yerine geçen sahte sürümler çalışıyor; paketleme sırasında gerçekleri bağlanacak:

- Giriş ve bulut kaydı → Supabase (`src/platform.js`, `src/auth.js`)
- Satın almalar → RevenueCat (`src/payments.js`)
- Reklamlar → AdMob (`src/ads.js`)
- Game Center / Play Games, bildirimler → `src/platform.js`
