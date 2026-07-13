export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ code: 403 }), { status: 403 });
  }

  const [userCountRes, orderTodayRes, totalRechargeRes, totalWithdrawRes] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as cnt FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE date(create_time) = date('now')").first(),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) as total FROM recharge_log").first(),
    env.DB.prepare("SELECT COALESCE(SUM(bean_num),0) as total FROM withdraw_log WHERE status='pass'").first()
  ]);

  return new Response(JSON.stringify({
    code: 0,
    data: {
      totalUsers: userCountRes.cnt,
      todayOrders: orderTodayRes.cnt,
      totalRecharge: totalRechargeRes.total,
      totalWithdraw: totalWithdrawRes.total
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}
