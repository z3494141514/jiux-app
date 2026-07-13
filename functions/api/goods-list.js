export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // 如果有 id，返回单个商品（可用于详情，但建议用 goods-detail）
  if (id) {
    const good = await env.DB.prepare("SELECT * FROM goods WHERE id = ?").bind(id).first();
    if (!good) return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });
    return new Response(JSON.stringify({ code: 0, good }), { headers: { 'Content-Type': 'application/json' } });
  }

  // 无 id 时返回所有上架商品，用于商城首页
  const { results } = await env.DB.prepare("SELECT * FROM goods WHERE status='active' ORDER BY sort ASC, id DESC").all();
  return new Response(JSON.stringify({ code: 0, list: results }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
