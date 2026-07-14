export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // 单个商品查询（支付页等使用，需要包含所有商品）
  if (id) {
    const good = await env.DB.prepare("SELECT id, name, price, image_url, stock, sales, pay_type, power_ratio FROM goods WHERE id = ?").bind(id).first();
    if (!good) return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });
    return new Response(JSON.stringify({ code: 0, good }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' }
    });
  }

  // 分页参数
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 4;   // 前端传了2，这里默认4
  const offset = (page - 1) * limit;

  // 查询总数（只查普通商品，排除 Banner）
  const totalResult = await env.DB.prepare(
    "SELECT COUNT(*) as total FROM goods WHERE status='active' AND is_banner = 0"
  ).first();
  const total = totalResult.total;

  // 查询当前页数据（排除 Banner 商品）
  const { results } = await env.DB.prepare(
    "SELECT id, name, price, image_url, stock, sales, pay_type FROM goods WHERE status='active' AND is_banner = 0 ORDER BY sort ASC, id DESC LIMIT ? OFFSET ?"
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
      'Cache-Control': 'public, max-age=120'   // 缓存2分钟
    }
  });
}
