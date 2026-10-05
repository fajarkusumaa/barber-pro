# BarberBot — MVP Lite: Development Plan & Documentation (Next.js + Neon)

Chatbot reservasi barber. **MVP Lite = 1 cabang, pelanggan memilih kapster yang tersedia dan jam, lalu menerima nomor tiket.**
Dikembangkan dan diuji lewat **Telegram** lebih dulu, lalu WhatsApp ditambahkan sebagai channel kedua di fase terakhir.

> Nama `BarberBot` hanya placeholder. Ganti sesuai keinginan.

---

## 0. Cara Memakai Dokumen Ini dengan AI Coding Assistant (Gemini)

1. Simpan file ini sebagai `docs/PLAN.md` di root repo.
2. Salin bagian **Conventions** (Bagian 9) ke file konteks proyek. Untuk Gemini CLI namanya `GEMINI.md`; untuk tool lain, pakai file instruksi yang didukung tool tersebut.
3. Kerjakan **satu fase per sesi**. Contoh prompt:
   > Baca `docs/PLAN.md`. Kerjakan Phase 1 saja. Tulis test untuk setiap service. Setelah selesai, jalankan semua test dan ringkas apa yang sudah dibuat. Jangan mulai Phase 2.
4. Minta AI memeriksa **versi Next.js, Drizzle, dan library lain yang terpasang** dan membaca dokumentasi resmi versi itu sebelum menulis kode. API Next.js (misalnya `params` async, `after`, cara proteksi route) berubah antar versi, dan model sering menulis sintaks versi lama.
5. Setelah tiap fase: review diff, jalankan test, commit, baru lanjut.

---

## 1. Ringkasan & Scope

**Latar belakang:** barber pilot memakai chat WhatsApp manual untuk reservasi. Admin baru online jam 14.00, sebelumnya kapster yang membalas di sela pekerjaan. Cabang ada 3-4, tapi MVP hanya mencakup 1 cabang.

**Alur pelanggan (MVP):**
1. Pelanggan mengirim "Halo" atau `/start` ke bot.
2. Bot menampilkan menu: **Booking** dan **Booking saya**.
3. Pelanggan memilih **tanggal** (7 hari ke depan).
4. Bot menampilkan **kapster yang masih punya slot kosong** di tanggal itu, plus opsi "Siapa saja".
5. Pelanggan memilih **jam** dari slot kosong (dikelompokkan pagi/siang/sore).
6. Bot meminta konfirmasi, lalu mengirim **nomor tiket** (contoh `BRB-7K2P`) berisi kapster, tanggal, dan jam.

**In scope**
- Bot Telegram dengan tombol (inline keyboard), dibangun di atas lapisan channel supaya WhatsApp bisa ditambahkan nanti.
- Availability real-time dari database, anti double booking di level database.
- "Booking saya": lihat dan batalkan booking sendiri.
- Dashboard admin: kelola kapster, jadwal kerja, libur; daftar booking; booking manual; aksi selesai / no-show / batalkan.
- Halaman `/device` untuk HP/tablet cabang: Walk-in, Selesai, dan Sibuk 30 menit per kapster. Tanpa ini, slot di bot tidak akurat karena sistem tidak tahu pelanggan yang datang langsung.
- Notifikasi ke pelanggan saat admin membatalkan booking.

**Asumsi MVP:** tidak ada pilihan layanan. Semua booking memakai durasi standar (default 30 menit, di config).

**Out of scope (masuk backlog, Bagian 14)**
- Multi-cabang, pilihan layanan dan harga.
- Pengaman no-show, pengingat otomatis, handoff ke admin.
- DP/pembayaran, loyalty, LLM, multi-tenant, balas chat dari dashboard.

---

## 2. Tech Stack

