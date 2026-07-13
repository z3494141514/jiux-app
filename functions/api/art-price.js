export async function onRequest({ request, env }) {
  const RPC_LIST = [
    'https://binance.llamarpc.com',
    'https://rpc.ankr.com/bsc',
    'https://bsc-dataseed1.binance.org',
    'https://bsc-dataseed2.binance.org',
    'https://bsc-dataseed3.binance.org',
    'https://bsc-dataseed4.binance.org'
  ];
  
  const ART = '0x7ff6eeb4020dad718a791cf5f6c3e72027666666';
  const USDT = '0x55d398326f99059ff775485246999027b3197955';
  const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';

  let lastError = '';

  for (const RPC of RPC_LIST) {
    try {
      // 尝试获取 ART/USDT 交易对
      const pairUsdt = await getPairAddress(RPC, ART, USDT);
      if (pairUsdt) {
        const r = await getReserves(RPC, pairUsdt);
        // USDT (0x55d398...) < ART (0x7ff6eeb...)，所以 USDT 是 token0，ART 是 token1
        const usdtReserve = Number(r.reserve0) / 1e18;
        const artReserve  = Number(r.reserve1) / 1e18;

        if (artReserve > 0 && usdtReserve > 0) {
          const artPrice = (usdtReserve / artReserve).toFixed(6);
          const tvl = (usdtReserve * 2).toFixed(2);
          return jsonResponse(0, {
            price: artPrice,
            change24h: 0,
            volume24h: 0,
            liquidity: tvl,
            fdv: 0,
            pair: pairUsdt
          });
        }
      }

      // 回退到 ART/WBNB
      const pairWbnb = await getPairAddress(RPC, ART, WBNB);
      if (!pairWbnb) continue;

      const r2 = await getReserves(RPC, pairWbnb);
      // WBNB (0xbb4C...) < ART (0x7ff6eeb...)，所以 WBNB 是 token0
      const wbnbAmount = Number(r2.reserve0) / 1e18;
      const artAmount  = Number(r2.reserve1) / 1e18;

      if (artAmount <= 0 || wbnbAmount <= 0) continue;

      const artPriceInBnb = wbnbAmount / artAmount;
      const bnbPrice = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT')
        .then(r => r.json())
        .then(d => parseFloat(d.price));

      if (isNaN(bnbPrice)) continue;

      const artPriceUsd = (artPriceInBnb * bnbPrice).toFixed(6);
      return jsonResponse(0, {
        price: artPriceUsd,
        change24h: 0,
        volume24h: 0,
        liquidity: 0,
        fdv: 0
      });

    } catch (e) {
      lastError = e.message;
      continue;
    }
  }

  return new Response(JSON.stringify({ code: 1, msg: '所有RPC节点均不可用: ' + lastError }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });

  // 辅助函数
  async function getPairAddress(rpc, tokenA, tokenB) {
    const res = await fetch(rpc, {
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

    if (res.error) throw new Error(res.error.message || 'RPC错误');
    if (!res.result || res.result === '0x0000000000000000000000000000000000000000') return null;
    return '0x' + res.result.slice(26);
  }

  async function getReserves(rpc, pair) {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: pair, data: '0x0902f1ac' }, 'latest'],
        id: 2
      })
    }).then(r => r.json());

    if (res.error) throw new Error(res.error.message || '获取储备失败');
    const raw = res.result;
    if (!raw || raw === '0x' || raw.length < 130) {
      throw new Error('储备数据无效');
    }
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
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
