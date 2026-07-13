export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone } = await request.json();
  if (!phone) return new Response(JSON.stringify({ code: 1, msg: '参数不全' }), { status: 400 });
  const user = await env.DB.prepare("SELECT asset, bean FROM users WHERE phone = ?").bind(phone).first();
  if (!user) return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), { status: 400 });
  if ((user.asset || 0) <= 0) return new Response(JSON.stringify({ code: 2, msg: '没有可兑换的资产' }), { status: 400 });
  
  const cfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'assetToBeanRate'").first();
  const rate = Number(cfg?.value) || 5;
  const addBean = Math.floor(user.asset * rate);
  
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET asset = 0, bean = bean + ? WHERE phone = ?").bind(addBean, phone),
  ]);
  return new Response(JSON.stringify({ code: 0, msg: `兑换成功，获得${addBean}酒豆`, addBean }), { headers: { 'Content-Type': 'application/json' } });
}