| Layer | Pilihan | Catatan |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript strict | Backend dan dashboard dalam satu aplikasi |
| UI | Tailwind CSS + shadcn/ui | Untuk dashboard dan `/device` |
| Database | Neon Postgres | Mendukung ekstensi `btree_gist` (dibutuhkan constraint anti double booking) |
| ORM | Drizzle ORM + drizzle-kit | Constraint overlap lewat migration SQL kustom |
| Driver DB | `@neondatabase/serverless` (mode Pool/WebSocket) | Diperlukan untuk transaksi; mode HTTP tidak mendukung transaksi interaktif. Cek dokumentasi versi terbaru |
| Validasi | Zod | Env, input Server Action, payload webhook |
| Auth | Better Auth (email + password), atau Auth.js bila lebih familiar | Satu atau dua akun admin sudah cukup |
| Channel dev | Telegram Bot API (`fetch` tipis, tanpa framework bot) | Gratis, tanpa nomor telepon |
| Channel produksi | WhatsApp Cloud API (Phase 5) | |
| Test | Vitest | |
| Deploy | Vercel + Neon | Lihat Bagian 8 |

**Timezone:** semua waktu disimpan sebagai `timestamptz` (UTC). Perhitungan jam kerja dan slot memakai zona `Asia/Jakarta` lewat satu helper di `lib/time.ts` (misalnya dengan `date-fns-tz`). Jangan menghitung jam lokal dengan `new Date()` mentah.

---

## 3. Arsitektur

```
Telegram / WhatsApp
        │  webhook POST  (atau long polling untuk dev lokal Telegram)
        ▼
 /api/webhooks/telegram   /api/webhooks/whatsapp
        │ 1. verifikasi secret/signature
        │ 2. balas 200 cepat
        │ 3. after(): dedupe, normalisasi ke InboundMessage, proses
        ▼
 ConversationService (state machine) ──▶ AvailabilityService, BookingService
        │
        ▼
 Channel interface ──▶ TelegramChannel | WhatsAppChannel
```

Tanpa queue terpisah di MVP Lite: alurnya ringan, jadi pemrosesan dilakukan setelah respons 200 dikirim memakai `after()` dari `next/server`. Jaga agar proses tetap singkat (ada batas durasi function di Vercel).

### 3.1 Lapisan channel (inti desain)

`ConversationService` tidak boleh tahu Telegram atau WhatsApp. Ia hanya bicara lewat tipe netral.

```ts
// src/server/messaging/types.ts
export type InboundMessage = {
  channel: 'telegram' | 'whatsapp';
  externalId: string;      // chat id Telegram / wa_id WhatsApp
  messageId: string;       // update_id / wamid, untuk dedupe
  name?: string;
  kind: 'text' | 'action';
  text?: string;
  actionId?: string;
};

export type OutboundMessage =
  | { type: 'text'; text: string }
  | { type: 'buttons'; text: string; buttons: { id: string; title: string }[] }          // maks 3
  | { type: 'list'; text: string; buttonLabel: string; rows: { id: string; title: string; description?: string }[] }; // maks 10

// src/server/channels/types.ts
export interface Channel {
  name: 'telegram' | 'whatsapp';
  send(to: string, message: OutboundMessage): Promise<void>;
}
```

`MessageBuilder` menyusun pesan netral dan **memaksa batas WhatsApp untuk semua channel**:
- Buttons: maksimal 3 tombol, judul maksimal 20 karakter.
- List: maksimal 10 baris, judul baris maksimal 24 karakter, deskripsi maksimal 72 karakter.
- Body maksimal 1.024 karakter.

(Verifikasi ulang batas ini di dokumentasi Meta saat Phase 5.) Telegram sebenarnya lebih longgar, tapi batas ini dipakai di kedua channel agar alur yang lolos di Telegram tidak gagal di WhatsApp.

Render per channel:
- **Telegram:** `buttons` menjadi satu baris inline keyboard; `list` menjadi inline keyboard satu tombol per baris. Jawab setiap `callback_query` dengan `answerCallbackQuery` agar tombol tidak menggantung.
- **WhatsApp:** `buttons` menjadi interactive reply buttons; `list` menjadi interactive list message.

