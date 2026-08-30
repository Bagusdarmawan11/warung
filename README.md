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

- **Kasir**: scan barcode pakai kamera HP/laptop (atau scanner USB/Bluetooth biasa — tinggal ketik/scan lalu Enter), keranjang belanja, harga bisa diedit per transaksi, checkout multi-item yang **atomik** (kalau satu barang gagal, semua batal — tidak ada stok "kepotong sebagian").
- **Barang Masuk**: tambah produk baru (kode + barcode otomatis dibuat, langsung bisa diunduh PNG / dicetak) atau tambah stok (restock) produk lama.
- **Produk timbangan (gram)**: untuk barang seperti telur, kemiri, lada, dll yang dibeli curah lalu direpack — input berat saat barang masuk (gram), dan saat terjual kasir tinggal input berat yang dibeli pembeli. Harga per gram bisa beda-beda tiap kedatangan barang (lihat bagian FIFO di bawah).
- **Sistem batch/lot FIFO otomatis**: tiap kali barang masuk (termasuk restock produk yang sama), sistem membuat "batch" baru dengan harga & tanggal kadaluwarsanya sendiri. Saat kasir menjual, stok otomatis dipotong dari batch **paling lama yang masih ada isinya** — kalau batch itu habis, otomatis lanjut ke batch berikutnya. **Ini didesain khusus supaya tidak mungkin salah motong stok barang lama yang sudah habis.**
- **Daftar Barang**: cari, filter (stok menipis/habis/kadaluwarsa), edit, koreksi stok manual (stok opname), cetak label barcode satuan maupun massal (centang banyak produk sekaligus).
- **Riwayat**: barang masuk & penjualan, bisa difilter tanggal, export CSV.
- **Analitik**: tren omzet harian/mingguan/bulanan, produk terlaris, **prediksi kebutuhan restock** (berdasarkan rata-rata penjualan harian), dan **Ringkasan AI** (opsional, butuh API key Anthropic) yang merangkum kondisi bisnis + rekomendasi dalam bahasa natural.
- **Login wajib** (Supabase Auth) — data tidak bisa diakses/diubah orang yang tidak login, walau tahu URL aplikasinya.
- **Desain**: modern, minimalis, pastel, responsif (mobile-first, cocok dipakai dari HP di meja kasir).

## Teknologi

| Bagian | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions) |
| Database & Auth | Supabase (Postgres + Row Level Security + Auth) |
| Styling | Tailwind CSS |
| Scan barcode (kamera) | @zxing/browser |
| Generate barcode | JsBarcode |
| Chart | Recharts |
| AI Insight (opsional) | Anthropic API (Claude) |
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
5. *(Opsional, untuk fitur Ringkasan AI)* **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com).

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
6. Ulangi langkah yang sama untuk **`0002_functions.sql`**, lalu **`0003_checkout.sql`**, lalu **`0004_security_hardening.sql`**, lalu **`0005_bulk_import.sql`** — **urutannya harus persis seperti ini** (0001 → 0002 → 0003 → 0004 → 0005), karena tiap file bergantung pada file sebelumnya.

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
ANTHROPIC_API_KEY=
```

`ANTHROPIC_API_KEY` boleh dikosongkan dulu — aplikasi tetap jalan normal, hanya tombol "Ringkasan AI" di halaman Analitik yang belum aktif.

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
   - `ANTHROPIC_API_KEY` (opsional)
   - `SUPABASE_SERVICE_ROLE_KEY` **tidak perlu** ditambahkan di Vercel — key itu hanya dipakai script import data lama yang jalan di komputer lokal, tidak dipakai aplikasi yang di-deploy.
4. Klik **Deploy**. Tunggu ± 1-2 menit.
5. Setelah selesai, Vercel akan kasih URL seperti `https://nama-repo.vercel.app` — itu alamat aplikasi kasir kamu, bisa dibuka dari HP/laptop mana saja.

### Setelah deploy

- Buka URL Vercel-nya dari HP kasir & laptop kamu, login pakai akun dari Langkah 3, pastikan bisa lihat data yang sama (karena sama-sama nyambung ke Supabase yang sama).
- Kalau ganti/tambah environment variable di Vercel, project perlu di-**Redeploy** (Vercel Dashboard → Deployments → titik tiga → Redeploy) supaya perubahan kepakai.

---

## Panduan Pemakaian

