// Login satu formulir: Nomor Anggota + nama desa + PIN. PIN KTA 6 angka = akun anggota;
// PIN Pengurus 8 angka (rahasia, tidak dicetak) = akun pengurus. Dilindungi Turnstile dan batas salah PIN.
// Rahasia (TURNSTILE_SECRET, service role) hanya ada di server Supabase, tidak di repo.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const ASAL_BOLEH = ["https://silsilah-tqn.pages.dev", "http://localhost:8765"];
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const KUNCI_SERVIS = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KUNCI_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RAHASIA_TS = Deno.env.get("TURNSTILE_SECRET") ?? "";

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

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  if (req.method !== "POST") return balas(h, 405, { pesan: "Metode tidak didukung." });

  let b: { nomor?: string; desa?: string; pin?: string; turnstile?: string };
  try { b = await req.json(); } catch { return balas(h, 400, { pesan: "Data tidak terbaca." }); }
  const nomor = String(b.nomor ?? "").replace(/\D/g, "");
  const desa = String(b.desa ?? "").trim().slice(0, 60);
  const pin = String(b.pin ?? "");
  if (!/^\d{10}$/.test(nomor) || !desa || !/^(\d{6}|\d{8})$/.test(pin)) return balas(h, 400, { pesan: SALAH });

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  // 1. Penangkal robot
  if (!RAHASIA_TS) return balas(h, 503, { pesan: "Login anggota belum siap." });
  const f = new FormData();
  f.append("secret", RAHASIA_TS);
  f.append("response", String(b.turnstile ?? ""));
  if (ip) f.append("remoteip", ip);
  const ts = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: f })
    .then((r) => r.json()).catch(() => ({ success: false }));
  if (!ts.success) return balas(h, 403, { pesan: "Pemeriksaan robot gagal. Muat ulang halaman lalu coba lagi." });

  // 2. Cek PIN (dengan batas salah) di database
  const admin = createClient(URL_SB, KUNCI_SERVIS, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: cek, error } = await admin.rpc("cek_login", { p_nomor: Number(nomor), p_desa: desa, p_pin: pin, p_ip: ip });
  if (error) return balas(h, 500, { pesan: "Terjadi gangguan. Coba lagi sebentar." });
  const hasil = cek?.[0];
  if (hasil?.status === "terkunci") return balas(h, 429, { pesan: "Terlalu banyak percobaan salah. Tunggu 15 menit lalu coba lagi." });
  if (hasil?.status !== "ok") return balas(h, 401, { pesan: SALAH });

  // 3. Siapkan akun login (dibuat sekali, tanpa email asli). Pengurus punya akun terpisah dari akun anggotanya.
  const pengurus = hasil.mode === "pengurus";
  const email = `${nomor}@${pengurus ? "pengurus" : "anggota"}.silsilah.invalid`;
  if (!hasil.user_id) {
    const { data: u, error: eu } = await admin.auth.admin.createUser({
      email, email_confirm: true, app_metadata: { peran: hasil.peran, jamaah_id: hasil.jamaah_id },
    });
    if (eu || !u.user) return balas(h, 500, { pesan: "Akun belum bisa dibuat. Hubungi pengurus." });
    const baris = pengurus
      ? { user_id: u.user.id, nama: hasil.nama, peran: hasil.peran }
      : { user_id: u.user.id, nama: hasil.nama, peran: "anggota", jamaah_id: hasil.jamaah_id };
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
  return balas(h, 200, { access_token, refresh_token, expires_at, nama: hasil.nama });
});
