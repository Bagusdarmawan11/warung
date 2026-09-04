# 🧺 Warung Kasir

Aplikasi kasir & manajemen stok untuk warung sembako. Scan/generate barcode, stok berbasis **batch (FIFO)** yang otomatis anti-salah-potong, produk timbangan (gram) dengan harga dinamis, riwayat lengkap, dan analitik + ringkasan AI.

Dibangun dengan **Next.js 15 (App Router) + Supabase + Tailwind**, siap deploy ke **Vercel**.

---

## Daftar Isi

1. [Fitur](#fitur)
2. [Teknologi](#teknologi)
3. [Cara Kerja Penting (baca ini dulu)](#cara-kerja-penting-baca-ini-dulu)
4. [Prasyarat](#prasyarat)
5. [Panduan Instalasi Lengkap](#panduan-instalasi-lengkap)
6. [Push ke GitHub](#push-ke-github)
7. [Deploy ke Vercel](#deploy-ke-vercel)
8. [Panduan Pemakaian](#panduan-pemakaian)
9. [Keamanan](#keamanan)
10. [Menjalankan Test Lokal (opsional)](#menjalankan-test-lokal-opsional)
11. [Batasan & Catatan](#batasan--catatan)
12. [Troubleshooting](#troubleshooting)

---

## Fitur

- **Beranda**: pemasukan/pengeluaran/profit — bisa difilter Hari Ini/Minggu Ini/Bulan Ini/Tahun Ini/Kustom, total produk, stok kosong, segera kadaluwarsa, grafik tren (line/bar, berwarna), **Analisis AI** (Gemini), produk terlaris, **Top Pelanggan** (berdasarkan total belanja), prediksi restock, dan daftar stok menipis/habis/kadaluwarsa — semua jadi satu halaman.
- **Kasir**: scan barcode pakai kamera HP/laptop (atau scanner USB/Bluetooth biasa), **foto produk tampil di keranjang & bisa diperbesar** (jadi kasir gampang cek fisik barangnya benar), keranjang belanja, harga bisa diedit per transaksi, checkout multi-item yang **atomik**.
- **Barang Masuk**: tambah produk baru (kode + barcode kecil otomatis, langsung bisa diunduh sebagai gambar PNG) atau tambah stok (restock) produk lama. Bisa tambahkan **foto produk** (opsional).
- **Produk timbangan (gram)**: untuk barang seperti telur, kemiri, lada, dll yang dibeli curah lalu direpack — input berat saat barang masuk (gram), dan saat terjual kasir tinggal input berat yang dibeli pembeli, tanpa perlu input jumlah butir/pack. Sisa stok ditampilkan dalam gram, bukan jumlah satuan.
- **Gabung Produk**: kalau ada beberapa produk yang seharusnya satu (misal "Telur Ayam 1 Kg", "Telur Ayam 2 KG", "Telur Ayam 500 gram" — biasanya gara-gara data lama), pilih semuanya (tekan & tahan salah satu, lalu ketuk yang lain) lalu **Gabung** jadi satu produk timbangan baru. Produk lama otomatis diarsipkan (bukan dihapus), riwayat transaksi lama tetap aman.
- **Sistem batch/lot FIFO otomatis**: tiap kali barang masuk, sistem membuat "batch" baru dengan harga & tanggal kadaluwarsanya sendiri. Penjualan otomatis dipotong dari batch **paling lama yang masih ada isinya**.
- **Daftar Barang**: nomor urut, pagination 20/halaman, filter status, foto produk di tiap baris. **Tekan nama produk** untuk buka **popup detail** (stok, harga modal, harga jual, estimasi untung — rinci di atas, tombol Edit terpisah di bawahnya) plus tab **Riwayat Transaksi**. **Tekan & tahan** untuk mode pilih banyak (gabung/hapus massal/unduh barcode massal).
- **Riwayat**: nomor urut, pagination, klik transaksi untuk detail (pembeli, keuntungan, lama barang di stok, sisa stok), unduh **PDF** laporan penjualan.
- **Login wajib** (Supabase Auth).
- **Footer** modern & **navbar liquid glass** (efek kaca buram melayang, ala iOS) di semua halaman.
- **Desain**: modern, minimalis, pastel, responsif.

## Teknologi

| Bagian | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions) |
| Database & Auth | Supabase (Postgres + Row Level Security + Auth) |
| Styling | Tailwind CSS |
| Scan barcode (kamera) | @zxing/browser |
| Generate barcode | JsBarcode |
| Chart | Recharts |
| AI Insight (opsional) | Google Gemini API |
| Deploy | Vercel |

---

## Cara Kerja Penting (baca ini dulu)

### 1. Barcode itu milik **produk**, bukan per-kedatangan barang
Kode/barcode (`BR0001`, dst) dibuat **sekali** saat produk pertama kali ditambahkan, dan **tidak berubah** walau kamu restock berkali-kali. Jadi kamu **tidak perlu cetak stiker baru setiap restock** — cukup pakai stiker lama yang sudah ditempel di rak/kemasan.

### 2. Tapi stok dilacak per "batch" (kedatangan barang), dan otomatis FIFO
Setiap kali ada barang masuk (baik produk baru maupun restock), sistem mencatatnya sebagai **batch** baru dengan qty, harga modal, harga jual, dan tanggal kadaluwarsanya sendiri-sendiri. Saat kasir men-scan barcode yang **sama** untuk menjual barang, sistem **otomatis** mengambil stok dari batch yang **paling lama masuk dan masih ada sisanya**. Kalau batch itu ternyata baru cukup untuk sebagian permintaan, sisanya otomatis diambilkan dari batch berikutnya (bisa lintas 2+ batch dalam 1 transaksi) — dan ini semua terjadi di **satu transaksi database** yang dikunci baris (row lock), jadi:

- Batch yang sudah habis (`qty_remaining = 0`) **tidak mungkin** ikut kepotong lagi.
- Dua kasir yang menjual produk yang sama di saat bersamaan **tidak akan** salah hitung / dobel-potong batch yang sama (race condition aman).
- Harga jual yang tercatat otomatis mengikuti harga batch yang dipakai — jadi kalau harga modal kemiri naik bulan ini, transaksi lama & baru tetap tercatat dengan harga masing-masing yang benar.

### 3. Checkout keranjang bersifat *all-or-nothing*
Kalau keranjang berisi 3 barang dan barang ke-3 ternyata stoknya kurang, sistem **tidak akan** menyimpan barang ke-1 dan ke-2 lalu gagal di barang ke-3 (itu akan jadi bug: stok berkurang padahal struk tidak keluar). Seluruh transaksi dibungkus jadi **satu operasi database** — kalau ada yang gagal, semuanya otomatis dibatalkan (rollback). Aplikasi akan tanya konfirmasi "stok tidak cukup, tetap lanjutkan?" — kalau kamu pilih lanjut, baru transaksi disimpan (termasuk baris "kekurangan stok" yang ditandai jelas).

### 4. Kenapa butuh login?
Karena kunci publik Supabase (`anon key`) **selalu** ikut ter-bundel ke kode yang dikirim ke browser siapa pun yang buka website-nya — itu wajar dan bukan kebocoran, tapi artinya harus ada lapisan lain yang menahan akses data. Semua tabel dikunci lewat **Row Level Security**: hanya request yang sudah login (`authenticated`) yang bisa baca/tulis data. Bahkan fungsi-fungsi penting (checkout, tambah stok, dll) sudah dikunci lagi di level fungsi (`revoke/grant execute`) supaya user anonim benar-benar tidak bisa memanggilnya sama sekali — sudah diuji langsung dengan Postgres lokal (lihat [Menjalankan Test Lokal](#menjalankan-test-lokal-opsional)).

---

## Prasyarat

Sebelum mulai, siapkan:

1. **Node.js versi 20 atau lebih baru** — cek dengan `node -v`. Kalau belum ada, unduh di [nodejs.org](https://nodejs.org).
2. **Akun GitHub** — [github.com](https://github.com) (gratis).
3. **Akun Supabase** — [supabase.com](https://supabase.com) (gratis, tier gratis cukup untuk warung kecil-menengah).
4. **Akun Vercel** — [vercel.com](https://vercel.com) (gratis, bisa daftar pakai akun GitHub).
5. *(Opsional, untuk fitur Analisis AI)* **Google Gemini API key** — gratis di [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

---

## Panduan Instalasi Lengkap

### Langkah 1 — Siapkan folder project

Kalau kamu dapat folder project ini dalam bentuk zip/file, ekstrak dulu. Buka terminal di dalam folder tersebut, lalu install dependency:

```bash
npm install
```

### Langkah 2 — Buat project Supabase

1. Buka [supabase.com](https://supabase.com) → **New project**.
2. Isi nama project (misal `warung-kasir`), buat password database (simpan baik-baik), pilih region terdekat (misal Singapore).
3. Tunggu ± 2 menit sampai project selesai dibuat.
4. Di sidebar kiri, klik **SQL Editor** → **New query**.
5. Buka file `supabase/migrations/0001_init.sql` di project ini, **copy semua isinya**, paste ke SQL Editor, klik **Run**. Tunggu sampai sukses (tulisan hijau "Success").
6. Ulangi langkah yang sama untuk **`0002_functions.sql`**, lalu **`0003_checkout.sql`**, lalu **`0004_security_hardening.sql`**, lalu **`0005_bulk_import.sql`**, lalu **`0006_import_sales_history.sql`**, lalu **`0007_product_images_and_history.sql`**, lalu **`0008_precise_timestamps.sql`**, lalu **`0009_merge_products.sql`**, lalu **`0010_import_fifo_redesign.sql`** — **urutannya harus persis seperti ini** (0001 → 0002 → ... → 0010), karena tiap file bergantung pada file sebelumnya.

   > ⚠️ **Jangan lewati file `0004_security_hardening.sql`.** File ini menutup celah keamanan penting (tanpa file ini, siapa pun yang tahu URL Supabase-mu bisa memanggil fungsi checkout/tambah produk tanpa login). Lihat bagian [Keamanan](#keamanan).

7. Ambil kredensial API: sidebar kiri → **Project Settings** (ikon gerigi) → **API**.
   - Copy **Project URL** → ini `NEXT_PUBLIC_SUPABASE_URL`.
   - Copy **anon public key** → ini `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Copy **service_role key** (klik "Reveal") → ini `SUPABASE_SERVICE_ROLE_KEY`. **Rahasiakan key ini, jangan pernah dipakai di kode frontend / commit ke GitHub.**

### Langkah 3 — Buat akun login (untuk kamu sebagai pemilik warung)

1. Di Supabase Dashboard, sidebar kiri → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Isi email & password (ini yang nanti dipakai login ke aplikasi kasir).
3. **Centang "Auto Confirm User"** supaya tidak perlu verifikasi email.
4. Klik **Create user**.

Mau tambah kasir lain? Ulangi langkah ini dengan email berbeda — semua user yang dibuat lewat cara ini punya akses penuh yang sama (aplikasi ini didesain untuk 1 warung dengan beberapa kasir terpercaya, bukan multi-tenant/multi-cabang).

### Langkah 4 — Konfigurasi environment variables

Copy file `.env.example` menjadi `.env.local`:

```bash
cp .env.example .env.local
```

Buka `.env.local`, isi dengan kredensial dari Langkah 2:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi....
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi....
NEXT_PUBLIC_NAMA_WARUNG=Warung Bu Siti
GEMINI_API_KEY=
```

`GEMINI_API_KEY` boleh dikosongkan dulu — aplikasi tetap jalan normal, hanya tombol "Analisis AI" di halaman Beranda yang belum aktif.

### Langkah 5 — Jalankan di lokal

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser → akan diarahkan ke halaman login → masuk pakai email/password dari Langkah 3.

### Langkah 6 — Import data lama (opsional)

Ada 2 cara, pakai salah satu saja:

**Cara A — lewat browser (paling mudah, tidak perlu komputer/terminal):**
Buka aplikasi yang sudah di-deploy → menu **Produk** → tombol **"Import CSV"** (atau langsung ke halaman `/import`). Upload file CSV Barang Masuk (wajib) dan Penjualan (opsional), klik **Mulai Import**. Semua diproses langsung lewat browser, cocok dipakai walau kamu deploy langsung dari GitHub tanpa pernah menjalankan apa pun di komputer lokal.

**Cara B — lewat terminal (kalau kamu sudah setup project di komputer lokal):**
```bash
node --env-file=.env.local scripts/import-legacy-csv.mjs path/ke/barang-masuk.csv path/ke/penjualan.csv
```

Kedua cara menghasilkan hasil yang sama. Catatan penting untuk keduanya: semua produk hasil import dibuat sebagai satuan **pcs**, dan produk yang namanya sudah ada di sistem otomatis dilewati (tidak dibuat dobel — aman kalau kamu tidak sengaja import 2 kali). Produk timbangan (telur, kemiri, lada, dll) sebaiknya kamu tambahkan ulang manual lewat menu **Barang Masuk → Produk Baru** dengan jenis satuan **gram**, supaya fitur harga-per-gram-nya aktif dengan benar.

---

## Push ke GitHub

1. Buat repository baru di [github.com/new](https://github.com/new) (boleh **Private** supaya tidak dilihat orang lain — dan **memang sebaiknya Private** karena berisi struktur bisnis kamu, walau tidak ada kredensial rahasia di dalam kode).
2. Di folder project, jalankan:

```bash
git init
git add .
git commit -m "Initial commit: warung kasir app"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA_REPO.git
git push -u origin main
```

`.env.local` **tidak akan ikut ter-push** (sudah ada di `.gitignore`) — aman, kredensial Supabase-mu tidak bocor ke GitHub.

---

## Deploy ke Vercel

1. Buka [vercel.com/new](https://vercel.com/new), login pakai akun GitHub.
2. Pilih **Import** pada repository yang baru kamu push.
3. Di bagian **Environment Variables**, tambahkan satu-satu (nilainya sama seperti di `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_NAMA_WARUNG`
   - `GEMINI_API_KEY` (opsional)
   - `SUPABASE_SERVICE_ROLE_KEY` **tidak perlu** ditambahkan di Vercel — key itu hanya dipakai script import data lama yang jalan di komputer lokal, tidak dipakai aplikasi yang di-deploy.
4. Klik **Deploy**. Tunggu ± 1-2 menit.
5. Setelah selesai, Vercel akan kasih URL seperti `https://nama-repo.vercel.app` — itu alamat aplikasi kasir kamu, bisa dibuka dari HP/laptop mana saja.

### Setelah deploy

- Buka URL Vercel-nya dari HP kasir & laptop kamu, login pakai akun dari Langkah 3, pastikan bisa lihat data yang sama (karena sama-sama nyambung ke Supabase yang sama).
- Kalau ganti/tambah environment variable di Vercel, project perlu di-**Redeploy** (Vercel Dashboard → Deployments → titik tiga → Redeploy) supaya perubahan kepakai.

### Mengubah / menambah environment variable di project yang SUDAH di-deploy

Kalau project kamu sudah jalan dan cuma mau tambah/ubah environment variable (misalnya menambahkan `GEMINI_API_KEY`):

1. Buka [vercel.com](https://vercel.com) → login → klik project kamu (misal `warung-rho`).
2. Klik tab **Settings** (di navigasi atas project) → di sidebar kiri klik **Environment Variables**.
3. Di kolom **Key** ketik nama variabelnya (misal `GEMINI_API_KEY`), di kolom **Value** paste API key-nya.
4. Pastikan centang **Production**, **Preview**, dan **Development** (biar aktif di semua environment) — biasanya sudah tercentang semua secara default.
5. Klik **Save**.
6. **Wajib Redeploy** supaya perubahan kepakai — buka tab **Deployments**, cari deployment paling atas (paling baru), klik ikon titik tiga (⋮) di sebelah kanannya → **Redeploy** → konfirmasi.
7. Tunggu sampai statusnya jadi "Ready" (± 1-2 menit), lalu buka lagi aplikasinya — env variable baru sudah aktif.

Kalau ada variabel lama yang mau dihapus (misal `ANTHROPIC_API_KEY` yang sudah tidak dipakai lagi), di halaman Environment Variables yang sama, cari barisnya → klik ikon titik tiga di sebelah kanan baris itu → **Remove** → jangan lupa Redeploy lagi setelahnya.

### Cara mendapatkan Gemini API Key (gratis)

1. Buka [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Login pakai akun Google kamu (akun Gmail biasa, tidak perlu akun berbayar).
3. Klik tombol **Create API key** (atau **Get API key** kalau ini kunjungan pertama).
4. Pilih **Create API key in new project** (kalau belum punya project Google Cloud sebelumnya, biarkan Google buatkan otomatis).
5. API key akan muncul, berupa teks panjang diawali `AIza...`. Klik ikon copy di sebelahnya.
6. Paste key ini sebagai value untuk `GEMINI_API_KEY` — baik di `.env.local` (kalau jalan di lokal) maupun di Environment Variables Vercel (lihat langkah di atas).

Gemini API punya kuota gratis harian yang cukup besar untuk pemakaian fitur Analisis AI di aplikasi ini (dipanggil manual tiap kamu klik tombolnya, bukan otomatis terus-menerus), jadi seharusnya tidak perlu upgrade ke paket berbayar untuk pemakaian normal 1 warung.

---

## Panduan Pemakaian

### Beranda
- Ringkasan pemasukan/pengeluaran/profit — bisa difilter **Hari Ini / Minggu Ini / Bulan Ini / Tahun Ini**, atau pilih **rentang tanggal sendiri** (Kustom). Profit dihitung dari untung riil tiap transaksi penjualan, bukan pemasukan dikurangi pengeluaran.
- Jumlah produk, stok kosong, dan segera kadaluwarsa.
- Grafik tren penjualan — tombol kecil di kanan atas grafik untuk ganti tampilan **garis (line)** atau **batang (bar)** berwarna, dan tombol Harian/Mingguan/Bulanan untuk ganti pengelompokan waktu.
- **Analisis AI**: klik "Analisis dengan AI" untuk minta Gemini merangkum kondisi bisnis + rekomendasi dalam bahasa natural, berdasarkan data ringkasan (bukan data mentah) 120 hari terakhir. Butuh `GEMINI_API_KEY` terisi (lihat [Langkah 4](#langkah-4--konfigurasi-environment-variables)).
- Di bawahnya: produk terlaris, **Top Pelanggan** (ranking berdasarkan total belanja), **prediksi restock** (dihitung dari rata-rata penjualan 14 hari terakhir), dan daftar stok menipis/habis/segera kadaluwarsa.

### Kasir
- Tap ikon kamera untuk scan barcode pakai kamera, atau ketik kode/nama di kotak lalu Enter (juga otomatis kompatibel dengan barcode scanner USB/Bluetooth biasa, karena alat itu meniru keyboard + tombol Enter).
- **Foto produk tampil otomatis** di saran pencarian & keranjang (kalau sudah pernah diupload) — ketuk foto untuk lihat versi besarnya, jadi kasir gampang mastiin barang fisiknya benar sebelum checkout.
- Produk timbangan akan memunculkan pop-up kecil untuk isi berat (gram) sebelum masuk keranjang.
- Harga per baris di keranjang bisa diketuk/diedit langsung kalau mau kasih harga beda saat itu (misal pembulatan atau diskon).
- Nama pembeli opsional.

### Barang Masuk
- **Produk Baru**: isi nama, jenis satuan (pcs/gram), jumlah, harga modal & jual, kadaluwarsa (opsional), dan **foto produk** (opsional) → kode & barcode otomatis dibuat, langsung ada tombol **Unduh Barcode** (file gambar PNG kecil, siap ditempel/cetak sendiri di stiker — tanpa nama/harga, cuma barcode polos seperti di kemasan produk pada umumnya).
- **Tambah Stok**: cari produk yang sudah ada, isi jumlah tambahan (boleh harga beda dari sebelumnya) → otomatis jadi batch baru, barcode/kode produk tetap sama seperti sebelumnya (tidak perlu unduh ulang / stiker baru).

### Produk (Daftar Barang)
- **Tekan nama/baris produk** untuk buka **popup detail** — info stok, harga modal, harga jual, dan estimasi untung ditampilkan rinci di bagian atas, dengan tombol **Edit** terpisah di bawah yang membuka popup edit sendiri (nama/kategori, koreksi stok manual, riwayat harga per batch, hapus produk) — jadi popup info tetap bersih. Ada juga tab **Riwayat Transaksi** (semua pergerakan masuk/keluar produk itu, lengkap dengan pembeli & untung per transaksi).
- **Tekan & tahan** sebuah produk untuk masuk mode pilih banyak (muncul toolbar di atas) → pilih beberapa produk lalu:
  - **Gabung** — satukan beberapa produk jadi satu produk baru (misal beberapa varian "Telur Ayam X Kg/gram" yang seharusnya cuma 1 produk timbangan). Kamu isi total stok gabungan & harga barunya sendiri; produk-produk lama otomatis diarsipkan (bukan dihapus, riwayat lama tetap aman).
  - **Barcode** — unduh barcode semua produk terpilih sekaligus (masing-masing jadi file PNG terpisah, polos tanpa nama/harga).
  - **Hapus** — hapus/arsipkan massal.
  
  Ketuk ikon ✕ atau lepas semua pilihan untuk keluar dari mode ini.
- Nomor urut & pagination (20 produk per halaman) supaya daftar panjang tetap rapi.
- Filter chip: Semua / Stok Menipis / Stok Habis / Segera Kadaluwarsa.
- Tombol **Import CSV** membuka halaman import data lama (lihat [Langkah 6](#panduan-instalasi-lengkap) di atas) — bisa dipakai kapan saja, tidak cuma sekali di awal.

### Riwayat
- Nomor urut & pagination, filter tanggal dan pencarian (termasuk cari berdasarkan nama pembeli). Tombol **Terapkan** dan **Unduh PDF/CSV** ada di atas, sejajar.
- **Ketuk sebuah transaksi penjualan** untuk lihat detail: qty, harga, total, keuntungan, siapa pembelinya, berapa lama barang itu ada di stok sebelum akhirnya terjual (dihitung dari tanggal batch masuk ke tanggal terjual), dan sisa stok produk itu sekarang.
- Unduh **PDF** laporan penjualan sesuai filter tanggal yang sedang aktif (tab Penjualan), atau CSV untuk tab Barang Masuk.

### Import Data Lama — kecerdasan tambahan
- Ada tombol **Backup Semua Foto Produk (ZIP)** di paling atas halaman ini — berguna sebelum reset+import ulang (lihat bagian [Backup & bersihkan foto produk](#backup--bersihkan-foto-produk) di atas).
- **Nama pembeli otomatis "diwariskan"**: kalau di file Penjualan kamu ada baris tanpa nama pembeli (karena itu barang ke-2/ke-3 dst dari transaksi yang sama dengan baris di atasnya), sistem otomatis mengisi nama pembeli dari baris terakhir yang ada namanya — jadi tidak ada lagi riwayat dengan pembeli kosong padahal sebenarnya satu transaksi.
- **Urutan waktu otomatis disusun dari urutan baris**: karena file lama biasanya cuma punya kolom tanggal (tanpa jam), sistem otomatis memberi waktu sintetis per baris — baris paling atas di file dianggap paling lama, baris di bawahnya +1 menit, dst — dan barang masuk hari itu diberi jam lebih pagi daripada penjualan di hari yang sama, supaya urutan riwayatnya selalu masuk akal (barang tidak pernah kelihatan terjual sebelum masuk).
- **Sisa stok dihitung otomatis**, tidak bergantung sama sekali pada kolom "Stock Sebelum"/"Sisa Stock" manual di spreadsheet lama kamu — jadi walau banyak baris yang kolom itu belum sempat kamu isi, tidak masalah; sistem menghitung sendiri dari total qty masuk dikurangi total qty terjual per produk.

---

## Reset Data (Opsional)

Kalau kamu perlu mulai dari nol lagi — misalnya setelah update logika import dan mau re-import ulang 2 file CSV supaya nama pembeli & urutan waktunya ikut ter-perbaiki — jalankan **`supabase/scripts/reset_data.sql`** di Supabase SQL Editor. Script ini menghapus **semua** data produk/stok/riwayat (baca peringatan di dalam filenya dulu), lalu mengembalikan penomoran kode produk ke `BR0001` lagi. Setelah itu tinggal import ulang seperti biasa lewat halaman `/import`.

⚠️ **Soal foto produk:** karena baris produk dihapus, referensi foto di masing-masing produk (`image_url`) ikut hilang bersamanya. File foto aslinya **tidak otomatis terhapus** dari Supabase Storage (cuma jadi "file yatim" yang tidak terpakai — aman, tidak mengganggu, cuma numpuk sedikit ruang penyimpanan), tapi kamu perlu **upload ulang manual** foto-foto itu ke produk yang baru setelah reset + import ulang, karena produk baru punya ID yang berbeda dan tidak otomatis "nyambung" ke foto lama. Kalau fotonya penting, ada baiknya simpan salinannya di HP/komputer dulu sebelum reset.

### Backup & bersihkan foto produk

Sebelum reset, kalau kamu sudah upload foto-foto produk dan mau menyimpannya dulu, **paling mudah lewat browser** (tidak perlu komputer/terminal): buka halaman **Import** di aplikasi kamu, ada 2 tombol di bagian paling atas:

- **Backup Semua Foto Produk (ZIP)** — mengunduh semua foto jadi satu file ZIP ke folder Downloads HP/laptop kamu (nama filenya sudah memuat nama produknya).
- **Hapus Semua Foto dari Storage** — setelah backup, tombol ini membersihkan semua foto dari Supabase Storage (minta konfirmasi dulu sebelum benar-benar menghapus).

> ⚠️ Supabase **sengaja memblokir** perintah `delete from storage.objects` langsung lewat SQL Editor (akan muncul error "Direct deletion from storage tables is not allowed") — jadi penghapusan foto **harus** lewat tombol di aplikasi (yang memakai Storage API resmi), bukan lewat query SQL manual. Kalau cuma mau **melihat** daftar foto yang ada tanpa menghapus, boleh pakai `supabase/scripts/manage_product_images.sql` di SQL Editor.

*(Kalau kamu kebetulan punya project ini ter-*clone* di komputer dengan Node.js terpasang, ada juga cara alternatif lewat terminal untuk backup: `npm run backup-images`. Tapi untuk kebanyakan orang, tombol di halaman Import sudah cukup dan lebih mudah.)*

---

## Keamanan

- **Login wajib** untuk semua halaman & operasi data (diberlakukan lewat Next.js Middleware + Supabase Auth).
- **Row Level Security** aktif di semua tabel — hanya role `authenticated` yang bisa baca/tulis.
- Fungsi-fungsi database yang menangani transaksi (checkout, tambah produk, import massal, dst) memakai `SECURITY DEFINER` supaya bisa mengunci baris untuk mencegah race condition — makanya izin eksekusinya **dicabut dari publik** dan hanya diberi ke `authenticated` (lihat `0004_security_hardening.sql` & `0005_bulk_import.sql`). Ini sudah diuji langsung: role anonim dipastikan mendapat error *permission denied* saat mencoba memanggil fungsi-fungsi tsb, dan *insert* langsung ke tabel diblok RLS.
- `SUPABASE_SERVICE_ROLE_KEY` **hanya** dipakai script import lokal (`scripts/import-legacy-csv.mjs`), tidak pernah dikirim ke browser atau di-deploy ke Vercel.
- Route API `/api/ai-insight` memeriksa ulang status login di sisi server (lapisan pertahanan kedua di luar middleware) sebelum memanggil API Gemini, supaya API key-mu tidak bisa "dipinjam" orang lain lewat endpoint itu.
- Input pencarian sudah di-escape sebelum masuk ke filter query database, untuk mencegah karakter tak terduga merusak/menyalahgunakan query pencarian.

---

## Menjalankan Test Lokal (opsional)

Folder `supabase/test/` berisi skrip SQL yang memverifikasi langsung ke Postgres (bukan cuma baca kode) bahwa:
- Role anonim benar-benar diblokir total (RLS + izin fungsi).
- Logika FIFO batch benar (termasuk kasus 1 penjualan yang "meluber" ke 2 batch sekaligus dengan harga berbeda).
- Checkout keranjang benar-benar atomik (rollback total kalau salah satu barang gagal).

Untuk menjalankannya butuh Postgres lokal (opsional, hanya untuk yang mau utak-atik/verifikasi kode):

```bash
# contoh di Ubuntu/Debian
apt-get install postgresql
service postgresql start
createdb warungtest
psql -d warungtest -f supabase/test/00_supabase_stub.sql
psql -d warungtest -f supabase/test/00b_storage_stub.sql
psql -d warungtest -f supabase/migrations/0001_init.sql
psql -d warungtest -f supabase/migrations/0002_functions.sql
psql -d warungtest -f supabase/migrations/0003_checkout.sql
psql -d warungtest -f supabase/migrations/0004_security_hardening.sql
psql -d warungtest -f supabase/migrations/0005_bulk_import.sql
psql -d warungtest -f supabase/migrations/0006_import_sales_history.sql
psql -d warungtest -f supabase/migrations/0007_product_images_and_history.sql
psql -d warungtest -f supabase/migrations/0008_precise_timestamps.sql
psql -d warungtest -f supabase/migrations/0009_merge_products.sql
psql -d warungtest -f supabase/migrations/0010_import_fifo_redesign.sql
psql -d warungtest -f supabase/test/01_test_anon_blocked.sql
psql -d warungtest -f supabase/test/02_test_fifo_checkout.sql
psql -d warungtest -f supabase/test/03_test_bulk_import.sql
psql -d warungtest -f supabase/test/04_test_import_sales.sql
psql -d warungtest -f supabase/test/05_test_batch_link.sql
```

---

## Batasan & Catatan

- **Cara A (import lewat browser)** meniru riwayat barang masuk **baris-per-baris** (tiap baris restock jadi batch tersendiri, persis kalau kamu tambah stok manual berkali-kali) dan penjualan lama benar-benar memotong stok lewat mekanisme FIFO yang sama dengan Kasir. Import Barang Masuk & Penjualan masing-masing **hanya bisa dijalankan sekali** per database (percobaan berikutnya otomatis dilewati, supaya stok tidak dobel) — kalau perlu ulang, jalankan `supabase/scripts/reset_data.sql` dulu.
- **Cara B (`scripts/import-legacy-csv.mjs`, CLI lokal)** masih memakai logika lama yang lebih sederhana (meringkas tiap produk jadi 1 batch gabungan, bukan baris-per-baris) — kalau bisa, lebih disarankan pakai Cara A untuk hasil yang lebih detail & akurat.
- Semua produk hasil import lama dibuat sebagai satuan **pcs**. Untuk produk timbangan (telur, kemiri, lada, dll) yang datanya kebetulan kepecah jadi beberapa produk (misal "Telur Ayam 1 Kg", "Telur Ayam 2 KG", dst — karena nama produknya beda-beda di data lama), gunakan fitur **Gabung Produk** di halaman Produk (tekan & tahan beberapa produk yang mau digabung) untuk menyatukannya jadi satu produk gram. Sistem **tidak** otomatis menggabungkan produk dengan nama BERBEDA (misal "Telur Ayam 1 Kg" vs "Telur Ayam 2 KG" dianggap 2 produk terpisah karena namanya memang beda) — hanya produk dengan nama PERSIS SAMA (huruf besar/kecil diabaikan) yang otomatis dianggap satu produk & direstock sebagai batch tambahan.
- Aplikasi ini didesain untuk **1 warung** dengan beberapa kasir yang saling percaya (semua user yang login punya akses penuh yang sama) — bukan sistem multi-cabang/multi-tenant dengan pemisahan data antar pemilik.
- `npm audit` masih menyisakan 1 peringatan *moderate* terkait `postcss` bawaan internal Next.js (dipakai saat proses build saja, bukan kode yang berjalan di browser pengguna) yang baru tuntas kalau upgrade ke Next 16 (major version, berpotensi ada perubahan API yang perlu pengujian ulang). Untuk saat ini risikonya sangat rendah karena tidak reachable dari luar; jalankan `npm audit` secara berkala dan pertimbangkan upgrade di masa depan.
- Fitur kamera scan barcode butuh izin kamera browser & koneksi **HTTPS** (otomatis terpenuhi begitu di-deploy ke Vercel; di localhost browser modern biasanya tetap mengizinkan untuk keperluan development).

---

## Troubleshooting

**"Failed to fetch font" saat `npm run build`**
Build butuh koneksi internet untuk mengunduh Google Fonts. Pastikan tidak ada firewall yang memblokir `fonts.googleapis.com` / `fonts.gstatic.com`.

**Login gagal terus padahal email/password benar**
Pastikan user dibuat dengan "Auto Confirm User" dicentang (Langkah 3). Kalau tidak, akun perlu verifikasi email dulu sebelum bisa login.

**Setelah scan/tambah produk baru, data tidak muncul di halaman lain**
Coba refresh halaman. Beberapa halaman memakai cache singkat Next.js; seharusnya sudah otomatis di-refresh (`revalidatePath`) tiap ada perubahan data, tapi kalau kamu buka 2 tab sekaligus di device berbeda, tab yang satunya perlu direfresh manual untuk melihat perubahan dari device lain.

**Kamera tidak muncul saat scan barcode**
Pastikan mengakses lewat HTTPS (otomatis di Vercel) dan sudah mengizinkan akses kamera di browser. Kalau tetap gagal, tetap bisa pakai input kode manual atau scanner USB/Bluetooth biasa.

**Error "permission denied for function ..." saat pakai aplikasi**
Ini justru tanda keamanannya bekerja — biasanya berarti sesi login sudah habis. Logout lalu login lagi.