### 3.2 Struktur folder inti
```
src/
  app/
    api/webhooks/telegram/route.ts
    api/webhooks/whatsapp/route.ts      # Phase 5
    api/device/state/route.ts
    (admin)/admin/                      # bookings, capsters, customers
    device/page.tsx
    login/page.tsx
  db/
    schema.ts
    index.ts
    migrations/
  lib/
    env.ts          # validasi env dengan Zod
    time.ts         # helper Asia/Jakarta
    ticket.ts
    config.ts       # bookingConfig
  server/
    channels/{types,telegram,whatsapp,fake}.ts
    messaging/{types,builder}.ts
    bot/{conversation,texts.id}.ts
    bot/steps/*.ts
    booking/{availability,booking}.ts
  components/ui/                        # shadcn
scripts/
  telegram-poll.ts
  set-telegram-webhook.ts
  seed.ts
tests/
```

Semua file di `src/server/` diawali `import 'server-only'`.

---

## 4. Database Schema

Semua tabel memakai `id` bigint (identity) dan `created_at`/`updated_at`, kecuali disebut lain. Tabel user dan sesi dikelola library auth.

**branches** — `name`, `address` (nullable), `is_active`. Hanya 1 baris di MVP, tapi tabel dan `branch_id` tetap ada agar multi-cabang mudah ditambah.

**capsters** — `branch_id`, `name`, `is_active`

**capster_schedules** — `capster_id`, `day_of_week` (0-6), `start_time`, `end_time`
> Boleh lebih dari satu baris per hari (untuk jam istirahat).

**time_offs** — `capster_id`, `starts_at`, `ends_at`, `reason` (nullable). Dipakai untuk libur dan tombol "Sibuk 30 menit".

**customers** — `channel` (`telegram`|`whatsapp`), `external_id`, `name` (nullable), `last_inbound_at` (timestamptz). Unique pada (`channel`, `external_id`).

**bookings**
- `ticket_code` (unique, mis. `BRB-7K2P`; 4 karakter dari alfabet tanpa karakter ambigu seperti 0/O dan 1/I; ulangi jika terjadi unique violation `23505`)
- `customer_id` (nullable untuk walk-in), `guest_name` (nullable)
- `branch_id`, `capster_id`
- `starts_at`, `ends_at` (timestamptz)
- `status`: `confirmed` | `completed` | `no_show` | `cancelled`
- `source`: `bot` | `admin` | `walkin`
- `cancelled_at` (nullable), `notes` (nullable)

Constraint anti double booking, lewat **migration SQL kustom** (`drizzle-kit generate --custom`), karena Drizzle tidak mendefinisikan exclusion constraint:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
ADD CONSTRAINT bookings_no_overlap
EXCLUDE USING gist (
  capster_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
) WHERE (status <> 'cancelled');
```
Saat insert gagal karena constraint ini, Postgres mengembalikan error kode `23P01` (exclusion violation). Tangkap dan ubah menjadi hasil "slot terisi".

**chat_sessions** — `customer_id` (unique), `state`, `context` (jsonb), `last_activity_at`

**chat_messages** — `channel`, `external_message_id` (update_id Telegram atau wamid WhatsApp), `customer_id`, `direction` (`in`|`out`), `type`, `payload` (jsonb), `created_at`. Unique pada (`channel`, `external_message_id`) untuk dedupe webhook (insert dengan `ON CONFLICT DO NOTHING`; jika tidak ada baris baru, pesan sudah pernah diproses).

**Index penting:** `bookings(capster_id, starts_at)`, `bookings(branch_id, starts_at)`, `bookings(status, starts_at)`.

---

## 5. Alur Bot

### 5.1 State machine
```
IDLE ─▶ CHOOSING_DATE ─▶ CHOOSING_CAPSTER ─▶ CHOOSING_TIME_GROUP
     ─▶ CHOOSING_TIME ─▶ CONFIRMING ─▶ IDLE (tiket terbit)

Dari state mana pun: "menu" atau /start → IDLE
```
- Sesi kembali ke `IDLE` setelah 30 menit tanpa aktivitas.
- Proses pesan per pelanggan harus berurutan. Bungkus pemrosesan dalam transaksi dengan advisory lock:

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${channel}:${externalId}`}))`);
  // muat sesi, jalankan satu langkah percakapan, simpan sesi
});
```
(Kirim pesan balasan setelah transaksi selesai, bukan di dalamnya.)

