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
    const eventId = Number(new URL(request.url).searchParams.get("event_id"));
    if (!Number.isSafeInteger(eventId) || eventId < 1) return json({ error: "Geçersiz etkinlik." }, 400);

    const event = await env.DB.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
    if (!event) return json({ error: "Etkinlik bulunamadı." }, 404);

    const player = await getPlayer(request, env);
    const counts = await env.DB.prepare(`
      SELECT status, COUNT(*) AS total
      FROM event_attendance WHERE event_id = ? GROUP BY status
    `).bind(eventId).all();
    const participants = await env.DB.prepare(`
      SELECT p.name, p.alliance, a.status
      FROM event_attendance a
      JOIN game_players p ON p.id = a.player_id
      WHERE a.event_id = ?
      ORDER BY CASE a.status WHEN 'yes' THEN 1 WHEN 'maybe' THEN 2 ELSE 3 END, p.name COLLATE NOCASE
    `).bind(eventId).all();

    let myStatus = null;
    if (player) {
      const mine = await env.DB.prepare(
        "SELECT status FROM event_attendance WHERE event_id = ? AND player_id = ?"
      ).bind(eventId, player.id).first();
      myStatus = mine ? mine.status : null;
    }

    const totals = { yes: 0, maybe: 0, no: 0 };
    for (const row of counts.results) totals[row.status] = row.total;
    return json({ loggedIn: !!player, player, myStatus, counts: totals, participants: participants.results });
  } catch (error) {
    console.error("ATTENDANCE GET ERROR", error);
    return json({ error: "Katılım bilgileri alınamadı." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.SESSION_SECRET) return json({ error: "Sistem ayarları eksik." }, 500);
    const player = await getPlayer(request, env);
    if (!player) return json({ error: "Katılım bildirmek için önce 1171 ARENA bölümünden oyuncu PIN'inle giriş yapmalısın." }, 401);

    const body = await request.json();
    const eventId = Number(body.event_id);
    const status = String(body.status || "");
    if (!Number.isSafeInteger(eventId) || eventId < 1 || !["yes", "maybe", "no"].includes(status)) {
      return json({ error: "Etkinlik veya katılım seçimi geçersiz." }, 400);
    }

    const event = await env.DB.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
    if (!event) return json({ error: "Etkinlik bulunamadı." }, 404);

    await env.DB.prepare(`
      INSERT INTO event_attendance (event_id, player_id, status, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(event_id, player_id)
      DO UPDATE SET status = excluded.status, updated_at = datetime('now')
    `).bind(eventId, player.id, status).run();

    return json({ success: true, status });
  } catch (error) {
    console.error("ATTENDANCE POST ERROR", error);
    return json({ error: "Katılım kaydedilemedi." }, 500);
  }
}
