async function hashPwd(pwd) {
  const data = new TextEncoder().encode(pwd + 'SALT_WINE_TEA');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, oldPwd, newPwd } = await request.json();
  if (!phone || !oldPwd || !newPwd || newPwd.length < 6) {
    return new Response(JSON.stringify({ code: 1, msg: '参数错误' }), { status: 400 });
  }

  const oldHash = await hashPwd(oldPwd);
  const user = await env.DB.prepare("SELECT phone FROM users WHERE phone = ? AND pwd = ?").bind(phone, oldHash).first();
  if (!user) return new Response(JSON.stringify({ code: 1, msg: '旧密码错误' }), { status: 400 });

  const newHash = await hashPwd(newPwd);
  await env.DB.prepare("UPDATE users SET pwd = ? WHERE phone = ?").bind(newHash, phone).run();
  return new Response(JSON.stringify({ code: 0, msg: '密码修改成功' }), { headers: { 'Content-Type': 'application/json' } });
}
