export async function onRequest({ request, env }) {
  const RPC = 'https://bscrpc.com';
  const ART = '0x7ff6eeb4020dad718a791cf5f6c3e72027666666';
  const USDT = '0x55d398326f99059ff775485246999027b3197955';
  const FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';

  try {
    // 获取 ART/USDT 交易对地址
    const pairUsdt = await getPairAddress(ART, USDT);
    if (!pairUsdt) {
      throw new Error('ART/USDT 交易对不存在');
    }

    // 获取储备量
    const r = await getReserves(pairUsdt);
    // 根据 PancakeSwap V2 排序规则，USDT (0x55d398...) < ART (0x7ff6eeb...)
    // 所以 USDT 是 token0，ART 是 token1
    const usdtReserve = Number(r.reserve0) / 1e18;
    const artReserve  = Number(r.reserve1) / 1e18;

    if (artReserve <= 0 || usdtReserve <= 0) {
      throw new Error('流动性为空');
    }

    // 计算 ART 的美元价格
    const artPrice = (usdtReserve / artReserve).toFixed(6);
    // 计算交易对 TVL（USDT 是美元稳定币）
    const tvl = (usdtReserve * 2).toFixed(2);

    return new Response(JSON.stringify({
      code: 0,
      data: {
        price: artPrice,
        change24h: 0,
        volume24h: 0,
        liquidity: tvl,
        fdv: 0,
        pair: pairUsdt
      }
    }), { headers: { 'Content-Type': 'application/json' } });

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
}