### Kasir
- Tap ikon kamera untuk scan barcode pakai kamera, atau ketik kode/nama di kotak lalu Enter (juga otomatis kompatibel dengan barcode scanner USB/Bluetooth biasa, karena alat itu meniru keyboard + tombol Enter).
- Produk timbangan akan memunculkan pop-up kecil untuk isi berat (gram) sebelum masuk keranjang.
- Harga per baris di keranjang bisa diketuk/diedit langsung kalau mau kasih harga beda saat itu (misal pembulatan atau diskon).
- Nama pembeli opsional.

### Barang Masuk
- **Produk Baru**: isi nama, jenis satuan (pcs/gram), jumlah, harga modal & jual, kadaluwarsa (opsional) → kode & barcode otomatis dibuat, langsung ada tombol unduh PNG / cetak label.
- **Tambah Stok**: cari produk yang sudah ada, isi jumlah tambahan (boleh harga beda dari sebelumnya) → otomatis jadi batch baru, barcode/kode produk tetap sama seperti sebelumnya (tidak perlu cetak stiker baru).

### Produk (Daftar Barang)
- Cari & filter produk, cetak ulang label (satuan / massal dengan centang banyak produk), edit info dasar, **koreksi stok manual** (untuk stok opname), dan lihat riwayat batch/harga tiap produk.
- Tombol **Import CSV** di halaman ini membuka halaman import data lama (lihat [Langkah 6](#panduan-instalasi-lengkap) di atas) — bisa dipakai kapan saja, tidak cuma sekali di awal.

### Riwayat
- Lihat & filter riwayat barang masuk maupun penjualan per tanggal, export ke CSV untuk backup/laporan.

### Analitik
- Tren omzet (harian/mingguan/bulanan), produk terlaris, dan **prediksi restock** (dihitung dari rata-rata penjualan 14 hari terakhir, memperkirakan berapa hari lagi stok habis + saran jumlah restock untuk 14 hari ke depan).
- **Ringkasan AI**: klik "Buat Ringkasan AI" untuk minta Claude merangkum kondisi bisnis + rekomendasi dalam bahasa natural, berdasarkan data ringkasan (bukan data mentah) 120 hari terakhir. Butuh `ANTHROPIC_API_KEY` terisi.

---

## Keamanan

- **Login wajib** untuk semua halaman & operasi data (diberlakukan lewat Next.js Middleware + Supabase Auth).
- **Row Level Security** aktif di semua tabel — hanya role `authenticated` yang bisa baca/tulis.
- Fungsi-fungsi database yang menangani transaksi (checkout, tambah produk, import massal, dst) memakai `SECURITY DEFINER` supaya bisa mengunci baris untuk mencegah race condition — makanya izin eksekusinya **dicabut dari publik** dan hanya diberi ke `authenticated` (lihat `0004_security_hardening.sql` & `0005_bulk_import.sql`). Ini sudah diuji langsung: role anonim dipastikan mendapat error *permission denied* saat mencoba memanggil fungsi-fungsi tsb, dan *insert* langsung ke tabel diblok RLS.
- `SUPABASE_SERVICE_ROLE_KEY` **hanya** dipakai script import lokal (`scripts/import-legacy-csv.mjs`), tidak pernah dikirim ke browser atau di-deploy ke Vercel.
- Route API `/api/ai-insight` memeriksa ulang status login di sisi server (lapisan pertahanan kedua di luar middleware) sebelum memanggil API Anthropic, supaya API key-mu tidak bisa "dipinjam" orang lain lewat endpoint itu.
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
psql -d warungtest -f supabase/migrations/0001_init.sql
psql -d warungtest -f supabase/migrations/0002_functions.sql
psql -d warungtest -f supabase/migrations/0003_checkout.sql
psql -d warungtest -f supabase/migrations/0004_security_hardening.sql
psql -d warungtest -f supabase/migrations/0005_bulk_import.sql
psql -d warungtest -f supabase/test/01_test_anon_blocked.sql
psql -d warungtest -f supabase/test/02_test_fifo_checkout.sql
psql -d warungtest -f supabase/test/03_test_bulk_import.sql
```

---

## Batasan & Catatan

- Import data lama (`scripts/import-legacy-csv.mjs`) meringkas tiap produk jadi **1 batch awal** (bukan meniru baris-per-baris riwayat lama), supaya perhitungan stok bersih & tidak dobel. Riwayat detail baru akan tercatat rapi mulai dari pemakaian aplikasi ini.
- Semua produk hasil import lama dibuat sebagai satuan **pcs** — produk timbangan perlu ditambahkan ulang manual dengan satuan gram.
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
