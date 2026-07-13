export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, goodsId, price } = await request.json();
  if (!phone || !goodsId || !price) return new Response(JSON.stringify({ code: 1, msg: '参数不全' }), { status: 400 });
  
  const cfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'powerRatio'").first();
  const powerRatio = Number(cfg?.value) || 2;
  const addPower = price * powerRatio;
  
  const batchResult = await env.DB.batch([
    env.DB.prepare("UPDATE users SET token = token - ?, power = power + ? WHERE phone = ? AND token >= ?").bind(price, addPower, phone, price),
    env.DB.prepare("INSERT INTO orders (phone, goods_id, price) VALUES (?, ?, ?)").bind(phone, goodsId, price)
  ]);
  if (batchResult[0].meta.changes === 0) return new Response(JSON.stringify({ code: 2, msg: '余额不足或支付失败' }), { status: 400 });
  
  const user = await env.DB.prepare("SELECT phone, invite_code, power, asset, bean, token FROM users WHERE phone = ?").bind(phone).first();
  return new Response(JSON.stringify({ code: 0, user }), { headers: { 'Content-Type': 'application/json' } });
}
