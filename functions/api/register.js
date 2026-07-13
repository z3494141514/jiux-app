async function hashPwd(pwd) {
  const data = new TextEncoder().encode(pwd + 'SALT_WINE_TEA');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, pwd, inviteCode } = await request.json();
  if (!phone || !/^1\d{10}$/.test(phone)) return new Response(JSON.stringify({ code: 1, msg: '手机号格式错误' }), { status: 400 });
  if (!pwd || pwd.length < 6) return new Response(JSON.stringify({ code: 1, msg: '密码至少6位' }), { status: 400 });

  const hashed = await hashPwd(pwd);
  let parentPhone = '';
  if (inviteCode && inviteCode !== phone) {
    const inviter = await env.DB.prepare("SELECT phone FROM users WHERE phone = ?").bind(inviteCode).first();
    if (inviter) parentPhone = inviter.phone;
  }
  try {
    await env.DB.prepare("INSERT INTO users (phone, pwd, invite_code, parent_phone) VALUES (?, ?, ?, ?)")
      .bind(phone, hashed, inviteCode || phone, parentPhone).run();
    return new Response(JSON.stringify({ code: 0, msg: '注册成功' }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    if (e.message.includes('UNIQUE constraint')) return new Response(JSON.stringify({ code: 1, msg: '手机号已注册' }), { status: 400 });
    return new Response(JSON.stringify({ code: 1, msg: e.message }), { status: 500 });
  }
}
