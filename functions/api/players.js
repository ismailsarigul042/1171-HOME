
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

const COOKIE = "1171_player";
const encoder = new TextEncoder();

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return base64url(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value))
  );
}

async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const result = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 210000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return base64url(result);
}

async function createPlayerSession(playerId, secret) {
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${playerId}.${expires}`;
  const signature = await sign(payload, secret);

  return `${COOKIE}=${payload}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`;
}

async function getPlayer(request, secret, DB) {
  const cookies = request.headers.get("Cookie") || "";
  const item = cookies.split(";").map(x => x.trim())
    .find(x => x.startsWith(COOKIE + "="));

  if (!item) return null;

  const parts = item.slice(COOKIE.length + 1).split(".");
  if (parts.length !== 3) return null;

  const [idText, expiresText, signature] = parts;
  const id = Number(idText);
  const expires = Number(expiresText);

  if (!Number.isSafeInteger(id) || id < 1 || expires < Date.now()) {
    return null;
  }

  const expected = await sign(`${id}.${expires}`, secret);
  if (signature !== expected) return null;

  return await DB.prepare(
    "SELECT id, name, alliance FROM game_players WHERE id = ?"
  ).bind(id).first();
}

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.SESSION_SECRET) {
    return json({ error: "Sistem ayarları eksik." }, 500);
  }

  const player = await getPlayer(request, env.SESSION_SECRET, env.DB);

  if (!player) {
    return json({ loggedIn: false });
  }

  return json({ loggedIn: true, player });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.SESSION_SECRET) {
      return json({ error: "Sistem ayarları eksik." }, 500);
    }

    const body = await request.json();
    const action = body.action;
    const name = String(body.name || "").trim();
    const alliance = String(body.alliance || "").trim();
    const pin = String(body.pin || "");

    if (!name || name.length > 30) {
      return json({ error: "Oyuncu adı 1-30 karakter olmalı." }, 400);
    }

    if (!/^\d{4}$/.test(pin)) {
      return json({ error: "PIN 4 rakamdan oluşmalı." }, 400);
    }

    let player;

    if (action === "register") {
      if (!alliance || alliance.length > 40) {
        return json({ error: "İttifak adı 1-40 karakter olmalı." }, 400);
      }

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const pinHash = await hashPin(pin, salt);

      const result = await env.DB.prepare(
        `INSERT INTO game_players (name, alliance, pin_hash, pin_salt)
         VALUES (?, ?, ?, ?)`
      ).bind(name, alliance, pinHash, base64url(salt)).run();

      player = {
        id: result.meta.last_row_id,
        name,
        alliance
      };

    } else if (action === "login") {
      const saved = await env.DB.prepare(
        `SELECT id, name, alliance, pin_hash, pin_salt
         FROM game_players WHERE name = ?`
      ).bind(name).first();

      if (!saved) {
        return json({ error: "Oyuncu kaydı bulunamadı." }, 404);
      }

      const salt = fromBase64url(saved.pin_salt);
      const enteredHash = await hashPin(pin, salt);

      if (enteredHash !== saved.pin_hash) {
        return json({ error: "PIN hatalı." }, 401);
      }

      player = {
        id: saved.id,
        name: saved.name,
        alliance: saved.alliance
      };

    } else {
      return json({ error: "Geçersiz işlem." }, 400);
    }

    const cookie = await createPlayerSession(
      player.id,
      env.SESSION_SECRET
    );

    return json(
      { success: true, player },
      200,
      { "Set-Cookie": cookie }
    );

} catch (error) {
  console.error("OYUNCU KAYIT HATASI:", error);
  return json({ error: "İşlem sırasında bir hata oluştu." }, 500);
}
}

export async function onRequestDelete({ request }) {
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
      "Cache-Control": "no-store"
    }
  });
}
