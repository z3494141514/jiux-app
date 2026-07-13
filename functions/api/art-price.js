export async function onRequest({ request, env }) {
  const ART_ADDRESS = '0x7ff6eeb4020dad718a791cf5f6c3e72027666666';
  
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ART_ADDRESS}`);
    const data = await res.json();
    
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0];
      return new Response(JSON.stringify({
        code: 0,
        data: {
          price: pair.priceUsd,
          change24h: pair.priceChange?.h24 || 0,
          volume24h: pair.volume?.h24 || 0,
          liquidity: pair.liquidity?.usd || 0,
          fdv: pair.fdv || 0
        }
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    return new Response(JSON.stringify({ code: 1, msg: '暂无数据' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ code: 1, msg: '请求失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
