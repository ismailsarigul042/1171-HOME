const COOKIE = "1171_session";
const encoder = new TextEncoder();

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function validSession(request, secret) {
  const cookie = request.headers.get("Cookie") || "";
  const item = cookie.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  if (!item) return false;
  const value = item.slice(COOKIE.length + 1);
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const expires = Number(value.slice(0, dot));
  const signature = value.slice(dot + 1);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = await sign(String(expires), secret);
  return signature === expected;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (!env.SITE_PASSWORD || !env.SESSION_SECRET) {
    return new Response("Site ayarları tamamlanmamış. SITE_PASSWORD ve SESSION_SECRET değişkenlerini tanımlayın.", { status: 500 });
  }

  if (path === "/login.html" || path === "/login" || path === "/login/") return next();

  if (path === "/auth" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return new Response("Geçersiz istek", { status: 400 }); }
    if (typeof body.password !== "string" || body.password !== env.SITE_PASSWORD) {
      return new Response("Parola hatalı", { status: 401 });
    }
    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const signature = await sign(String(expires), env.SESSION_SECRET);
    return new Response(null, {
      status: 204,
      headers: { "Set-Cookie": `${COOKIE}=${expires}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`, "Cache-Control": "no-store" }
    });
  }

  if (path === "/logout") {
    return new Response(null, { status: 302, headers: { "Location": "/login.html", "Set-Cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`, "Cache-Control": "no-store" } });
  }

  if (await validSession(request, env.SESSION_SECRET)) return next();
  return Response.redirect(new URL("/login", request.url), 302);
}
