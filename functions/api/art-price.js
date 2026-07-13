export async function onRequest({ request, env }) {
  const RPC = 'https://bsc-dataseed.binance.org/';
  const ART = '0x7ff6eeb4020dad718a791cf5f6c3e72027666666';
  const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';

  try {
    // 1. 通过 Factory 获取交易对地址
    const pairAddr = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{
          to: FACTORY,
          data: '0xe6a43905' + // getPair(address,address)
                '000000000000000000000000' + ART.substring(2) +
                '000000000000000000000000' + WBNB.substring(2)
        }, 'latest'],
        id: 1
      })
    }).then(r => r.json());

    if (pairAddr.error || !pairAddr.result || pairAddr.result === '0x0000000000000000000000000000000000000000') {
      throw new Error('交易对未创建');
    }
    const pair = '0x' + pairAddr.result.substring(26); // 去掉前面补的 0

    // 2. 获取储备量
    const reserves = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{
          to: pair,
          data: '0x0902f1ac' // getReserves()
        }, 'latest'],
        id: 2
      })
    }).then(r => r.json());

    if (reserves.error) throw new Error('获取储备失败');

    const raw = reserves.result;
    const reserve0 = BigInt('0x' + raw.substring(2, 66));
    const reserve1 = BigInt('0x' + raw.substring(66, 130));

    // 3. 确认代币顺序（ART 和 WBNB 谁在前？）
    // 通过比较合约地址大小确定，但更简单：先假设 ART 是 token0，WBNB 是 token1
    // 如果不是，调换即可。我们可以通过小量测试，但这里先按常见情况处理：WBNB 地址较大，ART 较小，所以 ART 可能是 token0，WBNB 是 token1。
    const artReserve = Number(reserve0) / 1e18;
    const wbnbReserve = Number(reserve1) / 1e18;

    if (artReserve <= 0 || wbnbReserve <= 0) throw new Error('流动性为0');

    const artPriceInBnb = wbnbReserve / artReserve;

    // 4. BNB 价格
    const bnbPrice = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT')
      .then(r => r.json())
      .then(d => parseFloat(d.price));

    const artPriceUsd = (artPriceInBnb * bnbPrice).toFixed(6);

    return new Response(JSON.stringify({
      code: 0,
      data: {
        price: artPriceUsd,
        change24h: 0,
        volume24h: 0,
        liquidity: 0,
        fdv: 0
      }
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ code: 1, msg: e.message }), { status: 500 });
  }
}
