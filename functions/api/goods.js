export async function onRequest({ request, env }) {
  // 鉴权
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
    const { id: updateId, name, price, image_url, description, status, sort } = body;
    if (updateId) {
      // 更新
      await env.DB.prepare("UPDATE goods SET name=?, price=?, image_url=?, description=?, status=?, sort=? WHERE id=?")
        .bind(name, price, image_url, description, status, sort, updateId).run();
      return new Response(JSON.stringify({ code: 0, msg: '更新成功' }));
    } else {
      // 新增
      await env.DB.prepare("INSERT INTO goods (name, price, image_url, description, status, sort) VALUES (?,?,?,?,?,?)")
        .bind(name, price, image_url, description, status, sort || 0).run();
      return new Response(JSON.stringify({ code: 0, msg: '添加成功' }));
    }
  }

  // DELETE 删除（下架）
  if (request.method === 'DELETE' && id) {
    await env.DB.prepare("UPDATE goods SET status = 'inactive' WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ code: 0, msg: '已下架' }));
  }

  return new Response('Method not allowed', { status: 405 });
}
