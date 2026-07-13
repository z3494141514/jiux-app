export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (request.method === 'GET') {
    if (id) {
      const good = await env.DB.prepare("SELECT * FROM goods WHERE id = ?").bind(id).first();
      return new Response(JSON.stringify({ code: 0, good }), { headers: { 'Content-Type': 'application/json' } });
    }
    const { results } = await env.DB.prepare("SELECT * FROM goods ORDER BY sort ASC, id DESC").all();
    return new Response(JSON.stringify({ code: 0, list: results }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const { id: updateId, name, price, image_url, description, status, sort, required_level, upgrade_level, stock, pay_type, power_ratio } = body;

    if (updateId) {
      await env.DB.prepare(
        "UPDATE goods SET name=?, price=?, image_url=?, description=?, status=?, sort=?, required_level=?, upgrade_level=?, stock=?, pay_type=?, power_ratio=? WHERE id=?"
      ).bind(name, price, image_url, description, status, sort, required_level || 0, upgrade_level || 0, stock || 0, pay_type || 'token', power_ratio != null ? power_ratio : null, updateId).run();
      return new Response(JSON.stringify({ code: 0, msg: '更新成功' }));
    } else {
      await env.DB.prepare(
        "INSERT INTO goods (name, price, image_url, description, status, sort, required_level, upgrade_level, stock, sales, pay_type, power_ratio) VALUES (?,?,?,?,?,?,?,?,?,0,?,?)"
      ).bind(name, price, image_url, description, status, sort || 0, required_level || 0, upgrade_level || 0, stock || 0, pay_type || 'token', power_ratio != null ? power_ratio : null).run();
      return new Response(JSON.stringify({ code: 0, msg: '添加成功' }));
    }
  }

  if (request.method === 'DELETE' && id) {
    await env.DB.prepare("UPDATE goods SET status = 'inactive' WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ code: 0, msg: '已下架' }));
  }

  return new Response('Method not allowed', { status: 405 });
}
