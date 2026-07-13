export async function onRequest({ request, env }) {
  const ART_TOKEN = '0x7ff6eeb4020dad718a791cf5f6c3e72027666666'; // ART BSC 合约地址
  const USDT_TOKEN = '0x55d398326f99059ff775485246999027b3197955'; // USDT BSC 合约地址

  try {
    // 使用 PancakeSwap Subgraph 或 API 查询价格，这里用 PancakeSwap 的 API 获取兑换率
    const res = await fetch(`https://api.pancakeswap.info/api/v2/tokens/${ART_TOKEN}`);
    if (!res.ok) throw new Error('PancakeSwap API error');
    const data = await res.json();
    const price = parseFloat(data.data.price);
    if (isNaN(price)) throw new Error('Invalid price');

    // 获取 24h 变化，PancakeSwap 的 API 可能不直接提供，我们可以用 CoinGecko 或再次请求 DexScreener，这里为了简化，先返回 0 变化
    // 如果需要精确的 24h 变化，可以再查询 DexScreener 的 pair
    return new Response(JSON.stringify({
      code: 0,
      data: {
        price: price.toFixed(8),
        change24h: 0, // 暂时为0，后续可以改进
        volume24h: 0,
        liquidity: 0,
        fdv: 0
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ code: 1, msg: '获取失败' }), { status: 500 });
  }
}
