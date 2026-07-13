export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { phone, newParentPhone } = await request.json();
  if (!phone) return new Response(JSON.stringify({ code: 1, msg: '缺少手机号' }), { status: 400 });

  // 允许清空上级（newParentPhone 为空字符串或 null）
  if (newParentPhone && newParentPhone !== '') {
    const parentExists = await env.DB.prepare("SELECT phone FROM users WHERE phone = ?").bind(newParentPhone).first();
    if (!parentExists) return new Response(JSON.stringify({ code: 1, msg: '上级手机号不存在' }), { status: 400 });
    if (newParentPhone === phone) return new Response(JSON.stringify({ code: 1, msg: '不能绑定自己为上级' }), { status: 400 });
    await env.DB.prepare("UPDATE users SET parent_phone = ? WHERE phone = ?").bind(newParentPhone, phone).run();
  } else {
    await env.DB.prepare("UPDATE users SET parent_phone = NULL WHERE phone = ?").bind(phone).run();
  }

  return new Response(JSON.stringify({ code: 0, msg: '上级关系已更新' }), { headers: { 'Content-Type': 'application/json' } });
}
