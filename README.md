# 1171 HOME — ilk sürüm

Bu klasör 1171 HOME arayüzünün ilk çalışan prototipidir.

## Açma
1. `index.html` dosyasına çift tıklayın.
2. Parola alanına `1171` yazın.
3. Menüleri deneyin.

## Bu sürümde çalışanlar
- Parola ekranı (yalnızca tarayıcı tarafında basit kilit)
- Responsive ana panel ve menüler
- Battle Roster: oyuncu ekleme/silme, tarayıcıda saklama, CSV dışa aktarma
- Rally Sync: operasyon notu ekleme ve tarayıcıda saklama
- Harita çalışma alanı taslağı ve koordinat notları
- Zar aracı ve not defteri

## Önemli güvenlik notu
Bu, GitHub Pages gibi statik barındırmada çalışabilen bir ön yüz prototipidir. `1171` parolası HTML/JavaScript kaynak kodundan görülebilir; dolayısıyla gerçek gizlilik veya güvenli erişim sağlamaz. Gerçekten tüm siteyi şifreyle korumak için sunucu taraflı kimlik doğrulama veya erişim katmanı (ör. Cloudflare Access ya da bir backend) kurulmalıdır. Özel/kişisel verileri bu prototipe koymayın.

## Yayınlama
GitHub hesabı oluşturduktan sonra bu dosyaları bir depoya yükleyip GitHub Pages'i etkinleştirebiliriz. Gerçek erişim korumasını ayrıca kuracağız.


## Etkinlik katılım tablosu
Cloudflare D1 veritabanında `attendance-table.sql` içeriğini Console bölümünde bir kez çalıştırın. Katılım bildirmek için üyelerin 1171 ARENA bölümünde oyuncu PIN hesaplarıyla giriş yapmış olması gerekir. Katılım API uç noktası `/api/attendance` adresidir.


## T11 asker takibi

Cloudflare D1 veritabanında `t11-table.sql` dosyasındaki SQL komutunu bir kez çalıştırın. Oyuncular 1171 ARENA bölümünde kendi oyuncu PIN'leriyle giriş yaptıktan sonra T11 piyade, süvari ve okçu sayılarını kaydedebilir. `/api/t11` uç noktası oyuncu oturumunu doğrular ve her oyuncunun yalnızca kendi kaydını değiştirmesine izin verir. T11 sıralaması toplam asker sayısına göre gösterilir.
