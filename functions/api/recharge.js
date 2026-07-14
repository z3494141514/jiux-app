export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { phone, amount, type } = await request.json();
  if (!phone || !amount || amount <= 0) {
    return new Response(JSON.stringify({ code: 1, msg: '参数错误' }), { status: 400 });
  }

  const rechargeType = type || 'token'; // token, power, bean
  const fieldMap = { token: 'token', power: 'power', bean: 'bean' };
  const field = fieldMap[rechargeType];
  if (!field) return new Response(JSON.stringify({ code: 1, msg: '无效的充值类型' }), { status: 400 });

  const beijingTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  await env.DB.prepare(`UPDATE users SET ${field} = ${field} + ? WHERE phone = ?`).bind(amount, phone).run();
  await env.DB.prepare("INSERT INTO recharge_log (phone, amount, type, create_time) VALUES (?, ?, ?, ?)")
    .bind(phone, amount, rechargeType, beijingTime).run();

  return new Response(JSON.stringify({ code: 0, msg: '充值成功' }), { headers: { 'Content-Type': 'application/json' } });
}
