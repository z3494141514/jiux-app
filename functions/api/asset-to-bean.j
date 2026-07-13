export async function onRequest({ request, env }) {
  // 只允许 POST 方法
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ code: 1, msg: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { phone } = body;

    if (!phone) {
      return new Response(JSON.stringify({ code: 1, msg: '缺少手机号' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 查询用户
    const user = await env.DB.prepare(
      "SELECT asset, bean FROM users WHERE phone = ?"
    ).bind(phone).first();

    if (!user) {
      return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const asset = parseFloat(user.asset) || 0;
    if (asset <= 0) {
      return new Response(JSON.stringify({ code: 2, msg: '没有可兑换的资产' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 获取兑换比例
    const cfg = await env.DB.prepare(
      "SELECT value FROM config WHERE key = 'assetToBeanRate'"
    ).first();
    const rate = Number(cfg?.value) || 5;
    const addBean = Math.floor(asset * rate);

    // 原子更新
    await env.DB.prepare(
      "UPDATE users SET asset = 0, bean = bean + ? WHERE phone = ?"
    ).bind(addBean, phone).run();

    return new Response(JSON.stringify({
      code: 0,
      msg: `兑换成功，获得 ${addBean} 酒豆`,
      addBean
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ code: 1, msg: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
