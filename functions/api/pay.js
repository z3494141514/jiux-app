export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, goodsId, price } = await request.json();
  if (!phone || !goodsId || !price) return new Response(JSON.stringify({ code: 1, msg: '参数不全' }), { status: 400 });

  // 获取商品信息（等级限制、升级等级）
  const goods = await env.DB.prepare("SELECT required_level, upgrade_level FROM goods WHERE id = ?").bind(goodsId).first();
  if (!goods) return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });

  // 获取购买者信息
  const buyer = await env.DB.prepare("SELECT level, token, parent_phone FROM users WHERE phone = ?").bind(phone).first();
  if (!buyer) return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), { status: 400 });

  // 检查等级限制
  if (goods.required_level > buyer.level) {
    return new Response(JSON.stringify({ code: 3, msg: '您的会员等级不足，无法购买此商品' }), { status: 400 });
  }

  // 预先检查余额，防止batch中部分执行
  if (buyer.token < price) {
    return new Response(JSON.stringify({ code: 2, msg: '酒令余额不足' }), { status: 400 });
  }

  // 获取算力倍数配置
  const cfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'powerRatio'").first();
  const powerRatio = Number(cfg?.value) || 2;
  const addPower = price * powerRatio;

  // 构建事务语句
  const statements = [
    // 扣减酒令、增加算力（条件更新保证余额，虽然前面已检查，但双保险）
    env.DB.prepare("UPDATE users SET token = token - ?, power = power + ? WHERE phone = ? AND token >= ?")
      .bind(price, addPower, phone, price),
    // 插入订单
    env.DB.prepare("INSERT INTO orders (phone, goods_id, price) VALUES (?, ?, ?)")
      .bind(phone, goodsId, price)
  ];

  // 处理升级：如果商品设置了升级等级，且高于当前等级，则更新等级
  if (goods.upgrade_level > buyer.level) {
    statements.push(env.DB.prepare("UPDATE users SET level = ? WHERE phone = ?").bind(goods.upgrade_level, phone));
  }

  // 上级返利（基于购买者等级对应的百分比）
  const buyerLevelInfo = await env.DB.prepare("SELECT reward_percent FROM member_levels WHERE level = ?").bind(buyer.level).first();
  const rewardPercent = buyerLevelInfo?.reward_percent || 0;
  if (rewardPercent > 0 && buyer.parent_phone) {
    const rewardAmount = Math.floor(price * rewardPercent / 100);
    if (rewardAmount > 0) {
      // 一级上级返利
      statements.push(env.DB.prepare("UPDATE users SET token = token + ? WHERE phone = ?").bind(rewardAmount, buyer.parent_phone));
      statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 1, ?)").bind(phone, buyer.parent_phone, rewardAmount));

      // 二级上级（如果存在）
      const parent1 = await env.DB.prepare("SELECT parent_phone FROM users WHERE phone = ?").bind(buyer.parent_phone).first();
      if (parent1 && parent1.parent_phone) {
        const reward2 = Math.floor(price * rewardPercent / 200); // 二级减半
        if (reward2 > 0) {
          statements.push(env.DB.prepare("UPDATE users SET token = token + ? WHERE phone = ?").bind(reward2, parent1.parent_phone));
          statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 2, ?)").bind(phone, parent1.parent_phone, reward2));
        }
      }
    }
  }

  // 执行事务
  const batchResult = await env.DB.batch(statements);
  // 检查第一条更新是否成功（影响行数>0）
  if (batchResult[0].meta.changes === 0) {
    return new Response(JSON.stringify({ code: 2, msg: '支付失败，请稍后重试' }), { status: 400 });
  }

  // 获取更新后的用户信息
  const user = await env.DB.prepare("SELECT phone, invite_code, power, asset, bean, token, level FROM users WHERE phone = ?").bind(phone).first();
  return new Response(JSON.stringify({ code: 0, user }), { headers: { 'Content-Type': 'application/json' } });
}
