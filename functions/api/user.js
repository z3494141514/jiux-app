export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');
  if (!phone) return new Response(JSON.stringify({ code: 1, msg: '缺少手机号' }), { status: 400 });
  const user = await env.DB.prepare("SELECT phone, invite_code, power, asset, bean, token FROM users WHERE phone = ?").bind(phone).first();
  if (!user) return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), { status: 400 });
  return new Response(JSON.stringify({ code: 0, user }), { headers: { 'Content-Type': 'application/json' } });
}
