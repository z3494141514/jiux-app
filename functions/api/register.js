async function hashPwd(pwd) {
  const data = new TextEncoder().encode(pwd + 'SALT_WINE_TEA');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateInviteCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, pwd, inviteCode } = await request.json();
  if (!phone || !/^1\d{10}$/.test(phone)) return new Response(JSON.stringify({ code: 1, msg: '手机号格式错误' }), { status: 400 });
  if (!pwd || pwd.length < 6) return new Response(JSON.stringify({ code: 1, msg: '密码至少6位' }), { status: 400 });

  // 生成唯一邀请码
  let finalInvite = '';
  let isUnique = false;
  while (!isUnique) {
    finalInvite = generateInviteCode();
    const exist = await env.DB.prepare("SELECT phone FROM users WHERE invite_code = ?").bind(finalInvite).first();
    if (!exist) isUnique = true;
  }

  const hashed = await hashPwd(pwd);
  let parentPhone = '';
  if (inviteCode && inviteCode !== phone) {
    const inviter = await env.DB.prepare("SELECT phone FROM users WHERE invite_code = ?").bind(inviteCode).first();
    if (inviter) parentPhone = inviter.phone;
  }

  try {
    await env.DB.prepare("INSERT INTO users (phone, pwd, invite_code, parent_phone, level) VALUES (?, ?, ?, ?, 0)")
      .bind(phone, hashed, finalInvite, parentPhone).run();
    return new Response(JSON.stringify({ code: 0, msg: '注册成功', inviteCode: finalInvite }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    if (e.message.includes('UNIQUE constraint')) return new Response(JSON.stringify({ code: 1, msg: '手机号已注册' }), { status: 400 });
    return new Response(JSON.stringify({ code: 1, msg: e.message }), { status: 500 });
  }
}
