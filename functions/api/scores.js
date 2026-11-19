
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

const COOKIE = "1171_player";
const encoder = new TextEncoder();

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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

  if (!Number.isSafeInteger(id) || id < 1 || expires < Date.now()) {
    return null;
  }

  const expected = await sign(`${id}.${expires}`, env.SESSION_SECRET);
  if (signature !== expected) return null;

  return await env.DB.prepare(
    "SELECT id, name, alliance FROM game_players WHERE id = ?"
  ).bind(id).first();
}

function getWeekStart() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};
  for (const part of parts) {
    values[part.type] = part.value;
  }

  const date = new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day)
  ));

  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));

  return date.toISOString().slice(0, 10);
}

const allowedGames = [
  "snake",
  "xox",
  "minesweeper",
  "memory",
  "reflex",
  "rps",
  "guess",
  "quiz"
];

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB || !env.SESSION_SECRET) {
      return json({ error: "Sistem ayarları eksik." }, 500);
    }

    const week = getWeekStart();

    const players = await env.DB.prepare(`
      SELECT p.id, p.name, p.alliance,
             SUM(s.score) AS total_score
      FROM game_scores s
      JOIN game_players p ON p.id = s.player_id
      WHERE s.week_start = ?
      GROUP BY p.id
      ORDER BY total_score DESC, p.name ASC
      LIMIT 10
    `).bind(week).all();

    const alliances = await env.DB.prepare(`
      SELECT MAX(p.alliance) AS alliance,
             SUM(s.score) AS total_score
      FROM game_scores s
      JOIN game_players p ON p.id = s.player_id
      WHERE s.week_start = ?
      GROUP BY LOWER(TRIM(p.alliance))
      ORDER BY total_score DESC, alliance ASC
      LIMIT 3
    `).bind(week).all();

    const player = await getPlayer(request, env);

    let myScore = null;

    if (player) {
      myScore = await env.DB.prepare(`
        SELECT COALESCE(SUM(score), 0) AS total_score
        FROM game_scores
        WHERE player_id = ? AND week_start = ?
      `).bind(player.id, week).first();
    }

    return json({
      weekStart: week,
      players: players.results,
      alliances: alliances.results,
      myScore: myScore ? myScore.total_score : null
    });

  } catch (error) {
    return json({ error: "Sıralamalar alınamadı." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.SESSION_SECRET) {
      return json({ error: "Sistem ayarları eksik." }, 500);
    }

    const player = await getPlayer(request, env);

    if (!player) {
      return json({ error: "Önce oyuncu PIN'inle giriş yapmalısın." }, 401);
    }

    const body = await request.json();
    const game = String(body.game || "");
    const score = Number(body.score);

    if (!allowedGames.includes(game)) {
      return json({ error: "Geçersiz oyun." }, 400);
    }

    if (!Number.isSafeInteger(score) || score < 0 || score > 100000) {
      return json({ error: "Geçersiz puan." }, 400);
    }

    const week = getWeekStart();

    await env.DB.prepare(`
      INSERT INTO game_scores (player_id, game_name, score, week_start)
      VALUES (?, ?, ?, ?)
    `).bind(player.id, game, score, week).run();

    return json({
      success: true,
      message: "Puanın kaydedildi."
    });

  } catch (error) {
    return json({ error: "Puan kaydedilemedi." }, 500);
  }
}
