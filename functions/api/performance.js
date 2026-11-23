function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export async function onRequestGet({ env }) {
  try {
    if (!env.DB) return json({ error: "Veritabanı bağlantısı bulunamadı." }, 500);

    const playersResult = await env.DB.prepare(`
      SELECT
        p.id,
        p.name,
        p.alliance,
        COALESCE(t.infantry, 0) AS infantry,
        COALESCE(t.cavalry, 0) AS cavalry,
        COALESCE(t.archer, 0) AS archer,
        COALESCE(t.infantry, 0) + COALESCE(t.cavalry, 0) + COALESCE(t.archer, 0) AS total_t11,
        COALESCE(a.yes_count, 0) AS yes_count,
        COALESCE(a.maybe_count, 0) AS maybe_count,
        COALESCE(a.no_count, 0) AS no_count
      FROM game_players p
      LEFT JOIN player_t11 t ON t.player_id = p.id
      LEFT JOIN (
        SELECT player_id,
          SUM(CASE WHEN status = 'yes' THEN 1 ELSE 0 END) AS yes_count,
          SUM(CASE WHEN status = 'maybe' THEN 1 ELSE 0 END) AS maybe_count,
          SUM(CASE WHEN status = 'no' THEN 1 ELSE 0 END) AS no_count
        FROM event_attendance
        GROUP BY player_id
      ) a ON a.player_id = p.id
      ORDER BY total_t11 DESC, yes_count DESC, p.name COLLATE NOCASE ASC
    `).all();

    const eventsRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM events").first();
    const summary = playersResult.results.reduce((acc, player) => {
      acc.totalT11 += Number(player.total_t11 || 0);
      acc.yes += Number(player.yes_count || 0);
      return acc;
    }, { players: playersResult.results.length, totalT11: 0, yes: 0, events: Number(eventsRow?.total || 0) });

    return json({ players: playersResult.results, summary });
  } catch (error) {
    console.error("PERFORMANCE GET ERROR", error);
    return json({ error: "Oyuncu performans bilgileri alınamadı." }, 500);
  }
}
