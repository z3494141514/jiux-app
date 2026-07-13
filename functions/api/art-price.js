// 公共 BSC RPC（可用你自己的节点）
const RPC_URL = 'https://bsc-dataseed.binance.org/';
// ART/WBNB PancakeSwap V2 Pair 合约（已创建好的交易对，可通过工厂获取，这里直接写死）
const PAIR_ADDRESS = '0x...'; // 你需要填入正确的 ART/WBNB 交易对地址

export async function onRequest({ request, env }) {
  try {
    // 1. 获取 Pair 储备量
    const pairData = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [
          {
            to: PAIR_ADDRESS,
            data: '0x0902f1ac' // getReserves() 方法签名
          },
          'latest'
        ],
        id: 1
      })
    }).then(r => r.json());

    if (pairData.error) throw new Error('获取储备失败');
    const raw = pairData.result;
    // 解析 getReserves 返回值：_reserve0, _reserve1, _blockTimestampLast
    const reserve0 = BigInt('0x' + raw.substr(2, 64));
    const reserve1 = BigInt('0x' + raw.substr(66, 64));
    
    // 2. 确定代币顺序（需知道 ART 和 WBNB 在 pair 中的顺序）
    //    这里假设 ART 是 token0，WBNB 是 token1
    //    如果不是，调换顺序即可
    const artReserve = Number(reserve0) / 1e18;  // ART 18位
    const wbnbReserve = Number(reserve1) / 1e18; // WBNB 18位
    
    if (artReserve <= 0 || wbnbReserve <= 0) throw new Error('流动性为空');
    
    const artPriceInBnb = wbnbReserve / artReserve;

    // 3. 获取 BNB/USD 价格（可换成其他 API，这里用币安）
    const bnbUsd = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT')
      .then(r => r.json())
      .then(d => parseFloat(d.price));
    
    const artPriceUsd = artPriceInBnb * bnbUsd;

    // 4. 返回精简数据
    return new Response(JSON.stringify({
      code: 0,
      data: {
        price: artPriceUsd.toFixed(6),
        change24h: 0,            // 24h变化可后续补充
        volume24h: 0,
        liquidity: 0,
        fdv: 0
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ code: 1, msg: err.message }), { status: 500 });
  }
}
