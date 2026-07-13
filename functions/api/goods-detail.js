export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ code: 1, msg: '缺少商品ID' }), { status: 400 });
  const good = await env.DB.prepare("SELECT * FROM goods WHERE id = ?").bind(id).first();
  if (!good) return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });
  return new Response(JSON.stringify({ code: 0, good }), { headers: { 'Content-Type': 'application/json' } });
}
