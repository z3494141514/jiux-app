export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { orderId, status } = await request.json();
  if (!orderId || !['wait','send','done'].includes(status)) return new Response(JSON.stringify({ code: 1, msg: '参数错误' }), { status: 400 });
  await env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, orderId).run();
  return new Response(JSON.stringify({ code: 0, msg: '状态修改成功' }), { headers: { 'Content-Type': 'application/json' } });
}
