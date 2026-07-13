export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');
  if (!phone) {
    return new Response(JSON.stringify({ code: 1, msg: '缺少手机号' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { results } = await env.DB.prepare(
    "SELECT * FROM orders WHERE phone = ? ORDER BY id DESC"
  ).bind(phone).all();

  return new Response(JSON.stringify({ code: 0, orders: results }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
