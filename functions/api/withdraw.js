export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, beanNum } = await request.json();
  if (!phone || !beanNum || beanNum <= 0) return new Response(JSON.stringify({ code: 1, msg: '参数错误' }), { status: 400 });
  await env.DB.prepare("INSERT INTO withdraw_log (phone, bean_num) VALUES (?, ?)").bind(phone, beanNum).run();
  return new Response(JSON.stringify({ code: 0, msg: '提现申请已提交' }), { headers: { 'Content-Type': 'application/json' } });
}
