
export async function onRequest(context) {
  const { request, env } = context;

  if (!env.DB) {
    return Response.json(
      { error: "Veritabanı bağlantısı bulunamadı." },
      { status: 500 }
    );
  }

  if (request.method === "GET") {
    const result = await env.DB.prepare(
      "SELECT * FROM rallies ORDER BY id DESC"
    ).all();

    return Response.json(result.results, {
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const details = String(body.details || "").trim();

    if (!title) {
      return Response.json(
        { error: "Operasyon adı gerekli." },
        { status: 400 }
      );
    }

    const result = await env.DB.prepare(
      "INSERT INTO rallies (title, details) VALUES (?, ?)"
    ).bind(title, details).run();

    return Response.json({
      success: true,
      id: result.meta.last_row_id
    });
  }

  if (request.method === "DELETE") {
    const body = await request.json();
    const id = Number(body.id);

    if (!Number.isInteger(id) || id <= 0) {
      return Response.json(
        { error: "Geçersiz operasyon numarası." },
        { status: 400 }
      );
    }

    await env.DB.prepare(
      "DELETE FROM rallies WHERE id = ?"
    ).bind(id).run();

    return Response.json({ success: true });
  }

  return new Response("Method not allowed", { status: 405 });
}

