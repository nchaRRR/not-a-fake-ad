# Mobil yayın (Google Play + App Store)

Uygulama kimliği: **`com.nimoriq.notafakead`** (yayından sonra değişmez). Sürüm: **0.9.0**.
Derleme GitHub'ın bulut makinelerinde yapılır; Android Studio ya da Mac gerekmez (Kelime Köyü ve Köstebek Avcısı ile aynı düzen).

Oyun kabuğu: Capacitor 8. `npm run build` oyunu tek dosyalık `dist/app/index.html` yapar, Capacitor bunu
Android/iOS projelerine kopyalar.

## GitHub Secrets (Settings → Secrets and variables → Actions)

Kelime Köyü'ndekilerle **aynı değerler**. GitHub secret'ları repolar arasında kopyalanmaz, tek tek girilir.

| Ad | Değer |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | yükleme anahtarı `.jks` dosyasının base64 hali |
| `ANDROID_KEYSTORE_PASSWORD` | anahtar deposu şifresi |
| `ANDROID_KEY_ALIAS` | anahtar adı (ör. `kostebek-upload`) |
| `ANDROID_KEY_PASSWORD` | anahtar şifresi |
| `APPLE_TEAM_ID` | 10 karakterlik Team ID |
| `APPSTORE_KEY_ID` | App Store Connect API anahtar kimliği |
| `APPSTORE_ISSUER_ID` | Issuer ID |
| `APPSTORE_KEY_P8` | `AuthKey_XXXX.p8` dosyasının tam metni |

## Supabase (Kelime Köyü projesi, bir kez)

1. SQL Editor → `supabase/001_not_a_fake_ad.sql` (yapıldı).
2. **Authentication → URL Configuration → Redirect URLs** → ekle: `com.nimoriq.notafakead://auth-callback`
   (Google / Apple ile giriş bu adrese döner; Kelime Köyü'nün adresi listede kalır).
3. **Authentication → Emails → SMTP Settings**: özel SMTP açık olmalı (Resend, gönderen `noreply@nimoriq.com`).
   Supabase'in kendi e-posta servisi saatte birkaç e-postayla ve yalnızca ekip üyelerine gönderir; oyunculara kod gitmez.
4. **Authentication → Emails → Templates → Magic Link**: e-postayla giriş bu şablonu kullanır. Kelime Köyü şifreyle
   giriş yaptığı için bu şablonu kullanmaz, değiştirmek ona dokunmaz. Konu ve gövde:

   Konu: `Nimoriq giriş kodun: {{ .Token }}`

   ```html
   <h2>Giriş kodun / Your sign-in code</h2>
   <p style="font-size:32px;font-weight:800;letter-spacing:6px">{{ .Token }}</p>
   <p>Bu kodu oyuna yaz. Sen istemediysen bu e-postayı yok sayabilirsin.</p>
   <p>Enter this code in the game. If you didn't ask for it, you can ignore this email.</p>
   <p>— Nimoriq</p>
   ```
5. **Authentication → Providers → Email**: "Email OTP Length" **6** olmalı (oyun 6 haneli kod bekler).
6. Google ve Apple sağlayıcıları Kelime Köyü için zaten açık; bu oyun aynı ayarları kullanır.
   Google giriş ekranında görünen ad Google Cloud'daki markadır; "Nimoriq" yapmak iki oyun için de doğru olur.

## Google Play (kapalı test)

1. Play Console → **Uygulama oluştur**: ad *Not a Fake Ad*, varsayılan dil Türkçe, Oyun, Ücretsiz.
2. GitHub → Actions → **Android (Play)** → Run workflow → ~10 dk sonra çalıştırmanın altında `.aab` dosyası.
3. Play Console → Test → **Dahili test** → yeni sürüm → `.aab`'ı yükle → test kullanıcıları.
4. Mağaza metinleri ve formlar: "Not a Fake Ad Mağaza Kiti" sayfası ve mağaza dokümanı.

## App Store (TestFlight)

1. developer.apple.com → Identifiers → **+** → App ID: `com.nimoriq.notafakead` (yetenek gerekmez).
2. App Store Connect → Uygulamalar → **+** → Yeni uygulama: ad *Not a Fake Ad*, birincil dil Türkçe,
   paket kimliği `com.nimoriq.notafakead`, SKU `not-a-fake-ad`.
3. GitHub → Actions → **iOS (TestFlight)** → Run workflow (upload açık) → 5–30 dk sonra TestFlight'ta.
4. TestFlight → iç test grubuna kendini ekle.

İmzalama her çalıştırmada geçici bir dağıtım sertifikası açar ve bir önceki çalıştırmanınkini kapatır
(`scripts/asc.py`, ad öneki `NotAFakeAd CI`). Apple hesap başına birkaç dağıtım sertifikasına izin verir;
Kelime Köyü ve Köstebek Avcısı'nın da birer tane tuttuğu için "sertifika sınırı" hatası çıkarsa
developer.apple.com → Certificates'ten eski "CI" sertifikalarından birini sil.

## Sürüm

Sürüm `android/app/build.gradle` → `versionName` (iOS da buradan okur). Derleme numarası = iş akışının çalıştırma
numarası (Android: `<run>00`), her yüklemede kendiliğinden artar. Sürüm değişince `build.gradle`,
`ios/App/App.xcodeproj/project.pbxproj` (MARKETING_VERSION) ve `package.json` birlikte değişir.

## Henüz test modunda olanlar (yayından önce bağlanacak)

| Ne | Şu an | Yayından önce |
|---|---|---|
| Giriş + bulut kaydı | **Gerçek** (Supabase) | — |
| Satın almalar | Sahte onay penceresi, para çekilmez | RevenueCat + mağazalarda 6 ürün |
| Reklamlar | Sahte 2 sn'lik reklam | AdMob (iOS + Android uygulaması, ödüllü birim) |
| Game Center / Play Games, bildirimler | Kapalı | ilgili eklentiler |

Bu yüzden şimdiki build'ler **yalnızca dahili test / TestFlight** içindir; mağazaya incelemeye gönderilmez.

AdMob bağlanınca unutma: Play Console → Uygulama içeriği → **Reklam kimliği** beyanını "Hayır"dan **"Evet"**e çevir
(şimdilik "Hayır", çünkü build'de reklam kütüphanesi yok); Info.plist'e `GADApplicationIdentifier` + SKAdNetwork,
Android `strings.xml`'e `admob_app_id` eklenir.
