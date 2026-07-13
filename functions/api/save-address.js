export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, address } = await request.json();
  if (!phone || !address) return new Response(JSON.stringify({ code: 1, msg: '参数不全' }), { status: 400 });

  await env.DB.prepare("UPDATE users SET address = ? WHERE phone = ?").bind(address, phone).run();
  return new Response(JSON.stringify({ code: 0, msg: '地址已保存' }), { headers: { 'Content-Type': 'application/json' } });
}
