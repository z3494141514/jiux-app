export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // 单个商品查询（用于支付页等，保持不变）
  if (id) {
    const good = await env.DB.prepare("SELECT id, name, price, image_url, stock, sales, pay_type, power_ratio FROM goods WHERE id = ?").bind(id).first();
    if (!good) return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });
    return new Response(JSON.stringify({ code: 0, good }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' }
    });
  }

  // 分页参数
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 2;   // 默认每页4个
  const offset = (page - 1) * limit;

  // 查询总数（用于前端判断是否还有更多）
  const totalResult = await env.DB.prepare("SELECT COUNT(*) as total FROM goods WHERE status='active'").first();
  const total = totalResult.total;

  // 查询当前页数据
  const { results } = await env.DB.prepare(
    "SELECT id, name, price, image_url, stock, sales, pay_type FROM goods WHERE status='active' ORDER BY sort ASC, id DESC LIMIT ? OFFSET ?"
  ).bind(limit, offset).all();

  return new Response(JSON.stringify({
    code: 0,
    list: results,
    total: total,
    page: page,
    limit: limit,
    hasMore: offset + limit < total
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30'   // 列表缓存30秒
    }
  });
}