### 5.2 Menu utama
- `Booking` → `menu:book`
- `Booking saya` → `menu:mine`

### 5.3 ID aksi (payload dalam `callback_data` / `id` tombol)

| Aksi | ID |
|---|---|
| Pilih tanggal | `date:YYYY-MM-DD` |
| Pilih kapster | `capster:{id}` atau `capster:any` |
| Pilih kelompok jam | `tg:morning` / `tg:afternoon` / `tg:evening` |
| Pilih jam | `slot:HH:MM` |
| Konfirmasi | `confirm:yes` / `confirm:no` |
| Batalkan booking | `cancel:{ticket_code}` |

ID harus pendek (batas `callback_data` Telegram 64 byte).

**Proteksi tombol basi:** jika ID yang diterima tidak cocok dengan state saat ini, jangan error. Kirim ulang langkah yang sedang aktif.

### 5.4 Detail langkah
- **Kapster:** tampilkan hanya kapster yang punya minimal satu slot kosong di tanggal terpilih. Tambahkan "Siapa saja" jika ada lebih dari satu kapster tersedia.
- **Jam:** jika slot lebih dari 10, kelompokkan dulu (Pagi/Siang/Sore). Jika satu kelompok masih lebih dari 10, tampilkan 9 slot dan satu baris "Lihat lainnya".
- **Konfirmasi:** ringkas kapster, tanggal, jam. Tombol `Ya, booking` dan `Ubah`.
- **Tiket:** kirim kode tiket beserta detail dan petunjuk membatalkan lewat "Booking saya".
- **Booking saya:** daftar booking mendatang (maks 10). Pilih satu untuk melihat detail dan tombol `Batalkan`, lalu minta konfirmasi.

### 5.5 Input teks bebas
- `/start`, `menu`, `halo`, `hai` → tampilkan menu.
- Teks lain di tengah alur: balas "Silakan pilih lewat tombol ya 🙏" lalu kirim ulang langkah aktif.
- Untuk bantuan lain, pelanggan menghubungi admin lewat jalur lama (handoff otomatis ada di backlog).

### 5.6 Contoh teks (simpan di `src/server/bot/texts.id.ts`)
- Sapaan: "Halo! Selamat datang di {nama barber} 👋 Mau ngapain hari ini?"
- Konfirmasi: "Cek dulu ya:\n👤 {kapster}\n🗓 {tanggal}, {jam}\n\nBenar?"
- Tiket: "Booking berhasil ✅\nNomor tiket: {code}\n👤 {kapster}\n🗓 {tanggal}, {jam}\n\nUntuk membatalkan, pilih 'Booking saya'."
- Slot bentrok: "Maaf, jam itu baru saja terisi. Silakan pilih jam lain."
- Dibatalkan admin: "Maaf, booking {code} dibatalkan oleh barber. Silakan booking ulang atau hubungi admin."

---

## 6. Availability & Booking

### 6.1 Config (`src/lib/config.ts`)
- `slotIntervalMinutes` = 30
- `defaultDurationMinutes` = 30
- `bufferMinutes` = 0
- `minLeadMinutes` = 60
- `maxDaysAhead` = 7
- `sessionTimeoutMinutes` = 30
- `ticketPrefix` = "BRB"
- `shopName`

### 6.2 `AvailabilityService`
Untuk satu kapster pada satu tanggal (zona `Asia/Jakarta`):
1. Ambil jendela kerja dari `capster_schedules` pada hari itu.
2. Kurangi dengan `time_offs`.
3. Kurangi dengan booking berstatus bukan `cancelled`. Setiap booking memblokir `[starts_at, ends_at + bufferMinutes)`. Constraint database hanya menjaga overlap keras.
4. Dari jendela bebas, buat slot setiap `slotIntervalMinutes` yang muat `defaultDurationMinutes`.
5. Buang slot yang lebih awal dari `now + minLeadMinutes`.

