export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { withdrawId, action } = await request.json();
  if (!withdrawId || !['pass','refuse'].includes(action)) return new Response(JSON.stringify({ code: 1, msg: '参数错误' }), { status: 400 });
  
  const record = await env.DB.prepare("SELECT * FROM withdraw_log WHERE id = ? AND status = 'wait'").bind(withdrawId).first();
  if (!record) return new Response(JSON.stringify({ code: 1, msg: '记录不存在或已处理' }), { status: 400 });
  
  if (action === 'pass') {
    const user = await env.DB.prepare("SELECT bean FROM users WHERE phone = ?").bind(record.phone).first();
    if (!user || (user.bean || 0) < record.bean_num) return new Response(JSON.stringify({ code: 2, msg: '用户酒豆不足' }), { status: 400 });
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET bean = bean - ? WHERE phone = ? AND bean >= ?").bind(record.bean_num, record.phone, record.bean_num),
      env.DB.prepare("UPDATE withdraw_log SET status = 'pass' WHERE id = ?").bind(withdrawId)
    ]);
  } else {
    await env.DB.prepare("UPDATE withdraw_log SET status = 'refuse' WHERE id = ?").bind(withdrawId).run();
  }
  return new Response(JSON.stringify({ code: 0, msg: '处理成功' }), { headers: { 'Content-Type': 'application/json' } });
}
