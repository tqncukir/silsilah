// Login: (a) scan QR KTA (anggota, keputusan Kang 2026-11-26): QR baru bertanda tangan = sesi biasa,
//        QR lama teks biasa = sesi terbatas (hanya data yang tercetak di kartu);
//    (b) Nomor Anggota + nama desa + PIN: PIN KTA 6 angka = anggota, PIN Pengurus 8 angka = pengurus;
//    (c) scan QR KTA + PIN Pengurus 8 angka = pengurus (keputusan Kang 2026-11-26: pengurus tidak boleh QR saja).
//        Nomor dan desa diambil dari kartu yang QR-nya sah, lalu PIN dicek seperti (b) (termasuk batas salah).
// Dilindungi Turnstile, batas salah PIN, dan batas scan per IP.
// Rahasia (TURNSTILE_SECRET, service role) hanya ada di server Supabase, tidak di repo.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const ASAL_BOLEH = ["https://silsilah.tqncukir.id", "https://silsilah-tqn.pages.dev", "http://localhost:8765"];
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const KUNCI_SERVIS = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KUNCI_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RAHASIA_TS = Deno.env.get("TURNSTILE_SECRET") ?? "";
const KUNCI_KTA = Deno.env.get("KTA_KUNCI") ?? "";

const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function tandaTangan(teks: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(KUNCI_KTA), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(teks)))).slice(0, 16);
}
function samaAman(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
const rapikan = (t: string) => t.toLowerCase().replace(/[^a-z]/g, "");
function jarak(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let kiri = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, kiri + (a[i - 1] === b[j - 1] ? 0 : 1)); kiri = t; }
  }
  return d[b.length];
}
function namaCocok(sisaQr: string, nama: string) {
  const q = rapikan(sisaQr), n = rapikan(nama);
  if (n.length < 3) return false;
  if (q.startsWith(n)) return true;
  const batas = Math.max(1, Math.floor(n.length / 8));
  for (let p = n.length - batas; p <= n.length + batas; p++) if (jarak(q.slice(0, p), n) <= batas) return true;
  return false;
}
const SALAH_QR = "QR KTA tidak dikenali. Pastikan memindai QR di Kartu Anggota TQN Cukir.";

function cors(asal: string | null) {
  const o = asal && ASAL_BOLEH.includes(asal) ? asal : ASAL_BOLEH[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
  };
}
const balas = (h: Record<string, string>, status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...h, "Content-Type": "application/json" } });

