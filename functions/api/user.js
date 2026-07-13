export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');
  if (!phone) return new Response(JSON.stringify({ code: 1 }), { status: 400 });

  const user = await env.DB.prepare("SELECT * FROM users WHERE phone = ?").bind(phone).first();
  if (!user) return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), { status: 400 });

  // 获取等级名称
  const levelInfo = await env.DB.prepare("SELECT name FROM member_levels WHERE level = ?").bind(user.level || 0).first();
  const levelName = levelInfo ? levelInfo.name : '普通会员';

  return new Response(JSON.stringify({ code: 0, user: { ...user, levelName } }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
