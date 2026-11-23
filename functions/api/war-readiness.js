function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

const COOKIE = "1171_player";
const encoder = new TextEncoder();

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getPlayer(request, env) {
  const cookies = request.headers.get("Cookie") || "";
  const item = cookies.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  if (!item) return null;
  const parts = item.slice(COOKIE.length + 1).split(".");
  if (parts.length !== 3) return null;
  const [idText, expiresText, signature] = parts;
  const id = Number(idText), expires = Number(expiresText);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isFinite(expires) || expires < Date.now()) return null;
  if (signature !== await sign(`${id}.${expires}`, env.SESSION_SECRET)) return null;
  return env.DB.prepare("SELECT id, name, alliance FROM game_players WHERE id = ?").bind(id).first();
}

export async function onRequest({ request, env }) {
  if (!env.DB || !env.SESSION_SECRET) return json({ error: "Sistem ayarları eksik." }, 500);
  const player = await getPlayer(request, env);
  const operation = await env.DB.prepare("SELECT * FROM war_operations WHERE is_active = 1 ORDER BY id DESC LIMIT 1").first();
  if (!operation) return json({ loggedIn: !!player, player, operation: null, assignment: null, counts: { ready: 0, not_ready: 0, unanswered: 0 } });

  const counts = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN r.status = 'ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN r.status = 'not_ready' THEN 1 ELSE 0 END) AS not_ready,
      SUM(CASE WHEN r.status IS NULL THEN 1 ELSE 0 END) AS unanswered
    FROM war_assignments a
    LEFT JOIN war_readiness r ON r.operation_id = a.operation_id AND r.player_id = a.player_id
    WHERE a.operation_id = ?
  `).bind(operation.id).first();

  let assignment = null;
  if (player) {
    assignment = await env.DB.prepare(`
      SELECT territory, task_type, notes FROM war_assignments
      WHERE operation_id = ? AND player_id = ?
    `).bind(operation.id, player.id).first();
  }

  if (request.method === "POST") {
    if (!player) return json({ error: "Durum bildirmek için 1171 ARENA oyuncu PIN'inle giriş yapmalısın." }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Geçersiz istek." }, 400); }
    if (!["ready", "not_ready"].includes(body.status)) return json({ error: "Geçersiz hazır olma durumu." }, 400);
    const assigned = await env.DB.prepare("SELECT id FROM war_assignments WHERE operation_id = ? AND player_id = ?").bind(operation.id, player.id).first();
    if (!assigned) return json({ error: "Bu savaş için henüz görev ataman yapılmamış." }, 403);
    await env.DB.prepare(`
      INSERT INTO war_readiness (operation_id, player_id, status, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(operation_id, player_id) DO UPDATE SET status = excluded.status, updated_at = datetime('now')
    `).bind(operation.id, player.id, body.status).run();
    return json({ success: true });
  }

  let myStatus = null;
  if (player) {
    const row = await env.DB.prepare("SELECT status FROM war_readiness WHERE operation_id = ? AND player_id = ?").bind(operation.id, player.id).first();
    myStatus = row?.status || null;
  }

  return json({ loggedIn: !!player, player, operation, assignment, myStatus, counts: { ready: Number(counts?.ready || 0), not_ready: Number(counts?.not_ready || 0), unanswered: Number(counts?.unanswered || 0) } });
}
