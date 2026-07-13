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

  // 生成北京时间字符串
  const now = new Date();
  const applyTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 写入提现记录（不立即扣豆，待后台审核通过后扣减）
  await env.DB.prepare("INSERT INTO withdraw_log (phone, bean_num, address, apply_time) VALUES (?, ?, ?, ?)")
    .bind(phone, beanNum, address, applyTime).run();

  return new Response(JSON.stringify({ code: 0, msg: '提现申请已提交' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
