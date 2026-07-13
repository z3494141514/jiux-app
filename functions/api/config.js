export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  const url = new URL(request.url);
  
  // GET 获取配置
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare("SELECT key, value FROM config").all();
    const config = {};
    results.forEach(r => { config[r.key] = r.value; });
    return new Response(JSON.stringify({ code: 0, config }), { headers: { 'Content-Type': 'application/json' } });
  }
  
  // POST 更新配置
  if (request.method === 'POST') {
    const body = await request.json();
    const stmts = [];
    for (const key in body) {
      stmts.push(env.DB.prepare("UPDATE config SET value = ? WHERE key = ?").bind(String(body[key]), key));
    }
    await env.DB.batch(stmts);
    return new Response(JSON.stringify({ code: 0, msg: '保存成功' }), { headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('Method not allowed', { status: 405 });
}
