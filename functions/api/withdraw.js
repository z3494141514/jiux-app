export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ code: 1, msg: 'Method not allowed' }), { status: 405 });
  }

  const { phone, beanNum, address } = await request.json();
  if (!phone || !beanNum || beanNum <= 0 || !address) {
    return new Response(JSON.stringify({ code: 1, msg: '参数错误，请填写完整信息' }), { status: 400 });
  }

  // 检查用户酒豆余额
  const user = await env.DB.prepare("SELECT bean FROM users WHERE phone = ?").bind(phone).first();
  if (!user) {
    return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), { status: 400 });
  }
  if ((user.bean || 0) < beanNum) {
    return new Response(JSON.stringify({ code: 2, msg: '酒豆余额不足' }), { status: 400 });
  }

  // 生成北京时间
  const now = new Date();
  const applyTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 事务：扣除酒豆 + 插入提现记录
  const batchResult = await env.DB.batch([
    env.DB.prepare("UPDATE users SET bean = bean - ? WHERE phone = ? AND bean >= ?").bind(beanNum, phone, beanNum),
    env.DB.prepare("INSERT INTO withdraw_log (phone, bean_num, address, apply_time) VALUES (?, ?, ?, ?)")
      .bind(phone, beanNum, address, applyTime)
  ]);

  if (batchResult[0].meta.changes === 0) {
    return new Response(JSON.stringify({ code: 2, msg: '酒豆余额不足或扣款失败' }), { status: 400 });
  }

  return new Response(JSON.stringify({ code: 0, msg: '提现申请已提交' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
