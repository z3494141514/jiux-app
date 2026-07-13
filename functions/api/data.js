export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare("SELECT data FROM member_data LIMIT 1").first();
    return new Response(JSON.stringify({ data: row?.data || "{}" }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost({ env, request }) {
  try {
    const { data } = await request.json();
    await env.DB.prepare("DELETE FROM member_data").run();
    await env.DB.prepare("INSERT INTO member_data (data) VALUES (?)").bind(data).run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
