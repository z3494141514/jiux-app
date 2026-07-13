export async function onRequest({ request, env }) {
  try {
    const row = await env.DB.prepare(
      "SELECT price, liquidity FROM token_prices WHERE token = 'ART' ORDER BY id DESC LIMIT 1"
    ).first();
    
    if (row) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          price: row.price.toFixed(6),
          change24h: 0,
          volume24h: 0,
          liquidity: row.liquidity ? row.liquidity.toFixed(2) : '0',
          fdv: 0
        }
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    return new Response(JSON.stringify({ code: 1, msg: '暂无价格数据' }), { status: 404 });
  } catch (e) {
    return new Response(JSON.stringify({ code: 1, msg: e.message }), { status: 500 });
  }
}