const SALAH = "Nomor Anggota, nama desa, atau PIN tidak cocok.";
const SALAH_PIN = "PIN Pengurus tidak cocok dengan kartu ini. PIN Pengurus 8 angka.";

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  if (req.method !== "POST") return balas(h, 405, { pesan: "Metode tidak didukung." });

  let b: { nomor?: string; desa?: string; pin?: string; turnstile?: string; qr?: string };
  try { b = await req.json(); } catch { return balas(h, 400, { pesan: "Data tidak terbaca." }); }
  const lewatQr = typeof b.qr === "string";
  const teksQr = String(b.qr ?? "").trim().slice(0, 400);
  const qrBaru = lewatQr ? /(?:^|#)1-(\d{10})-(\d{1,3})-([A-Za-z0-9_-]{16})\s*$/.exec(teksQr) : null;
  const qrLama = lewatQr && !qrBaru ? /^(\d{10})\s+(\S[\s\S]*)$/.exec(teksQr) : null;
  if (lewatQr && !qrBaru && !qrLama) return balas(h, 400, { pesan: SALAH_QR });
  const nomor = lewatQr ? (qrBaru ? qrBaru[1] : qrLama![1]) : String(b.nomor ?? "").replace(/\D/g, "");
  const desa = String(b.desa ?? "").trim().slice(0, 60);
  const pin = String(b.pin ?? "");
  if (!lewatQr && (!/^\d{10}$/.test(nomor) || !desa || !/^(\d{6}|\d{8})$/.test(pin))) return balas(h, 400, { pesan: SALAH });
  const qrPengurus = lewatQr && pin !== "";
  if (qrPengurus && !/^\d{8}$/.test(pin)) return balas(h, 400, { pesan: SALAH_PIN });

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  // 1. Penangkal robot
  if (!RAHASIA_TS) return balas(h, 503, { pesan: "Login anggota belum siap." });
  const f = new FormData();
  f.append("secret", RAHASIA_TS);
  f.append("response", String(b.turnstile ?? ""));
  if (ip) f.append("remoteip", ip);
  const tsJanji = fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: f })
    .then((r) => r.json()).catch(() => ({ success: false }));
  const ROBOT = { pesan: "Pemeriksaan robot gagal. Muat ulang halaman lalu coba lagi." };

  const admin = createClient(URL_SB, KUNCI_SERVIS, { auth: { persistSession: false, autoRefreshToken: false } });
  let hasil: { status?: string; mode?: string; peran?: string; jamaah_id?: number; nama?: string; user_id?: string | null } | undefined;

  if (lewatQr) {
    // 2a. Scan QR KTA (dibatasi per IP). Cek robot, batas IP, dan data kartu berjalan bersamaan;
    //     tidak ada yang dikembalikan sebelum cek robot dan batas IP lolos.
    const [ts, { data: boleh }, { data: info }] = await Promise.all([
      tsJanji,
      admin.rpc("boleh_cek_kta", { p_ip: ip }),
      admin.rpc("kta_info", { p_nomor: Number(nomor) }),
    ]);
    if (!ts.success) return balas(h, 403, ROBOT);
    if (!boleh) return balas(h, 429, { pesan: "Terlalu banyak percobaan. Tunggu 15 menit lalu coba lagi." });
    const r = info?.[0];
    if (!r) return balas(h, 401, { pesan: SALAH_QR });
    if (qrBaru) {
      if (KUNCI_KTA.length < 32) return balas(h, 503, { pesan: "Login dengan QR belum siap." });
      if (!samaAman(qrBaru[3], await tandaTangan(`1-${nomor}-${qrBaru[2]}`))) return balas(h, 401, { pesan: SALAH_QR });
      if (Number(qrBaru[2]) !== r.versi) return balas(h, 401, { pesan: "Kartu ini sudah diganti. Pakai KTA terbaru." });
    } else {
      if (!namaCocok(qrLama![2], r.nama)) return balas(h, 401, { pesan: SALAH_QR });
      if (r.versi > 1) return balas(h, 401, { pesan: "Kartu ini sudah diganti. Pakai KTA terbaru." });
    }
    if (r.wafat || !r.aktif) return balas(h, 403, { pesan: "Kartu ini tidak aktif. Hubungi pengurus." });
    if (qrPengurus) {
      // 2c. Kartu sah + PIN Pengurus: cek PIN dengan batas salah yang sama seperti (b)
      const { data: cek, error } = await admin.rpc("cek_login", { p_nomor: Number(nomor), p_desa: r.desa, p_pin: pin, p_ip: ip });
      if (error) return balas(h, 500, { pesan: "Terjadi gangguan. Coba lagi sebentar." });
      hasil = cek?.[0];
      if (hasil?.status === "terkunci") return balas(h, 429, { pesan: "Terlalu banyak percobaan salah. Tunggu 15 menit lalu coba lagi." });
      if (hasil?.status !== "ok" || hasil?.mode !== "pengurus") return balas(h, 401, { pesan: SALAH_PIN });
    } else {
    const { data: pg } = await admin.from("pengguna").select("user_id, aktif").eq("jamaah_id", r.jamaah_id).eq("peran", "anggota").maybeSingle();
    if (pg && !pg.aktif) return balas(h, 403, { pesan: "Akun ini dinonaktifkan. Hubungi pengurus." });
    hasil = { status: "ok", mode: "anggota", peran: "anggota", jamaah_id: r.jamaah_id, nama: r.nama, user_id: pg?.user_id ?? null };
    }
  } else {
    // 2b. Cek PIN (dengan batas salah) di database, hanya setelah cek robot lolos
    if (!(await tsJanji).success) return balas(h, 403, ROBOT);
    const { data: cek, error } = await admin.rpc("cek_login", { p_nomor: Number(nomor), p_desa: desa, p_pin: pin, p_ip: ip });
    if (error) return balas(h, 500, { pesan: "Terjadi gangguan. Coba lagi sebentar." });
    hasil = cek?.[0];
    if (hasil?.status === "terkunci") return balas(h, 429, { pesan: "Terlalu banyak percobaan salah. Tunggu 15 menit lalu coba lagi." });
    if (hasil?.status !== "ok") return balas(h, 401, { pesan: SALAH });
  }

  // 3. Siapkan akun login (dibuat sekali, tanpa email asli). Pengurus punya akun terpisah dari akun anggotanya.
  const pengurus = hasil!.mode === "pengurus";
  const email = `${nomor}@${pengurus ? "pengurus" : "anggota"}.silsilah.invalid`;
  if (!hasil!.user_id) {
    const { data: u, error: eu } = await admin.auth.admin.createUser({
      email, email_confirm: true, app_metadata: { peran: hasil!.peran, jamaah_id: hasil!.jamaah_id },
    });
    if (eu || !u.user) return balas(h, 500, { pesan: "Akun belum bisa dibuat. Hubungi pengurus." });
    const baris = pengurus
      ? { user_id: u.user.id, nama: hasil!.nama, peran: hasil!.peran }
      : { user_id: u.user.id, nama: hasil!.nama, peran: "anggota", jamaah_id: hasil!.jamaah_id };
    const { error: ep } = await admin.from("pengguna").insert(baris);
    if (ep) return balas(h, 500, { pesan: "Akun belum bisa dibuat. Hubungi pengurus." });
  }

  // 4. Terbitkan sesi login (tanpa mengirim email)
  const { data: link, error: el } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (el || !link?.properties?.hashed_token) return balas(h, 500, { pesan: "Terjadi gangguan. Coba lagi sebentar." });
  const tamu = createClient(URL_SB, KUNCI_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: es } = await tamu.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
  if (es || !s.session) return balas(h, 500, { pesan: "Terjadi gangguan. Coba lagi sebentar." });

  const { access_token, refresh_token, expires_at } = s.session;
  // 5. Sesi dari QR lama ditandai terbatas sebelum diserahkan
  const terbatas = !!qrLama && !qrPengurus;
  if (terbatas) {
    let sid = "";
    try { sid = JSON.parse(atob(access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).session_id ?? ""; } catch { /* kosong */ }
    const { error: et } = sid ? await admin.rpc("tandai_sesi_terbatas", { p_session: sid }) : { error: true };
    if (et) return balas(h, 500, { pesan: "Terjadi gangguan. Coba lagi sebentar." });
  }
  return balas(h, 200, { access_token, refresh_token, expires_at, nama: hasil!.nama, terbatas });
});
