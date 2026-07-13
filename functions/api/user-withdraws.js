export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');
  if (!phone) {
    return new Response(JSON.stringify({ code: 1, msg: '缺少手机号' }), { status: 400 });
  }
  const { results } = await env.DB.prepare(
    "SELECT id, bean_num, address, status, apply_time FROM withdraw_log WHERE phone = ? ORDER BY id DESC"
  ).bind(phone).all();
  return new Response(JSON.stringify({ code: 0, list: results }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
