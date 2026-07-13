export async function onRequest({ request, env }) {
  // 管理鉴权（所有方法都需要）
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // GET 获取商品列表或单个
  if (request.method === 'GET') {
    if (id) {
      const good = await env.DB.prepare("SELECT * FROM goods WHERE id = ?").bind(id).first();
      return new Response(JSON.stringify({ code: 0, good }), { headers: { 'Content-Type': 'application/json' } });
    }
    const { results } = await env.DB.prepare("SELECT * FROM goods ORDER BY sort ASC, id DESC").all();
    return new Response(JSON.stringify({ code: 0, list: results }), { headers: { 'Content-Type': 'application/json' } });
  }

  // POST 新增或更新
  if (request.method === 'POST') {
    const body = await request.json();
    const { id: updateId, name, price, image_url, description, status, sort, required_level, upgrade_level, stock } = body;

    if (updateId) {
      // 更新商品（销量不应由后台编辑，所以不更新 sales）
      await env.DB.prepare(
        "UPDATE goods SET name=?, price=?, image_url=?, description=?, status=?, sort=?, required_level=?, upgrade_level=?, stock=? WHERE id=?"
      ).bind(name, price, image_url, description, status, sort, required_level || 0, upgrade_level || 0, stock || 0, updateId).run();
      return new Response(JSON.stringify({ code: 0, msg: '更新成功' }));
    } else {
      // 新增商品
      await env.DB.prepare(
        "INSERT INTO goods (name, price, image_url, description, status, sort, required_level, upgrade_level, stock, sales) VALUES (?,?,?,?,?,?,?,?,?,0)"
      ).bind(name, price, image_url, description, status, sort || 0, required_level || 0, upgrade_level || 0, stock || 0).run();
      return new Response(JSON.stringify({ code: 0, msg: '添加成功' }));
    }
  }

  // DELETE 下架（软删除）
  if (request.method === 'DELETE' && id) {
    await env.DB.prepare("UPDATE goods SET status = 'inactive' WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ code: 0, msg: '已下架' }));
  }

  return new Response('Method not allowed', { status: 405 });
}
