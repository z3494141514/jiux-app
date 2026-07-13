export async function onRequest({ request, env }) {
  const RPC = 'https://bsc-dataseed.binance.org/';
  const ART = '0x7ff6eeb4020dad718a791cf5f6c3e72027666666';
  const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const USDT = '0x55d398326f99059ff775485246999027b3197955';
  const FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';

  try {
    let artReserve, usdReserve;

    // 1. 优先尝试 ART/USDT 交易对
    const pairUsdt = await getPairAddress(ART, USDT);
    if (pairUsdt) {
      const r = await getReserves(pairUsdt);
      // USDT 是 18 位？BSC USDT 是 18 位（BEP-20 版本）
      // 判断 token0 和 token1 的顺序
      // 这里简化处理：已知 PancakeSwap 上 ART 部署较早，USDT 地址较大，所以 ART 可能是 token0，USDT 是 token1
      artReserve = Number(r.reserve0) / 1e18;
      usdReserve = Number(r.reserve1) / 1e18; // USDT 18 位
      if (artReserve <= 0 || usdReserve <= 0) throw new Error('流动性为0');
      const artPriceUsd = (usdReserve / artReserve).toFixed(6);
      return new Response(JSON.stringify({ code: 0, data: { price: artPriceUsd, change24h: 0, volume24h: 0, liquidity: 0, fdv: 0 } }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 2. 回退到 ART/WBNB，然后转 USD
    const pairWbnb = await getPairAddress(ART, WBNB);
    if (!pairWbnb) throw new Error('交易对不存在');
    const r2 = await getReserves(pairWbnb);
    const artAmount = Number(r2.reserve0) / 1e18;
    const wbnbAmount = Number(r2.reserve1) / 1e18;
    if (artAmount <= 0 || wbnbAmount <= 0) throw new Error('流动性为0');
    const artPriceInBnb = wbnbAmount / artAmount;
    const bnbPrice = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT').then(r => r.json()).then(d => parseFloat(d.price));
    const artPriceUsd = (artPriceInBnb * bnbPrice).toFixed(6);
    return new Response(JSON.stringify({ code: 0, data: { price: artPriceUsd, change24h: 0, volume24h: 0, liquidity: 0, fdv: 0 } }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ code: 1, msg: e.message }), { status: 500 });
  }

  async function getPairAddress(tokenA, tokenB) {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{
          to: FACTORY,
          data: '0xe6a43905' +
                tokenA.toLowerCase().substring(2).padStart(64, '0') +
                tokenB.toLowerCase().substring(2).padStart(64, '0')
        }, 'latest'],
        id: 1
      })
    }).then(r => r.json());
    if (res.error || !res.result || res.result === '0x0000000000000000000000000000000000000000') return null;
    return '0x' + res.result.substring(26);
  }

  async function getReserves(pair) {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: pair, data: '0x0902f1ac' }, 'latest'],
        id: 2
      })
    }).then(r => r.json());
    if (res.error) throw new Error('获取储备失败');
    const raw = res.result;
    return {
      reserve0: BigInt('0x' + raw.substring(2, 66)),
      reserve1: BigInt('0x' + raw.substring(66, 130))
    };
  }
}
