export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (request.method === 'GET') {
    if (id) {
      const level = await env.DB.prepare("SELECT * FROM member_levels WHERE id = ?").bind(id).first();
      return new Response(JSON.stringify({ code: 0, level }), { headers: { 'Content-Type': 'application/json' } });
    }
    const { results } = await env.DB.prepare("SELECT * FROM member_levels ORDER BY level ASC").all();
    return new Response(JSON.stringify({ code: 0, list: results }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const { id: updateId, name, level, reward_percent } = body;
    if (updateId) {
      await env.DB.prepare("UPDATE member_levels SET name=?, level=?, reward_percent=? WHERE id=?").bind(name, level, reward_percent, updateId).run();
      return new Response(JSON.stringify({ code: 0, msg: '更新成功' }));
    } else {
      await env.DB.prepare("INSERT INTO member_levels (name, level, reward_percent) VALUES (?, ?, ?)").bind(name, level, reward_percent).run();
      return new Response(JSON.stringify({ code: 0, msg: '添加成功' }));
    }
  }

  if (request.method === 'DELETE' && id) {
    await env.DB.prepare("DELETE FROM member_levels WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ code: 0, msg: '已删除' }));
  }
  return new Response('Method not allowed', { status: 405 });
}
