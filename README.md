# Sasa Futbol Okul Yönetim Sistemi

İlk kullanıcı arayüzü prototipi. VetAmerikan Shift Asistan ile aynı tipografi yaklaşımını kullanır:

- Roboto: genel kullanıcı arayüzü
- Anta: Sasa Futbol marka yazısı
- Responsive web düzeni: masaüstünde sol menü, mobilde alt menü
- Roller: platform Süper Admini, okul admini, antrenör ve öğrenci velisi
- Çok okullu yapı: Süper Admin okul seçebilir; diğer kullanıcılar yalnızca kendi okullarını görür

## Çalıştırma

Bu klasörde bir statik dosya sunucusu başlatın:

```bash
python3 -m http.server 8765
```

Ardından `http://127.0.0.1:8765` adresini açın.

## Tamamlanan prototip akışları

- Giriş ve prototip rol değişimi
- Role göre menü ve ana panel
- Öğrenci listesi, arama, grup filtresi ve yeni kayıt formu
- Veliye özel çocuk profili
- Antrenman kartları ve yoklama formu
- Aidat listesi ve ödeme durumu güncelleme
- Temel muhasebe özeti
- Bildirim oluşturma ekranı

## Veri altyapısı

Canlı kayıtlar Supabase üzerinde tutulur. Öğrenci, aidat, antrenman, yoklama, muhasebe ve bildirim tabloları `school_id` ile birbirinden ayrılır. Row Level Security kuralları okul adminlerinin yalnızca kendi okulunu; platform Süper Admininin ise seçtiği okulu yönetmesini sağlar.

Antrenör rolü yalnızca güvenli öğrenci dizinine, antrenmanlara ve yoklama kayıtlarına erişir. Veli iletişim bilgileri, aidat dönemleri ve muhasebe kayıtları bu role veritabanı seviyesinde kapalıdır.

`localStorage` katmanı yalnızca arayüzün geçici önbelleği ve bağlantı sırasında geri dönüş verisi olarak korunur; yetki ve kalıcı veri kaynağı değildir.

## Çok okullu sürümü devreye alma

Önce `supabase/migrations/20260809150000_multi_school_platform.sql` geçişini Supabase'e uygulayın. Ardından `invite-guardian`, `invite-school-admin` ve `send-push-notification` Edge Function sürümlerini yayınlayın. Web arayüzü bu adımlardan sonra yayınlanmalıdır; aksi halde yeni okul listesi RPC çağrıları henüz bulunmaz.

## GitHub Pages

Proje GitHub deposunun kök dizinine gönderildiğinde `.github/workflows/pages.yml` iş akışı web sürümünü GitHub Pages'a yayınlamaya hazırdır. Depo ayarlarında **Settings → Pages → Source: GitHub Actions** seçilmelidir.

GitHub Pages yalnızca web arayüzünü sunar; Supabase veri izolasyonu ve Firebase Cloud Messaging mevcut merkezi altyapıda çalışır.

## Kart açılışı

Açılan kartlar ve yeni sayfalar sabit banner/başlık altına hizalanır. Filtreleme, veri yenilemesi ve kapatma mevcut kaydırma konumunu korur; form girişlerine otomatik odak verilmez.
