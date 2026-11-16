
export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (request.method === "GET") {
    const { results } = await db.prepare(
      "SELECT * FROM territory_history ORDER BY id DESC"
    ).all();

    return Response.json(results);
  }

  const cookie = request.headers.get("Cookie") || "";
  const session = cookie.split(";")
    .map(x => x.trim())
    .find(x => x.startsWith("1171_session="));

  if (!session || !session.includes("admin.")) {
    return new Response("Yönetici yetkisi gerekli.", { status: 403 });
  }

  if (request.method === "POST") {
    const data = await request.json();

    if (!data.territory_id || !data.territory_name || !data.week_label) {
      return new Response("Eksik bilgi.", { status: 400 });
    }

    await db.prepare(`
      INSERT INTO territory_history
      (territory_id, territory_name, week_label, planned_alliance, winning_alliance)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.territory_id,
      data.territory_name,
      data.week_label,
      data.planned_alliance || "",
      data.winning_alliance || ""
    ).run();

    return Response.json({ success: true });
  }

  if (request.method === "DELETE") {
    const data = await request.json();

    await db.prepare(
      "DELETE FROM territory_history WHERE id = ?"
    ).bind(data.id).run();

    return Response.json({ success: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
