export async function onRequest({ request, env }) {
  const { results } = await env.DB.prepare("SELECT * FROM goods WHERE status='active' ORDER BY sort ASC, id DESC").all();
  return new Response(JSON.stringify({ code: 0, list: results }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
