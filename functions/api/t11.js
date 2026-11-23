function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

const COOKIE = "1171_player";
const encoder = new TextEncoder();

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getPlayer(request, env) {
  const cookies = request.headers.get("Cookie") || "";
  const item = cookies.split(";").map(x => x.trim())
    .find(x => x.startsWith(COOKIE + "="));
  if (!item) return null;

  const parts = item.slice(COOKIE.length + 1).split(".");
  if (parts.length !== 3) return null;
  const [idText, expiresText, signature] = parts;
  const id = Number(idText);
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isFinite(expires) || expires < Date.now()) return null;

  const expected = await sign(`${id}.${expires}`, env.SESSION_SECRET);
  if (signature !== expected) return null;
  return await env.DB.prepare(
    "SELECT id, name, alliance FROM game_players WHERE id = ?"
  ).bind(id).first();
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB || !env.SESSION_SECRET) return json({ error: "Sistem ayarları eksik." }, 500);
    const player = await getPlayer(request, env);
    const result = await env.DB.prepare(`
      SELECT p.id, p.name, p.alliance,
             COALESCE(t.infantry, 0) AS infantry,
             COALESCE(t.cavalry, 0) AS cavalry,
             COALESCE(t.archer, 0) AS archer,
             COALESCE(t.infantry, 0) + COALESCE(t.cavalry, 0) + COALESCE(t.archer, 0) AS total,
             t.updated_at
      FROM game_players p
      INNER JOIN player_t11 t ON t.player_id = p.id
      ORDER BY total DESC, p.name COLLATE NOCASE ASC
    `).all();

    let mine = null;
    if (player) {
      mine = await env.DB.prepare(
        "SELECT infantry, cavalry, archer, updated_at FROM player_t11 WHERE player_id = ?"
      ).bind(player.id).first();
      if (!mine) mine = { infantry: 0, cavalry: 0, archer: 0, updated_at: null };
    }

    return json({ loggedIn: !!player, player, mine, ranking: result.results });
  } catch (error) {
    console.error("T11 GET ERROR", error);
    return json({ error: "T11 bilgileri alınamadı." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.SESSION_SECRET) return json({ error: "Sistem ayarları eksik." }, 500);
    const player = await getPlayer(request, env);
    if (!player) return json({ error: "T11 bilgilerini kaydetmek için 1171 ARENA bölümünden oyuncu PIN'inle giriş yapmalısın." }, 401);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Geçersiz istek." }, 400); }

    const fields = ["infantry", "cavalry", "archer"];
    const values = fields.map(field => body[field]);
    for (const value of values) {
      if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) {
        return json({ error: "Asker sayıları 0 ile 1.000.000.000 arasında tam sayı olmalı." }, 400);
      }
    }

    await env.DB.prepare(`
      INSERT INTO player_t11 (player_id, infantry, cavalry, archer, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(player_id) DO UPDATE SET
        infantry = excluded.infantry,
        cavalry = excluded.cavalry,
        archer = excluded.archer,
        updated_at = datetime('now')
    `).bind(player.id, values[0], values[1], values[2]).run();

    return json({ success: true });
  } catch (error) {
    console.error("T11 POST ERROR", error);
    return json({ error: "T11 bilgileri kaydedilemedi." }, 500);
  }
}