"Siapa saja": gabungkan slot semua kapster aktif.

Buat fungsi murni (input: jendela kerja, time off, booking, config, waktu sekarang; output: daftar slot) supaya mudah diuji tanpa database.

### 6.3 `BookingService.create`
1. Hitung ulang ketersediaan (jangan percaya slot dari state lama).
2. Jika `capster:any`, pilih kapster otomatis: yang paling sedikit booking hari itu, seri → `id` terkecil.
3. Insert booking dengan `ticket_code`. Jika error `23P01`, untuk "siapa saja" coba kapster berikutnya. Jika tidak ada yang tersisa, kembalikan hasil "slot terisi". Jika error `23505` pada `ticket_code`, buat kode baru dan ulangi.
4. Kembalikan booking untuk dirender sebagai tiket.

### 6.4 Pembatalan
- Dari bot: "Booking saya" → pilih → konfirmasi. Dari dashboard: aksi Batalkan.
- Status menjadi `cancelled`, `cancelled_at` diisi. Slot otomatis tersedia lagi karena constraint mengabaikan `cancelled`.
- Pembatalan oleh admin mengirim notifikasi ke pelanggan (jika `customer_id` ada).

### 6.5 Walk-in & Halaman Perangkat Cabang (`/device`)
- Halaman mobile-first di aplikasi yang sama, dipakai di HP/tablet cabang dengan akun yang tetap login (durasi sesi panjang diatur di konfigurasi auth).
- Catatan keamanan: siapa pun yang memegang perangkat bisa membuka dashboard. Diterima untuk pilot; role `device` terbatas masuk backlog.
- Satu kartu per kapster aktif, refresh otomatis (polling ±15 detik, mis. SWR atau TanStack Query ke `/api/device/state`): nama, status (Kosong / Sedang mengerjakan sampai HH:MM), dan "kosong sampai HH:MM" berdasarkan booking berikutnya.
- Tombol per kartu (Server Action):
  - **Walk-in**: buat booking `source = walkin`, `starts_at = now`, `ends_at = now + defaultDurationMinutes`, `customer_id` null. Jika bentrok dengan booking berikutnya, tampilkan peringatan "Booking berikutnya jam HH:MM" dan sarankan memakai kapster lain atau menangani lewat dashboard.
  - **Selesai**: set `completed` dan `ends_at = min(ends_at, now)` sehingga sisa slot terbuka.
  - **Sibuk 30 menit**: buat `time_offs` dari sekarang selama 30 menit.
- Target: 2 ketukan per aksi, tanpa mengetik.

### 6.6 Bentrok walk-in vs booking bot
Constraint database menolak walk-in yang bertabrakan. Penyelesaian di MVP: admin **membatalkan** booking yang terdampak lewat dashboard (pelanggan otomatis diberi tahu) atau memakai kapster lain untuk walk-in. Aksi "pindahkan ke kapster lain" masuk backlog.

---

## 7. Dashboard Admin

- **Auth:** halaman `/login`. Cek sesi di layout admin **dan** di setiap Server Action. Jangan hanya mengandalkan middleware/proxy untuk proteksi.
- **Kapster:** daftar, tambah/ubah, editor jadwal mingguan, dan daftar libur (`time_offs`).
- **Booking:** default menampilkan booking hari ini. Filter tanggal, kapster, status. Aksi: Selesai, No-show, Batalkan. Badge "terlambat" jika lewat `starts_at` lebih dari 15 menit dan belum selesai.
- **Booking manual:** pilih kapster, tanggal, jam dari `AvailabilityService`, nama tamu, `source = admin`.
- **Pelanggan** (read-only): daftar dan riwayat booking.
- **Ringkasan:** jumlah booking dan walk-in hari ini.
- Semua input Server Action divalidasi dengan Zod.

---

## 8. Setup & Deploy

