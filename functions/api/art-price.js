export async function onRequest({ request, env }) {
  const RPC = 'https://bscrpc.com';
  const ART = '0x7ff6eeb4020dad718a791cf5f6c3e72027666666';
  const USDT = '0x55d398326f99059ff775485246999027b3197955';
  const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';

  try {
    // 1. 尝试 ART/USDT 交易对
    const pairUsdt = await getPairAddress(ART, USDT);
    if (pairUsdt) {
      const r = await getReserves(pairUsdt);
      // 确定代币顺序：USDT 地址较小，所以 USDT 是 token0，ART 是 token1
      const usdtReserve = Number(r.reserve0) / 1e18;
      const artReserve  = Number(r.reserve1) / 1e18;
      if (artReserve <= 0 || usdtReserve <= 0) throw new Error('流动性为0');
      const artPrice = (usdtReserve / artReserve).toFixed(6);
      return jsonResponse(0, { price: artPrice, change24h: 0, volume24h: 0, liquidity: 0, fdv: 0 });
    }

    // 2. 回退到 ART/WBNB（需要判断顺序，同样取地址小的为 token0）
    const pairWbnb = await getPairAddress(ART, WBNB);
    if (!pairWbnb) throw new Error('交易对不存在');
    const r2 = await getReserves(pairWbnb);
    let artAmount, wbnbAmount;
    // WBNB 地址 0xbb4C... 比 ART 地址 0x7ff6... 小，所以 WBNB 是 token0
    if (WBNB.toLowerCase() < ART.toLowerCase()) {
      wbnbAmount = Number(r2.reserve0) / 1e18;
      artAmount  = Number(r2.reserve1) / 1e18;
    } else {
      artAmount  = Number(r2.reserve0) / 1e18;
      wbnbAmount = Number(r2.reserve1) / 1e18;
    }
    if (artAmount <= 0 || wbnbAmount <= 0) throw new Error('流动性为0');
    const artPriceInBnb = wbnbAmount / artAmount;

    const bnbRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');
    if (!bnbRes.ok) throw new Error('获取BNB价格失败');
    const bnbPrice = parseFloat((await bnbRes.json()).price);
    if (isNaN(bnbPrice)) throw new Error('BNB价格无效');
    const artPriceUsd = (artPriceInBnb * bnbPrice).toFixed(6);
    return jsonResponse(0, { price: artPriceUsd, change24h: 0, volume24h: 0, liquidity: 0, fdv: 0 });

  } catch (e) {
    return new Response(JSON.stringify({ code: 1, msg: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
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
                tokenA.slice(2).toLowerCase().padStart(64, '0') +
                tokenB.slice(2).toLowerCase().padStart(64, '0')
        }, 'latest'],
        id: 1
      })
    }).then(r => r.json());
    if (res.error) throw new Error('RPC错误');
    if (!res.result || res.result === '0x0000000000000000000000000000000000000000') return null;
    return '0x' + res.result.slice(26);
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
    const hex = res.result.startsWith('0x') ? res.result.slice(2) : res.result;
    return {
      reserve0: BigInt('0x' + hex.slice(0, 64)),
      reserve1: BigInt('0x' + hex.slice(64, 128))
    };
  }

  function jsonResponse(code, data) {
    return new Response(JSON.stringify({ code, data }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
