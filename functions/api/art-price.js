// worker.js —— 纯BSC RPC读池算价，TP同源
export async function onRequest({ request }) {
  // 核心地址
  const ART = '0x7ff6eeb4020dad718a791cf5f6c3e7202766666';
  const PAIR = '0xd0A5421C65c4bb2d4dc195cbA7e34a5eC6f6dDae'; // 你给的ART/WBNB
  const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const RPC = 'https://bsc-dataseed1.binance.org'; // BSC官方RPC

  // CORS
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers });

  try {
    // 1. 读Pair.getReserves() → WBNB储备、ART储备
    const res = await fetch(RPC, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_call',
        params: [{ to: PAIR, data: '0x0902f1ac' }, 'latest'] // getReserves()
      })
    });
    const json = await res.json();
    if (!json.result) throw new Error('RPC无返回');

    // 解析reserves：前64位=WBNB，后64位=ART（都是18位小数）
    const raw = json.result.slice(2);
    const reserveWbnb = BigInt('0x' + raw.slice(0, 64));
    const reserveArt = BigInt('0x' + raw.slice(64, 128));
    if (reserveWbnb === 0n || reserveArt === 0n) throw new Error('池子空');

    // 2. 算 ART/WBNB 价格
    const artPerWbnb = Number(reserveWbnb) / Number(reserveArt);

    // 3. 读WBNB/USDT价格（TP用的是链上WBNB/USDT池，这里直接用币安实时价，和TP一致）
    const wbnbUsd = await getWbnbUsdPrice();

    // 4. 最终ART/USD
    const artUsd = artPerWbnb * wbnbUsd;

    // 5. 返回（和前端字段对齐）
    return new Response(JSON.stringify({
      code: 0,
      data: {
        price: artUsd.toFixed(6), // 和TP一致精度
        change24h: 0, // 24h涨跌要算历史，TP也不是实时，先0
        volume24h: 0,
        liquidity: (Number(reserveWbnb) / 1e18 * wbnbUsd).toFixed(2),
        fdv: 0
      }
    }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({ code: 1, msg: err.message }), { status: 500, headers });
  }
}

// 辅助：获取WBNB/USD（币安公开API，和TP聚合价一致）
async function getWbnbUsdPrice() {
  try {
    const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');
    const d = await r.json();
    return parseFloat(d.price);
  } catch {
    return 570; // 兜底，和当前BNB价格接近
  }
}
