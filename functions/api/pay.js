export async function onRequest({ request, env }) {
  if (request.method !== 'POST')
    return new Response(JSON.stringify({ code: 1, msg: 'Method not allowed' }), { status: 405 });

  try {
    const { phone, goodsId, price, address } = await request.json();
    if (!phone || !goodsId || !price || !address) {
      return new Response(JSON.stringify({ code: 1, msg: '参数不全，请填写收货地址' }), { status: 400 });
    }

    // 获取商品信息
    const goods = await env.DB.prepare(
      "SELECT required_level, upgrade_level, pay_type, power_ratio FROM goods WHERE id = ?"
    ).bind(goodsId).first();
    if (!goods) return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });

    // 获取购买者信息
    const buyer = await env.DB.prepare(
      "SELECT level, token, bean, parent_phone FROM users WHERE phone = ?"
    ).bind(phone).first();
    if (!buyer) return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), { status: 400 });

    // 等级限制
    if (goods.required_level > buyer.level) {
      return new Response(JSON.stringify({ code: 3, msg: '您的会员等级不足' }), { status: 400 });
    }

    const payType = goods.pay_type || 'token';

    // 检查余额
    if (payType === 'token') {
      if (buyer.token < price) {
        return new Response(JSON.stringify({ code: 2, msg: '酒令余额不足' }), { status: 400 });
      }
    } else if (payType === 'bean') {
      if ((buyer.bean || 0) < price) {
        return new Response(JSON.stringify({ code: 2, msg: '酒豆余额不足' }), { status: 400 });
      }
    }

    // 赠送算力倍数
    let powerRatio;
    if (goods.power_ratio !== null && goods.power_ratio !== undefined) {
      powerRatio = Number(goods.power_ratio);
    } else {
      const cfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'powerRatio'").first();
      powerRatio = Number(cfg?.value) || 2;
    }
    const addPower = Math.floor(price * powerRatio);

    // 生成北京时间字符串（用于订单和日志）
    const beijingTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    // 构建事务语句
    const statements = [];

    // 扣款 + 增加算力
    if (payType === 'token') {
      statements.push(
        env.DB.prepare("UPDATE users SET token = token - ?, power = power + ? WHERE phone = ? AND token >= ?")
          .bind(price, addPower, phone, price)
      );
    } else {
      statements.push(
        env.DB.prepare("UPDATE users SET bean = bean - ?, power = power + ? WHERE phone = ? AND bean >= ?")
          .bind(price, addPower, phone, price)
      );
    }

    // 插入订单（含地址、支付方式、北京时间）
    statements.push(
      env.DB.prepare("INSERT INTO orders (phone, goods_id, price, address, pay_type, create_time) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(phone, goodsId, price, address, payType, beijingTime)
    );

    // 升级处理
    if (goods.upgrade_level > buyer.level) {
      statements.push(env.DB.prepare("UPDATE users SET level = ? WHERE phone = ?").bind(goods.upgrade_level, phone));
    }

    // 等级返利（仅酒令支付）
    if (payType === 'token') {
      const buyerLevelInfo = await env.DB.prepare(
        "SELECT reward_percent FROM member_levels WHERE level = ?"
      ).bind(buyer.level).first();
      const rewardPercent = buyerLevelInfo?.reward_percent || 0;
      if (rewardPercent > 0 && buyer.parent_phone) {
        const rewardAmount = Math.floor(price * rewardPercent / 100);
        if (rewardAmount > 0) {
          statements.push(env.DB.prepare("UPDATE users SET token = token + ? WHERE phone = ?").bind(rewardAmount, buyer.parent_phone));
          statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount, create_time) VALUES (?, ?, 1, ?, ?)").bind(phone, buyer.parent_phone, rewardAmount, beijingTime));

          const parent1 = await env.DB.prepare("SELECT parent_phone FROM users WHERE phone = ?").bind(buyer.parent_phone).first();
          if (parent1 && parent1.parent_phone) {
            const reward2 = Math.floor(price * rewardPercent / 200);
            if (reward2 > 0) {
              statements.push(env.DB.prepare("UPDATE users SET token = token + ? WHERE phone = ?").bind(reward2, parent1.parent_phone));
              statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount, create_time) VALUES (?, ?, 2, ?, ?)").bind(phone, parent1.parent_phone, reward2, beijingTime));
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

    // 返回用户信息
    const user = await env.DB.prepare("SELECT phone, invite_code, power, asset, bean, token, level FROM users WHERE phone = ?").bind(phone).first();
    return new Response(JSON.stringify({ code: 0, user }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ code: 1, msg: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
