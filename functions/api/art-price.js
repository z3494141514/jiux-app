export async function onRequest({ request, env }) {
  try {
    const RPC = 'https://bsc-dataseed.binance.org/';
    const ART = '0x7ff6eeb4020dad718a791cf5f6c3e72027666666';
    const USDT = '0x55d398326f99059ff775485246999027b3197955';
    const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
    const FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';

    // 1. 先查 ART/USDT
    let pair = await getPair(FACTORY, ART, USDT);
    let useUsdt = true;
    if (!pair) {
      // 2. 回退到 ART/WBNB
      pair = await getPair(FACTORY, ART, WBNB);
      useUsdt = false;
    }
    if (!pair) throw new Error('交易对不存在');

    const reserves = await getReserves(pair);
    const reserve0 = Number(reserves._reserve0) / 1e18;
    const reserve1 = Number(reserves._reserve1) / 1e18;
    if (reserve0 <= 0 || reserve1 <= 0) throw new Error('流动性为零');

    let price;
    if (useUsdt) {
      price = (reserve1 / reserve0).toFixed(6);
    } else {
      const bnbPrice = await getBnbPrice();
      price = ((reserve1 / reserve0) * bnbPrice).toFixed(6);
    }

    return new Response(JSON.stringify({ code: 0, data: { price } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('art-price error:', e.message);
    return new Response(JSON.stringify({ code: 1, msg: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async function getPair(factory, token0, token1) {
    const data = '0xe6a43905' +
      token0.slice(2).toLowerCase().padStart(64, '0') +
      token1.slice(2).toLowerCase().padStart(64, '0');
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: factory, data }, 'latest'], id: 1 })
    }).then(r => r.json());
    if (res.error) throw new Error('RPC pair error: ' + res.error.message);
    const addr = res.result;
    if (!addr || addr === '0x0000000000000000000000000000000000000000') return null;
    return '0x' + addr.slice(26);
  }

  async function getReserves(pair) {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: pair, data: '0x0902f1ac' }, 'latest'], id: 2 })
    }).then(r => r.json());
    if (res.error) throw new Error('RPC reserves error: ' + res.error.message);
    const raw = res.result;
    if (!raw || raw.length < 194) throw new Error('Invalid reserves data');
    const _reserve0 = BigInt('0x' + raw.slice(2, 66));
    const _reserve1 = BigInt('0x' + raw.slice(66, 130));
    return { _reserve0, _reserve1 };
  }

  async function getBnbPrice() {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');
    const data = await res.json();
    if (!data.price) throw new Error('BNB price not available');
    return parseFloat(data.price);
  }
}
