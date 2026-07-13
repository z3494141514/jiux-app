export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { phone, goodsId, price, address } = await request.json();
  if (!phone || !goodsId || !price || !address) {
    return new Response(JSON.stringify({ code: 1, msg: '参数不全，请填写收货地址' }), { status: 400 });
  }

  // 获取商品信息（含支付方式、自定义算力倍数）
  const goods = await env.DB.prepare(
    "SELECT required_level, upgrade_level, pay_type, power_ratio FROM goods WHERE id = ?"
  ).bind(goodsId).first();
  if (!goods) return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });

  // 获取购买者信息
  const buyer = await env.DB.prepare(
    "SELECT level, token, bean, parent_phone FROM users WHERE phone = ?"
  ).bind(phone).first();
  if (!buyer) return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), { status: 400 });

  // 检查等级限制
  if (goods.required_level > buyer.level) {
    return new Response(JSON.stringify({ code: 3, msg: '您的会员等级不足' }), { status: 400 });
  }

  const payType = goods.pay_type || 'token';

  // 根据支付方式检查余额
  if (payType === 'token') {
    if (buyer.token < price) {
      return new Response(JSON.stringify({ code: 2, msg: '酒令余额不足' }), { status: 400 });
    }
  } else if (payType === 'bean') {
    if ((buyer.bean || 0) < price) {
      return new Response(JSON.stringify({ code: 2, msg: '酒豆余额不足' }), { status: 400 });
    }
  }

  // ----- 确定赠送算力倍数 -----
  let powerRatio;
  if (goods.power_ratio !== null && goods.power_ratio !== undefined) {
    // 商品明确设置了倍数，即使是 0 也使用
    powerRatio = Number(goods.power_ratio);
  } else {
    // 否则使用全局参数
    const cfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'powerRatio'").first();
    powerRatio = Number(cfg?.value) || 2;
  }
  const addPower = Math.floor(price * powerRatio);

  // 构建事务语句
  const statements = [];

  // 扣款并增加算力
  if (payType === 'token') {
    statements.push(
      env.DB.prepare("UPDATE users SET token = token - ?, power = power + ? WHERE phone = ? AND token >= ?")
        .bind(price, addPower, phone, price)
    );
  } else if (payType === 'bean') {
    statements.push(
      env.DB.prepare("UPDATE users SET bean = bean - ?, power = power + ? WHERE phone = ? AND bean >= ?")
        .bind(price, addPower, phone, price)
    );
  }

  // 插入订单（含地址、支付方式）
  statements.push(
    env.DB.prepare("INSERT INTO orders (phone, goods_id, price, address, pay_type) VALUES (?, ?, ?, ?, ?)")
      .bind(phone, goodsId, price, address, payType)
  );

  // 购买升级
  if (goods.upgrade_level > buyer.level) {
    statements.push(env.DB.prepare("UPDATE users SET level = ? WHERE phone = ?").bind(goods.upgrade_level, phone));
  }

  // 等级返利（只有酒令支付才触发）
  if (payType === 'token') {
    const buyerLevelInfo = await env.DB.prepare(
      "SELECT reward_percent FROM member_levels WHERE level = ?"
    ).bind(buyer.level).first();
    const rewardPercent = buyerLevelInfo?.reward_percent || 0;
    if (rewardPercent > 0 && buyer.parent_phone) {
      const rewardAmount = Math.floor(price * rewardPercent / 100);
      if (rewardAmount > 0) {
        // 一级返利
        statements.push(
          env.DB.prepare("UPDATE users SET token = token + ? WHERE phone = ?")
            .bind(rewardAmount, buyer.parent_phone)
        );
        statements.push(
          env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 1, ?)")
            .bind(phone, buyer.parent_phone, rewardAmount)
        );
        // 二级返利（减半）
        const parent1 = await env.DB.prepare("SELECT parent_phone FROM users WHERE phone = ?").bind(buyer.parent_phone).first();
        if (parent1 && parent1.parent_phone) {
          const reward2 = Math.floor(price * rewardPercent / 200);
          if (reward2 > 0) {
            statements.push(
              env.DB.prepare("UPDATE users SET token = token + ? WHERE phone = ?")
                .bind(reward2, parent1.parent_phone)
            );
            statements.push(
              env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 2, ?)")
                .bind(phone, parent1.parent_phone, reward2)
            );
          }
        }
      }
    }
  }

  // 执行事务
  const batchResult = await env.DB.batch(statements);
  if (batchResult[0].meta.changes === 0) {
    return new Response(JSON.stringify({ code: 2, msg: '支付失败' }), { status: 400 });
  }

  // 返回更新后的用户信息
  const user = await env.DB.prepare(
    "SELECT phone, invite_code, power, asset, bean, token, level FROM users WHERE phone = ?"
  ).bind(phone).first();
  return new Response(JSON.stringify({ code: 0, user }), { headers: { 'Content-Type': 'application/json' } });
}
