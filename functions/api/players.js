
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
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

  return toBase64(result);
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const action = body.action;

    const name = String(body.name || "").trim();
    const alliance = String(body.alliance || "").trim();
    const pin = String(body.pin || "");

    if (!env.DB) {
      return json({ error: "Veritabanı bağlantısı bulunamadı." }, 500);
    }

    if (!name || name.length > 30) {
      return json({ error: "Oyuncu adı 1-30 karakter olmalı." }, 400);
    }

    if (!/^\d{4}$/.test(pin)) {
      return json({ error: "PIN 4 rakamdan oluşmalı." }, 400);
    }

    if (action === "register") {
      if (!alliance || alliance.length > 40) {
        return json({ error: "İttifak adı 1-40 karakter olmalı." }, 400);
      }

      const existing = await env.DB.prepare(
        "SELECT id FROM game_players WHERE LOWER(name) = LOWER(?)"
      ).bind(name).first();

      if (existing) {
        return json({ error: "Bu oyuncu adı zaten kayıtlı." }, 409);
      }

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const pinHash = await hashPin(pin, salt);

      const result = await env.DB.prepare(
        `INSERT INTO game_players (name, alliance, pin_hash, pin_salt)
         VALUES (?, ?, ?, ?)`
      ).bind(name, alliance, pinHash, toBase64(salt)).run();

      return json({
        success: true,
        player: {
          id: result.meta.last_row_id,
          name,
          alliance
        }
      });
    }

    if (action === "login") {
      const player = await env.DB.prepare(
        `SELECT id, name, alliance, pin_hash, pin_salt
         FROM game_players
         WHERE LOWER(name) = LOWER(?)`
      ).bind(name).first();

      if (!player) {
        return json({ error: "Oyuncu kaydı bulunamadı." }, 404);
      }

      const salt = Uint8Array.from(
        atob(player.pin_salt),
        char => char.charCodeAt(0)
      );

      const enteredHash = await hashPin(pin, salt);

      if (enteredHash !== player.pin_hash) {
        return json({ error: "PIN hatalı." }, 401);
      }

      return json({
        success: true,
        player: {
          id: player.id,
          name: player.name,
          alliance: player.alliance
        }
      });
    }

    return json({ error: "Geçersiz işlem." }, 400);
  } catch (error) {
    return json({ error: "İşlem sırasında bir hata oluştu." }, 500);
  }
}
