export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, amount } = await request.json();
  if (!phone || !amount || amount <= 0) return new Response(JSON.stringify({ code: 1, msg: '参数错误' }), { status: 400 });
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET token = token + ? WHERE phone = ?").bind(amount, phone),
    env.DB.prepare("INSERT INTO recharge_log (phone, amount) VALUES (?, ?)").bind(phone, amount)
  ]);
  return new Response(JSON.stringify({ code: 0, msg: '充值成功' }), { headers: { 'Content-Type': 'application/json' } });
}
