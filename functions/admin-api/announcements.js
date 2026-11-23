export async function onRequest(context) {
  const { request, env } = context;

  if (!env.DB) {
    return Response.json({ error: "Veritabanı bağlantısı bulunamadı." }, { status: 500 });
  }

  if (request.method === "GET") {
    const result = await env.DB.prepare(
      "SELECT id, title, content, created_at FROM announcements ORDER BY id DESC LIMIT 50"
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
    const content = String(body.content || "").trim();

    if (!title || !content) {
      return Response.json({ error: "Başlık ve duyuru metni gerekli." }, { status: 400 });
    }
    if (title.length > 120 || content.length > 3000) {
      return Response.json({ error: "Başlık en fazla 120, duyuru metni en fazla 3000 karakter olabilir." }, { status: 400 });
    }

    const result = await env.DB.prepare(
      "INSERT INTO announcements (title, content) VALUES (?, ?)"
    ).bind(title, content).run();

    return Response.json({ success: true, id: result.meta.last_row_id });
  }

  if (request.method === "DELETE") {
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Geçersiz istek." }, { status: 400 }); }

    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "Geçersiz duyuru numarası." }, { status: 400 });
    }

    await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
    return Response.json({ success: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
