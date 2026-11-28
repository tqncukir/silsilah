// Notifikasi ke HP (Tahap 16): mengirim Web Push tanpa pustaka luar (RFC 8291 aes128gcm + RFC 8292 VAPID, WebCrypto).
//   aksi "pagi" | "sore" | "tugas" (+ jenis): dari database (pg_cron / pemicu) dengan header x-notif-panggil = NOTIF_PANGGIL.
//   aksi "uji": dari pemakai yang sudah masuk (token Supabase) → pemberitahuan uji ke perangkatnya sendiri (maks 1/menit).
// Rahasia (VAPID_PRIVATE, NOTIF_PANGGIL) hanya dari Edge Function Secrets, dipasang Admin Pusat. verify_jwt dimatikan:
// fungsi ini memeriksa sendiri (kunci panggil atau token pemakai).
const env = (k: string) => ((globalThis as any).Deno?.env.get(k) ?? "") as string;
const URL_SB = env("SUPABASE_URL");
const KUNCI_SERVIS = env("SUPABASE_SERVICE_ROLE_KEY");
const KUNCI_ANON = env("SUPABASE_ANON_KEY");
const VAPID_PUBLIC = env("VAPID_PUBLIC");
const VAPID_PRIVATE = env("VAPID_PRIVATE");
const VAPID_SUBJECT = env("VAPID_SUBJECT") || "mailto:jtccukir2022@gmail.com";
const NOTIF_PANGGIL = env("NOTIF_PANGGIL");
const ASAL_BOLEH = ["https://silsilah.tqncukir.id", "https://silsilah-tqn.pages.dev"];
// Hanya layanan push resmi (Google/Android & Chrome, Apple, Mozilla, Microsoft). Alamat lain dibuang, tidak dihubungi.
const HOST_PUSH = /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;

// ===== Web Push =====
const enc = new TextEncoder();
export const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const ub64 = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const gabung = (...a: Uint8Array[]) => {
  const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of a) { o.set(x, i); i += x.length; }
  return o;
};
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, panjang: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, panjang * 8));
}
// RFC 8291: isi dienkripsi untuk satu perangkat (kunci p256dh + rahasia auth dari langganannya).
export async function enkripsi(isi: Uint8Array, p256dh: string, rahasiaAuth: string) {
  const uaPub = ub64(p256dh), auth = ub64(rahasiaAuth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, gabung(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const garam = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(garam, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(garam, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const kunci = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sandi = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, kunci, gabung(isi, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return gabung(garam, rs, new Uint8Array([asPub.length]), asPub, sandi);
}
// RFC 8292: JWT ES256 untuk layanan push (aud = asal alamat endpoint, berlaku 12 jam).
export async function jwtVapid(aud: string, pub: string, priv: string, subjek: string, sekarang = Date.now()) {
  const raw = ub64(pub);
  const k = await crypto.subtle.importKey("jwk",
    { kty: "EC", crv: "P-256", d: priv, x: b64u(raw.slice(1, 33)), y: b64u(raw.slice(33, 65)), ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const kepala = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const isi = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(sekarang / 1000) + 12 * 3600, sub: subjek })));
  const ttd = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, enc.encode(`${kepala}.${isi}`)));
  return `${kepala}.${isi}.${b64u(ttd)}`;
}
type Langganan = { endpoint: string; p256dh: string; auth: string };
export async function kirimPush(l: Langganan, data: unknown, kunci: { pub: string; priv: string; subjek: string }, kirim = fetch) {
  const jwt = await jwtVapid(new URL(l.endpoint).origin, kunci.pub, kunci.priv, kunci.subjek);
  const badan = await enkripsi(enc.encode(JSON.stringify(data)), l.p256dh, l.auth);
  const r = await kirim(l.endpoint, {
    method: "POST", body: badan,
    headers: { Authorization: `vapid t=${jwt}, k=${kunci.pub}`, "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream", TTL: "43200", Urgency: "normal" },
  });
  return r.status;
}

// ===== Haul pekan ini (kalender Hijriah Ummul Qura, sama dengan aplikasi) =====
const _hij = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
const hijriah = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const p = Object.fromEntries(_hij.formatToParts(new Date(Date.UTC(y, m - 1, d, 12))).map((x) => [x.type, x.value]));
  return { d: Number(p.day), m: Number(p.month), y: Number(String(p.year).replace(/\D/g, "")) };
};
const hariIniWib = (sekarang = Date.now()) => new Date(sekarang + 7 * 3600e3).toISOString().slice(0, 10);
// Kalimat haul 7 hari ke depan: nama masyayikh (maks 2) + jumlah almarhum lainnya (nama jamaah tidak disebut di layar kunci).
export function kalimatHaul(baris: { jenis: string; nama: string; tanggal_wafat: string }[], sekarang = Date.now()) {
  const pekan = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const h = hijriah(new Date(Date.parse(hariIniWib(sekarang)) + i * 864e5).toISOString().slice(0, 10));
    if (!pekan.has(`${h.m}-${h.d}`)) pekan.set(`${h.m}-${h.d}`, h.y);
  }
  const haul = baris.filter((a) => { const w = hijriah(a.tanggal_wafat), y = pekan.get(`${w.m}-${w.d}`); return y !== undefined && y - w.y >= 1; });
  if (!haul.length) return null;
  const masy = haul.filter((a) => a.jenis === "masyayikh").map((a) => a.nama), lain = haul.length - masy.length;
  if (!masy.length) return `${lain} almarhum jamaah dan keluarga haul pekan ini. Mari kirimkan doa.`;
  const nama = masy.slice(0, 2).join(" dan ") + (masy.length > 2 ? ` dan ${masy.length - 2} masyayikh lainnya` : "");
  return `${nama}${lain ? `, serta ${lain} almarhum jamaah dan keluarga` : ""}. Mari kirimkan doa.`;
}

