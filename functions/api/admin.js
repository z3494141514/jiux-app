export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  
  // 获取所有用户
  const { results: users } = await env.DB.prepare("SELECT phone, power, asset, bean, token, create_time FROM users").all();
  // 获取所有订单
  const { results: orders } = await env.DB.prepare("SELECT * FROM orders").all();
  // 获取提现记录
  const { results: withdrawLog } = await env.DB.prepare("SELECT * FROM withdraw_log ORDER BY id DESC").all();
  // 获取充值记录
  const { results: rechargeLog } = await env.DB.prepare("SELECT * FROM recharge_log ORDER BY id DESC").all();
  // 获取释放记录
  const { results: releaseLog } = await env.DB.prepare("SELECT * FROM release_log ORDER BY date DESC").all();
  
  return new Response(JSON.stringify({ code: 0, users, orders, withdrawLog, rechargeLog, releaseLog }), { headers: { 'Content-Type': 'application/json' } });
}
