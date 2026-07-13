export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');
  if (!phone) return new Response(JSON.stringify({ code: 1 }), { status: 400 });
  const { results } = await env.DB.prepare(
    "SELECT orders.id, orders.goods_id, orders.price, orders.status, orders.create_time, goods.name as goods_name FROM orders LEFT JOIN goods ON orders.goods_id = goods.id WHERE orders.phone = ? ORDER BY orders.id DESC"
  ).bind(phone).all();
  return new Response(JSON.stringify({ code: 0, orders: results }), { headers: { 'Content-Type': 'application/json' } });
}
