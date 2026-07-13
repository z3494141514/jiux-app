export async function onRequest({ request, env }) {
  const RPC = 'https://bsc-dataseed.binance.org/';
  const ART = '0x7ff6eeb4020dad718a791cf5f6c3e72027666666';
  const USDT = '0x55d398326f99059ff775485246999027b3197955';
  const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';

  try {
    // 1. 尝试获取 ART/USDT 交易对
    const pairUsdt = await getPairAddress(ART, USDT);
    if (pairUsdt) {
      const r = await getReserves(pairUsdt);
      // BSC 上的 USDT 代币精度为 18 位（BEP-20 版本）
      const artReserve = Number(r.reserve0) / 1e18;
      const usdtReserve = Number(r.reserve1) / 1e18;
      if (artReserve <= 0 || usdtReserve <= 0) {
        throw new Error('ART/USDT 流动性为空');
      }
      const artPrice = (usdtReserve / artReserve).toFixed(6);
      return jsonResponse(0, { price: artPrice, change24h: 0, volume24h: 0, liquidity: 0, fdv: 0 });
    }

    // 2. 回退到 ART/WBNB
    const pairWbnb = await getPairAddress(ART, WBNB);
    if (!pairWbnb) {
      throw new Error('ART 交易对不存在');
    }
    const r2 = await getReserves(pairWbnb);
    const artAmount = Number(r2.reserve0) / 1e18;
    const wbnbAmount = Number(r2.reserve1) / 1e18;
    if (artAmount <= 0 || wbnbAmount <= 0) {
      throw new Error('ART/WBNB 流动性为空');
    }
    const artPriceInBnb = wbnbAmount / artAmount;
    
    // 3. BNB 价格
    const bnbRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');
    if (!bnbRes.ok) throw new Error('获取BNB价格失败');
    const bnbData = await bnbRes.json();
    const bnbPrice = parseFloat(bnbData.price);
    if (isNaN(bnbPrice)) throw new Error('BNB价格无效');
    
    const artPriceUsd = (artPriceInBnb * bnbPrice).toFixed(6);
    return jsonResponse(0, { price: artPriceUsd, change24h: 0, volume24h: 0, liquidity: 0, fdv: 0 });

  } catch (e) {
    return new Response(JSON.stringify({ code: 1, msg: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 辅助函数：获取交易对地址
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
    
    if (res.error) {
      throw new Error('RPC 错误: ' + res.error.message);
    }
    if (!res.result || res.result === '0x0000000000000000000000000000000000000000') {
      return null; // 交易对未创建
    }
    // 提取地址：去掉前导24个0（12字节）
    return '0x' + res.result.slice(26);
  }

  // 辅助函数：获取储备量
  async function getReserves(pair) {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{
          to: pair,
          data: '0x0902f1ac'
        }, 'latest'],
        id: 2
      })
    }).then(r => r.json());
    
    if (res.error) {
      throw new Error('获取储备失败: ' + res.error.message);
    }
    const raw = res.result;
    // 移除 0x 前缀，确保长度为 192 位（64*3）
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    if (hex.length < 128) {
      throw new Error('储备数据长度异常');
    }
    const reserve0 = BigInt('0x' + hex.slice(0, 64));
    const reserve1 = BigInt('0x' + hex.slice(64, 128));
    return { reserve0, reserve1 };
  }

  function jsonResponse(code, data) {
    return new Response(JSON.stringify({ code, data }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
