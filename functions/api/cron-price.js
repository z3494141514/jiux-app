export async function onRequest({ request, env }) {
  // 可选：简单鉴权，防止恶意调用
  const auth = request.headers.get('X-Cron-Secret');
  if (auth !== env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const ART = '0x7ff6eeb4020dad718a791cf5f6c3e72027666666';
  
  // 备选价格源：DexScreener（免费，通常可用）
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ART}`);
    const data = await res.json();
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0];
      const price = parseFloat(pair.priceUsd);
      const liquidity = parseFloat(pair.liquidity?.usd || 0);
      
      if (!isNaN(price) && price > 0) {
        // 写入 D1
        await env.DB.prepare(
          "INSERT INTO token_prices (token, price, liquidity) VALUES (?, ?, ?)"
        ).bind('ART', price, liquidity).run();
        
        return new Response(JSON.stringify({ success: true, price }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    throw new Error('DexScreener 返回无效数据');
  } catch (e) {
    // 降级：使用 BNB 价格估算（如果有 RPC）
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
  }
}
