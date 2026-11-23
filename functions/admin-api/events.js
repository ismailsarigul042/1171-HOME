export async function onRequest(context) {
  const { request, env } = context;

  if (!env.DB) {
    return Response.json({ error: "Veritabanı bağlantısı bulunamadı." }, { status: 500 });
  }

  if (request.method === "GET") {
    const result = await env.DB.prepare(
      "SELECT id, title, event_date, event_time, description FROM events ORDER BY event_date ASC, event_time ASC LIMIT 100"
    ).all();
    return Response.json(result.results, {
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Geçersiz istek." }, { status: 400 }); }

    const title = String(body.title || "").trim();
    const eventDate = String(body.event_date || "").trim();
    const eventTime = String(body.event_time || "").trim();
    const description = String(body.description || "").trim();

    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(eventTime)) {
      return Response.json({ error: "Etkinlik adı, geçerli tarih ve saat gerekli." }, { status: 400 });
    }
    if (title.length > 120 || description.length > 1000) {
      return Response.json({ error: "Etkinlik adı en fazla 120, açıklama en fazla 1000 karakter olabilir." }, { status: 400 });
    }

    const result = await env.DB.prepare(
      "INSERT INTO events (title, event_date, event_time, description) VALUES (?, ?, ?, ?)"
    ).bind(title, eventDate, eventTime, description).run();
    return Response.json({ success: true, id: result.meta.last_row_id });
  }

  if (request.method === "DELETE") {
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Geçersiz istek." }, { status: 400 }); }

    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "Geçersiz etkinlik numarası." }, { status: 400 });
    }
    await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(id).run();
    return Response.json({ success: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