### 8.1 Neon
- Buat satu project Neon dengan dua branch: `main` (produksi) dan `dev` (development dan test).
- Aktifkan ekstensi lewat migration (`CREATE EXTENSION IF NOT EXISTS btree_gist`).
- Pakai connection string **pooled** untuk aplikasi dan connection string **direct** untuk migration (`drizzle-kit`).
- Cek retensi history/point-in-time restore di plan Neon yang kamu pakai, dan pertimbangkan `pg_dump` berkala sebagai cadangan tambahan.

### 8.2 Telegram
1. Buka `@BotFather` di Telegram, kirim `/newbot`, simpan token.
2. **Pakai dua bot:** satu untuk development (polling), satu untuk produksi (webhook). Satu bot tidak bisa memakai webhook dan polling bersamaan.
3. **Dev lokal tanpa tunnel:** `pnpm tsx scripts/telegram-poll.ts` (long polling `getUpdates`, panggil `deleteWebhook` lebih dulu).
4. **Produksi:** jalankan `scripts/set-telegram-webhook.ts` yang memanggil `setWebhook` ke `https://domain/api/webhooks/telegram` dengan `secret_token`. Route handler wajib memverifikasi header `X-Telegram-Bot-Api-Secret-Token`.
5. Bot hanya bisa mengirim pesan ke pengguna yang sudah menekan Start atau mengirim pesan lebih dulu.

### 8.3 Skeleton webhook (sesuaikan dengan versi Next.js terpasang)
```ts
// src/app/api/webhooks/telegram/route.ts
import { after } from 'next/server';
import { env } from '@/lib/env';
import { handleTelegramUpdate } from '@/server/channels/telegram';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const update = await req.json();
  after(() => handleTelegramUpdate(update)); // dedupe + normalisasi + proses di dalamnya
  return new Response('ok');
}
```

### 8.4 Vercel
- Hubungkan repo ke Vercel, set environment variables untuk Production dan Preview.
- Cek ketentuan plan Vercel yang kamu pakai. Plan gratis (Hobby) umumnya untuk penggunaan non-komersial, jadi untuk pilot berbayar kemungkinan perlu plan berbayar.
- Pastikan durasi maksimal function cukup untuk satu putaran pemrosesan pesan.
- Pengingat otomatis (backlog) membutuhkan scheduler. Batas frekuensi cron di Vercel bergantung plan; alternatifnya cron eksternal yang memanggil endpoint ber-secret.

### 8.5 Environment variables
```
DATABASE_URL=            # Neon pooled
DATABASE_URL_DIRECT=     # Neon direct, untuk migration
AUTH_SECRET=
APP_URL=

TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=

# Phase 5 (WhatsApp), kosongkan dulu
WA_GRAPH_VERSION=
WA_PHONE_NUMBER_ID=
WA_WABA_ID=
WA_ACCESS_TOKEN=
WA_APP_SECRET=
WA_VERIFY_TOKEN=
```
Semua env divalidasi Zod di `lib/env.ts` saat aplikasi mulai.

---

## 9. Conventions (salin ke `GEMINI.md` atau file konteks proyek)

- TypeScript `strict`. Dilarang `any` kecuali ada komentar alasannya.
- Bahasa kode dan nama variabel: Inggris. Teks untuk pelanggan: Bahasa Indonesia, hanya di `texts.id.ts`.
- `ConversationService` tidak boleh mengimpor atau memanggil API Telegram/WhatsApp langsung. Semua lewat `Channel` dan tipe netral.
- Logika bisnis di `src/server/`, bukan di route handler, komponen, atau Server Action (Server Action hanya memanggil service).
- Semua input eksternal (webhook, form, Server Action) divalidasi Zod.
- Jangan hardcode kredensial. Semua lewat env tervalidasi. Jangan pernah mencatat token atau secret ke log.
- Webhook harus idempotent: pesan dengan ID yang sama diproses sekali saja.
- Setiap service wajib punya test. `availability` dan `booking` wajib punya test edge case.
- Periksa versi Next.js dan library yang terpasang dan baca dokumentasinya sebelum memakai API yang tidak pasti.
- Jangan menambah fitur di luar scope Bagian 1 tanpa konfirmasi.
- Setelah tiap perubahan, jalankan typecheck, lint, dan test.

