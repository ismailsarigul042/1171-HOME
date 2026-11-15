
const COOKIE = "1171_session";
const encoder = new TextEncoder();

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getRole(request, secret) {
  const cookie = request.headers.get("Cookie") || "";
  const item = cookie.split(";").map(x => x.trim())
    .find(x => x.startsWith(COOKIE + "="));

  if (!item) return null;

  const parts = item.slice(COOKIE.length + 1).split(".");
  if (parts.length !== 3) return null;

  const [role, expiresText, signature] = parts;
  const expires = Number(expiresText);

  if (!["user", "admin"].includes(role)) return null;
  if (!Number.isFinite(expires) || expires < Date.now()) return null;

  const expected = await sign(`${role}.${expires}`, secret);
  return signature === expected ? role : null;
}

async function createSession(role, env) {
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const signature = await sign(`${role}.${expires}`, env.SESSION_SECRET);

  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `${COOKIE}=${role}.${expires}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`,
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (!env.SITE_PASSWORD || !env.SESSION_SECRET) {
    return new Response("Site ayarları tamamlanmamış.", { status: 500 });
  }

  if (path === "/login.html" || path === "/login" || path === "/login/") {
    return next();
  }

  if (path === "/auth" && request.method === "POST") {
    let body;
    try { body = await request.json(); }
    catch { return new Response("Geçersiz istek", { status: 400 }); }

    if (body.password !== env.SITE_PASSWORD) {
      return new Response("Parola hatalı", { status: 401 });
    }

    return createSession("user", env);
  }

  if (path === "/admin-auth" && request.method === "POST") {
    let body;
    try { body = await request.json(); }
    catch { return new Response("Geçersiz istek", { status: 400 }); }

    if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) {
      return new Response("Yönetici parolası hatalı", { status: 401 });
    }

    return createSession("admin", env);
  }

  if (path === "/session" && request.method === "GET") {
    const role = await getRole(request, env.SESSION_SECRET);
    return Response.json(
      { role: role || "guest" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (path === "/logout") {
    return new Response(null, {
      status: 302,
      headers: {
        "Location": "/login.html",
        "Set-Cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
        "Cache-Control": "no-store"
      }
    });
  }

  const role = await getRole(request, env.SESSION_SECRET);

  if (!role) {
    return Response.redirect(new URL("/login", request.url), 302);
  }

  if (
  path.startsWith("/admin-api/") &&
  request.method !== "GET" &&
  role !== "admin"
) {
  return new Response("Yönetici yetkisi gerekli.", { status: 403 });
}

  return next();
}
