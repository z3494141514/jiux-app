export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, orderId } = await request.json();
  if (!phone || !orderId) return new Response(JSON.stringify({ code: 1, msg: '参数不全' }), { status: 400 });

  // 校验订单属于该用户且状态为 'send'
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND phone = ? AND status = 'send'").bind(orderId, phone).first();
  if (!order) return new Response(JSON.stringify({ code: 1, msg: '订单不存在或不可确认' }), { status: 400 });

  await env.DB.prepare("UPDATE orders SET status = 'done' WHERE id = ?").bind(orderId).run();
  return new Response(JSON.stringify({ code: 0, msg: '已确认收货' }), { headers: { 'Content-Type': 'application/json' } });
}