---

## 10. Fase Pengerjaan

Estimasi untuk satu developer. Angka kasar, sesuaikan.

### Phase 0 — Setup (±0,5-1 hari)
- [ ] Project Next.js (TypeScript, Tailwind, shadcn/ui), Drizzle, Vitest, validasi env.
- [ ] Project Neon dengan branch `main` dan `dev`.
- [ ] Setup auth dengan satu akun admin (seed).
- [ ] Buat bot Telegram untuk development (Bagian 8.2).

### Phase 1 — Domain & Availability (±2 hari)
- [ ] Schema Drizzle dan migration sesuai Bagian 4, termasuk migration SQL kustom untuk constraint overlap.
- [ ] Seed: 1 cabang, 2-3 kapster, jadwal kerja.
- [ ] `availability` (fungsi murni) + test: jam istirahat, libur, booking menutup slot, lead time, batas hari, "siapa saja".
- [ ] `booking.create` dan `cancel` + test: double booking paralel ditolak (lewat dua insert bersamaan ke database), auto-assign kapster, kode tiket unik.
- [ ] Walk-in dan aksi selesai-lebih-awal (`ends_at = min(ends_at, now)`) + test.

**Selesai jika:** semua test hijau dan dua proses yang mem-booking slot sama bersamaan hanya menghasilkan satu booking.

### Phase 2 — Channel & Bot Telegram (±2-3 hari)
- [ ] Tipe `InboundMessage`/`OutboundMessage`, interface `Channel`, `MessageBuilder` (dengan batas WhatsApp).
- [ ] `TelegramChannel`, route webhook (verifikasi secret, dedupe), skrip `telegram-poll.ts`.
- [ ] `ConversationService` + steps sesuai Bagian 5, termasuk "Booking saya" dan pembatalan, dengan advisory lock per pelanggan.
- [ ] `FakeChannel` dan test percakapan end-to-end: alur sukses, tombol basi, teks bebas, timeout sesi, slot terisi saat konfirmasi.

**Selesai jika:** dari Telegram di HP, satu booking bisa diselesaikan dari `/start` sampai nomor tiket.

### Phase 3 — Dashboard & `/device` (±2-3 hari)
- [x] Halaman admin sesuai Bagian 7 (kapster dan jadwal, booking dan aksi, booking manual, pelanggan).
- [x] Halaman `/device` (Bagian 6.5).
- [x] Notifikasi pembatalan oleh admin ke pelanggan.

**Selesai jika:** booking dari Telegram muncul di dashboard, dan walk-in dari `/device` menutup slot di bot.

### Phase 4 — Deploy (±0,5-1 hari)
- [ ] Deploy ke Vercel dengan database Neon `main`, jalankan migration.
- [ ] Buat bot Telegram produksi dan daftarkan webhook.
- [ ] Isi data asli barber (kapster, jadwal) dan demo ke owner lewat Telegram.

### Phase 5 — Channel WhatsApp (±2-3 hari, setelah Phase 0-4 stabil)
- [ ] Setup Meta: Developer App, WABA, nomor uji coba dari Meta, token permanen lewat System User, webhook subscribe ke `messages`.
- [ ] `WhatsAppChannel` (teks, reply buttons, list) dan route webhook: verifikasi `hub.challenge` (GET) dan header `X-Hub-Signature-256` terhadap raw body (POST), dedupe `wamid`.
- [ ] Normalisasi payload WhatsApp ke `InboundMessage`. Alur di `ConversationService` tidak boleh berubah.
- [ ] Test dengan fixture payload Meta.
- [ ] Untuk pilot ke pelanggan barber: SIM baru khusus bot yang didaftarkan ke WABA.

**Catatan biaya WhatsApp (verifikasi di halaman harga resmi Meta sebelum pilot):** per Oktober 2026, 1.000 service message pertama per nomor bisnis per bulan gratis. Balasan bebas hanya boleh dikirim dalam jen dela 24 jam setelah pelanggan chat. Template message (di luar jendela) berbayar. Siapa yang menanggung billing setelah deal: WABA milik barber (disarankan) atau milik kamu lalu ditagih ulang.

