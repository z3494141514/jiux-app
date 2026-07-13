async function hashPwd(pwd) {
  const data = new TextEncoder().encode(pwd + 'SALT_WINE_TEA');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, pwd } = await request.json();
  if (!phone || !pwd) return new Response(JSON.stringify({ code: 1, msg: '参数不全' }), { status: 400 });
  const hashed = await hashPwd(pwd);
  const user = await env.DB.prepare("SELECT phone, invite_code, power, asset, bean, token FROM users WHERE phone = ? AND pwd = ?").bind(phone, hashed).first();
  if (user) return new Response(JSON.stringify({ code: 0, user }), { headers: { 'Content-Type': 'application/json' } });
  else return new Response(JSON.stringify({ code: 1, msg: '账号或密码错误' }), { status: 400 });
}
