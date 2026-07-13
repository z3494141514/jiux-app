export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ code: 1, msg: 'Method not allowed' }), { status: 405 });
  }

  const { withdrawId, action } = await request.json();
  if (!withdrawId || !['pass', 'refuse'].includes(action)) {
    return new Response(JSON.stringify({ code: 1, msg: '参数错误' }), { status: 400 });
  }

  // 查询提现记录，状态必须为 wait
  const record = await env.DB.prepare("SELECT * FROM withdraw_log WHERE id = ? AND status = 'wait'").bind(withdrawId).first();
  if (!record) {
    return new Response(JSON.stringify({ code: 1, msg: '记录不存在或已处理' }), { status: 400 });
  }

  if (action === 'pass') {
    // 审核通过：只更新状态，酒豆已在申请时扣除
    await env.DB.prepare("UPDATE withdraw_log SET status = 'pass' WHERE id = ?").bind(withdrawId).run();
  } else if (action === 'refuse') {
    // 审核拒绝：需要返还酒豆 + 更新状态
    const user = await env.DB.prepare("SELECT bean FROM users WHERE phone = ?").bind(record.phone).first();
    if (!user) return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), { status: 400 });

    await env.DB.batch([
      env.DB.prepare("UPDATE users SET bean = bean + ? WHERE phone = ?").bind(record.bean_num, record.phone),
      env.DB.prepare("UPDATE withdraw_log SET status = 'refuse' WHERE id = ?").bind(withdrawId)
    ]);
  }

  return new Response(JSON.stringify({ code: 0, msg: '处理成功' }), { headers: { 'Content-Type': 'application/json' } });
}