// ===== Server =====
const rpc = (fungsi: string, isi: unknown) => fetch(`${URL_SB}/rest/v1/rpc/${fungsi}`, {
  method: "POST", body: JSON.stringify(isi),
  headers: { apikey: KUNCI_SERVIS, Authorization: `Bearer ${KUNCI_SERVIS}`, "Content-Type": "application/json" },
});
function samaAman(a: string, b: string) { // perbandingan waktu-tetap
  const x = enc.encode(a), y = enc.encode(b);
  let beda = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) beda |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return beda === 0;
}
function cors(asal: string | null) {
  return { "Access-Control-Allow-Origin": asal && ASAL_BOLEH.includes(asal) ? asal : ASAL_BOLEH[0], Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
}
const jawab = (isi: unknown, status: number, asal: string | null) =>
  new Response(JSON.stringify(isi), { status, headers: { ...cors(asal), "Content-Type": "application/json" } });

type Baris = Langganan & { judul: string; isi: string; url: string };
async function kirimSemua(baris: Baris[], tag: string) {
  const hasil = { terkirim: 0, gagal: 0, dibuang: 0 };
  const kunci = { pub: VAPID_PUBLIC, priv: VAPID_PRIVATE, subjek: VAPID_SUBJECT };
  let i = 0;
  const kerja = async () => {
    while (i < baris.length) {
      const b = baris[i++];
      try {
        if (!HOST_PUSH.test(new URL(b.endpoint).hostname)) { hasil.dibuang++; await rpc("notif_langganan_mati", { p_endpoint: b.endpoint }); continue; }
        const st = await kirimPush(b, { judul: b.judul, isi: b.isi, url: b.url, tag }, kunci);
        if (st >= 200 && st < 300) hasil.terkirim++;
        else if (st === 404 || st === 410) { hasil.dibuang++; await rpc("notif_langganan_mati", { p_endpoint: b.endpoint }); }
        else hasil.gagal++;
      } catch { hasil.gagal++; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(20, baris.length) }, kerja));
  return hasil;
}

if ((globalThis as any).Deno?.serve) (globalThis as any).Deno.serve(async (req: Request) => {
  const asal = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(asal) });
  if (req.method !== "POST") return jawab({ pesan: "Metode tidak didukung." }, 405, asal);
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return jawab({ pesan: "Kunci notifikasi belum dipasang admin pusat." }, 503, asal);
  let isi: { aksi?: string; jenis?: string };
  try { isi = await req.json(); } catch { return jawab({ pesan: "Permintaan tidak valid." }, 400, asal); }

  let baris: Baris[];
  if (isi.aksi === "uji") {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const u = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: KUNCI_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return jawab({ pesan: "Silakan masuk dulu." }, 401, asal);
    const { id } = await u.json();
    const r = await rpc("notif_uji", { p_uid: id });
    if (!r.ok) return jawab({ pesan: "Tunggu satu menit sebelum mengirim uji lagi." }, 429, asal);
    baris = await r.json();
    if (!baris.length) return jawab({ pesan: "Perangkat ini belum terdaftar. Tekan Aktifkan dulu." }, 404, asal);
  } else {
    if (!NOTIF_PANGGIL || !samaAman(req.headers.get("x-notif-panggil") ?? "", NOTIF_PANGGIL)) return jawab({ pesan: "Tidak berhak." }, 401, asal);
    let r: Response;
    if (isi.aksi === "pagi" || isi.aksi === "sore") {
      let haul: string | null = null;
      if (isi.aksi === "sore" && new Date(Date.now() + 7 * 3600e3).getUTCDay() === 4) { // Kamis (WIB)
        const h = await rpc("notif_haul_data", {});
        if (h.ok) haul = kalimatHaul(await h.json());
      }
      r = await rpc("notif_susun", { p_slot: isi.aksi, p_haul: haul });
    } else if (isi.aksi === "tugas" && (isi.jenis === "berita_diajukan" || isi.jenis === "bantuan_diajukan")) {
      r = await rpc("notif_tugas", { p_jenis: isi.jenis });
    } else return jawab({ pesan: "Aksi tidak dikenal." }, 400, asal);
    if (!r.ok) return jawab({ pesan: "Penyusun notifikasi gagal." }, 500, asal);
    baris = await r.json();
  }
  return jawab(await kirimSemua(baris, isi.aksi ?? "silsilah"), 200, asal);
});
