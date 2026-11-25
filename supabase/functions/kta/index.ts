// KTA Digital: membuat kode QR KTA (bertanda tangan) dan memeriksa keaslian KTA.
// Kunci tanda tangan KTA_KUNCI hanya dipasang admin pusat di rahasia Supabase (tidak di repo, tidak dipegang Claude).
//   aksi "qr"   (login): kode QR untuk jamaah yang boleh dilihat akun ini (hak dijaga RLS).
//   aksi "cek"  (publik): periksa kode dari QR KTA baru.
//   aksi "lama" (publik): periksa KTA lama dengan Nomor Anggota + nama (dibatasi per IP).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const ASAL_BOLEH = ["https://silsilah-tqn.pages.dev", "http://localhost:8765"];
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const KUNCI_SERVIS = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KUNCI_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const KUNCI_KTA = Deno.env.get("KTA_KUNCI") ?? "";

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
  new Response(JSON.stringify(data), { status, headers: { ...h, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
let kunciHmac: CryptoKey | null = null;
async function tandaTangan(teks: string) {
  kunciHmac ??= await crypto.subtle.importKey("raw", new TextEncoder().encode(KUNCI_KTA), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", kunciHmac, new TextEncoder().encode(teks)));
  return b64url(s).slice(0, 16); // 96 bit
}
function samaAman(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
const rapikan = (t: string) => t.toLowerCase().replace(/[^a-z]/g, "");
const statusDari = (r: { aktif: boolean; wafat: boolean }) => (r.wafat ? "Wafat" : r.aktif ? "Aktif" : "Tidak aktif");

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  if (req.method !== "POST") return balas(h, 405, { pesan: "Metode tidak didukung." });
  if (KUNCI_KTA.length < 32) return balas(h, 503, { pesan: "Kunci KTA belum dipasang admin pusat." });

  let b: { aksi?: string; jamaah_id?: number; kode?: string; nomor?: string; nama?: string };
  try { b = await req.json(); } catch { return balas(h, 400, { pesan: "Data tidak terbaca." }); }
  const admin = createClient(URL_SB, KUNCI_SERVIS, { auth: { persistSession: false, autoRefreshToken: false } });

  if (b.aksi === "qr") {
    const auth = req.headers.get("authorization") ?? "";
    const pengguna = createClient(URL_SB, KUNCI_ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: j } = await pengguna.from("jamaah").select("nomor_anggota").eq("id", Number(b.jamaah_id)).maybeSingle();
    if (!j) return balas(h, 403, { pesan: "Akun ini tidak punya izin melihat KTA jamaah ini." });
    const { data: info } = await admin.rpc("kta_info", { p_nomor: j.nomor_anggota });
    const versi = info?.[0]?.versi ?? 1;
    const isi = `1-${j.nomor_anggota}-${versi}`;
    const kode = `${isi}-${await tandaTangan(isi)}`;
    return balas(h, 200, { kode, versi });
  }

  if (b.aksi === "cek") {
    const m = /^1-(\d{10})-(\d{1,3})-([A-Za-z0-9_-]{16})$/.exec(String(b.kode ?? "").trim());
    if (!m || !samaAman(m[3], await tandaTangan(`1-${m[1]}-${m[2]}`))) return balas(h, 200, { hasil: "palsu" });
    const { data: info } = await admin.rpc("kta_info", { p_nomor: Number(m[1]) });
    const r = info?.[0];
    if (!r) return balas(h, 200, { hasil: "palsu" });
    if (Number(m[2]) !== r.versi) return balas(h, 200, { hasil: "diganti", nomor: m[1] });
    return balas(h, 200, { hasil: "asli", nomor: m[1], nama: r.nama, desa: r.desa, kecamatan: r.kecamatan, kabupaten: r.kabupaten, status: statusDari(r) });
  }

  if (b.aksi === "lama") {
    const nomor = String(b.nomor ?? "").replace(/\D/g, "");
    const nama = rapikan(String(b.nama ?? "").slice(0, 120));
    if (!/^\d{10}$/.test(nomor) || nama.length < 3) return balas(h, 400, { pesan: "Isi Nomor Anggota (10 angka) dan nama sesuai kartu." });
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const { data: boleh } = await admin.rpc("boleh_cek_kta", { p_ip: ip });
    if (!boleh) return balas(h, 429, { pesan: "Terlalu banyak pemeriksaan. Tunggu 15 menit lalu coba lagi." });
    const { data: info } = await admin.rpc("kta_info", { p_nomor: Number(nomor) });
    const r = info?.[0];
    if (!r || rapikan(r.nama) !== nama) return balas(h, 200, { hasil: "tidak_cocok" });
    return balas(h, 200, { hasil: "terdaftar", nomor, nama: r.nama, desa: r.desa, kecamatan: r.kecamatan, kabupaten: r.kabupaten, status: statusDari(r) });
  }

  return balas(h, 400, { pesan: "Aksi tidak dikenal." });
});
