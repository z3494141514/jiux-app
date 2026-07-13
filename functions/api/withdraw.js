export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ code: 1, msg: 'Method not allowed' }), { status: 405 });
  }

  const { phone, beanNum, address } = await request.json();
  if (!phone || !beanNum || beanNum <= 0 || !address) {
    return new Response(JSON.stringify({ code: 1, msg: '参数错误' }), { status: 400 });
  }

  // 获取配置
  const configs = await env.DB.prepare("SELECT key, value FROM config WHERE key IN ('withdrawLimitPerDay', 'minWithdrawBean')").all();
  const configMap = {};
  configs.results.forEach(r => { configMap[r.key] = r.value; });
  const dailyLimit = parseInt(configMap.withdrawLimitPerDay) || 3;
  const minBean = parseInt(configMap.minWithdrawBean) || 10;

  // 检查最低金额
  if (beanNum < minBean) {
    return new Response(JSON.stringify({ code: 2, msg: `最低提现金额为 ${minBean} 酒豆` }), { status: 400 });
  }

  // 获取用户
  const user = await env.DB.prepare("SELECT bean FROM users WHERE phone = ?").bind(phone).first();
  if (!user) {
    return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), { status: 400 });
  }
  if ((user.bean || 0) < beanNum) {
    return new Response(JSON.stringify({ code: 2, msg: '酒豆余额不足' }), { status: 400 });
  }

  // 计算今天已提现次数（基于北京时间）
  const beijingTimeStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
  const todayDate = beijingTimeStr.slice(0, 10);
  const { count: todayCount } = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM withdraw_log WHERE phone = ? AND substr(apply_time, 1, 10) = ?"
  ).bind(phone, todayDate).first();

  if (todayCount >= dailyLimit) {
    return new Response(JSON.stringify({ code: 2, msg: `今日提现次数已达上限（${dailyLimit}次）` }), { status: 400 });
  }

  // 执行扣款和写入记录
  const batchResult = await env.DB.batch([
    env.DB.prepare("UPDATE users SET bean = bean - ? WHERE phone = ? AND bean >= ?").bind(beanNum, phone, beanNum),
    env.DB.prepare("INSERT INTO withdraw_log (phone, bean_num, address, apply_time) VALUES (?, ?, ?, ?)")
      .bind(phone, beanNum, address, beijingTimeStr)
  ]);

  if (batchResult[0].meta.changes === 0) {
    return new Response(JSON.stringify({ code: 2, msg: '扣款失败，请重试' }), { status: 400 });
  }

  return new Response(JSON.stringify({ code: 0, msg: '提现申请已提交' }), { headers: { 'Content-Type': 'application/json' } });
}
