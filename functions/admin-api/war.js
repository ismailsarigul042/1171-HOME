function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export async function onRequest({ request, env }) {
  if (!env.DB) return json({ error: "Veritabanı bağlantısı bulunamadı." }, 500);

  if (request.method === "GET") {
    const operation = await env.DB.prepare(
      "SELECT * FROM war_operations WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
    ).first();
    const players = await env.DB.prepare(
      "SELECT id, name FROM game_players ORDER BY name COLLATE NOCASE"
    ).all();
    if (!operation) return json({ operation: null, players: players.results, assignments: [] });

    const assignments = await env.DB.prepare(`
      SELECT a.id, a.player_id, p.name, a.territory, a.task_type, a.notes,
             r.status AS readiness, r.updated_at AS readiness_updated_at
      FROM war_assignments a
      JOIN game_players p ON p.id = a.player_id
      LEFT JOIN war_readiness r ON r.operation_id = a.operation_id AND r.player_id = a.player_id
      WHERE a.operation_id = ?
      ORDER BY a.territory, p.name COLLATE NOCASE
    `).bind(operation.id).all();
    return json({ operation, players: players.results, assignments: assignments.results });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Geçersiz istek." }, 400); }

    if (body.action === "create_operation") {
      const title = String(body.title || "").trim();
      const date = String(body.battle_date || "");
      const time = String(body.battle_time || "");
      const notes = String(body.notes || "").trim();
      if (!title || title.length > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        return json({ error: "Operasyon adı, geçerli tarih ve saat gerekli." }, 400);
      }
      await env.DB.prepare("UPDATE war_operations SET is_active = 0 WHERE is_active = 1").run();
      const result = await env.DB.prepare(
        "INSERT INTO war_operations (title, battle_date, battle_time, notes, is_active) VALUES (?, ?, ?, ?, 1)"
      ).bind(title, date, time, notes).run();
      return json({ success: true, id: result.meta.last_row_id });
    }

    if (body.action === "assign") {
      const operation = await env.DB.prepare(
        "SELECT id FROM war_operations WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
      ).first();
      if (!operation) return json({ error: "Önce bir savaş operasyonu oluştur." }, 400);
      const playerId = Number(body.player_id);
      const territory = String(body.territory || "");
      const task = String(body.task_type || "");
      const notes = String(body.notes || "").trim();
      const allowedTerritories = ["main-castle", ...Array.from({ length: 4 }, (_, i) => `castle-${i + 1}`), ...Array.from({ length: 12 }, (_, i) => `temple-${i + 1}`)];
      if (!Number.isInteger(playerId) || !allowedTerritories.includes(territory) || !["attack", "defense", "support"].includes(task)) {
        return json({ error: "Oyuncu, bölge veya görev bilgisi geçersiz." }, 400);
      }
      const player = await env.DB.prepare("SELECT id FROM game_players WHERE id = ?").bind(playerId).first();
      if (!player) return json({ error: "Oyuncu kaydı bulunamadı. Oyuncunun 1171 ARENA kaydı olmalı." }, 404);
      await env.DB.prepare(`
        INSERT INTO war_assignments (operation_id, player_id, territory, task_type, notes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(operation_id, player_id) DO UPDATE SET
          territory = excluded.territory, task_type = excluded.task_type, notes = excluded.notes
      `).bind(operation.id, playerId, territory, task, notes).run();
      return json({ success: true });
    }
    return json({ error: "Geçersiz işlem." }, 400);
  }

  if (request.method === "DELETE") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Geçersiz istek." }, 400); }
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return json({ error: "Geçersiz görev numarası." }, 400);
    await env.DB.prepare("DELETE FROM war_assignments WHERE id = ?").bind(id).run();
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