---

## 11. Testing

| Area | Yang diuji |
|---|---|
| Availability | Jam istirahat, libur, durasi, lead time, batas hari, "siapa saja" (fungsi murni, tanpa DB) |
| Booking | Konkurensi (double booking), auto-assign, pembatalan membuka slot, kode tiket unik |
| Webhook | Secret/signature valid dan invalid, dedupe, payload tombol dan teks |
| Bot | Alur sukses, tombol basi, teks bebas, timeout sesi, slot terisi saat konfirmasi |
| `/device` | Walk-in menutup slot, Selesai membuka sisa slot, Sibuk 30 menit |

Test yang menyentuh database (konkurensi, constraint) berjalan terhadap branch Neon `dev`.

**Uji manual sebelum demo:** selesaikan 10 booking dari beberapa akun Telegram, coba batalkan, coba booking slot yang sama dari dua akun bersamaan, dan coba walk-in saat ada booking berikutnya.

---

## 12. Perbedaan Telegram vs WhatsApp (jangan lupa saat Phase 5)

| Hal | Telegram | WhatsApp |
|---|---|---|
| Identitas pelanggan | chat id (tidak ada nomor HP) | nomor HP (`wa_id`) |
| Mengirim pesan kapan saja | Bisa (setelah Start) | Hanya dalam jendela 24 jam, selebihnya template berbayar |
| Batas tombol/list | Longgar | 3 tombol, 10 baris |
| Biaya | Gratis | Per pesan setelah kuota gratis |
| Verifikasi webhook | Header secret | Signature HMAC + verify token |

Karena beda ini, pengingat otomatis dan pesan proaktif (misalnya notifikasi pembatalan) perlu dirancang ulang untuk WhatsApp, dan itu alasan keduanya ditunda.

---

## 13. Risiko & Keputusan Terbuka

| Risiko / Keputusan | Mitigasi |
|---|---|
| Frekuensi walk-in belum diketahui | Dicatat selama demo/pilot; `/device` dibuat sangat ringan |
| Kapster lupa mencatat walk-in | Perangkat dipegang kapster sebelum admin online; 2 ketukan per aksi |
| Pelanggan barber memakai WhatsApp, bukan Telegram | Telegram hanya untuk development dan demo; pilot nyata menunggu Phase 5 |
| Setup Meta lambat atau macet | Phase 0-4 tidak bergantung pada Meta |
| Pemrosesan `after()` terpotong di serverless | Jaga proses singkat; dedupe membuat pengiriman ulang dari Telegram aman |
| Dashboard dibuat manual, memakan waktu | Mulai dari tampilan paling sederhana (tabel dan form shadcn), percantik setelah demo |
| Plan Vercel gratis tidak untuk komersial | Cek ketentuan sebelum pilot berbayar |
| Perangkat bersama memakai akun penuh | Diterima untuk MVP; backlog: role `device` terbatas |
| Barber lain ingin memakai sistem | Backlog: multi-tenant (`business_id`) |

---

## 14. Backlog (setelah MVP Lite)

1. Multi-cabang, pilihan cabang di bot, dan role per cabang.
2. Pilihan layanan, harga, dan durasi per layanan.
3. Pengaman no-show: batas booking aktif per pelanggan, `no_show_count` dan `is_flagged`, status `pending_approval`.
4. Pengingat otomatis dengan tombol "Ya, saya datang" / "Batalkan" (pesan bebas dalam jendela 24 jam di WhatsApp, template utility di luar jendela), memakai scheduler.
5. Handoff ke admin dan inbox balas chat dari dashboard.
6. Aksi "pindahkan booking ke kapster lain" dan geser jam lewat bot.
7. Role `capster` atau `device` yang terbatas, status `in_progress`.
8. DP/pembayaran online, loyalty, laporan pendapatan.
9. LLM untuk pertanyaan bebas ("ada slot sore besok?").
10. Multi-tenant, onboarding mandiri, dan billing langganan.