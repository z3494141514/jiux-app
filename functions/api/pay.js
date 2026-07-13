export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { phone, goodsId, price } = await request.json();
  if (!phone || !goodsId || !price) return new Response(JSON.stringify({ code: 1, msg: '参数不全' }), { status: 400 });

  // 获取商品信息
  const goods = await env.DB.prepare("SELECT required_level, upgrade_level FROM goods WHERE id = ?").bind(goodsId).first();
  if (!goods) return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });

  // 获取购买者信息
  const buyer = await env.DB.prepare("SELECT level, token, parent_phone, power, asset FROM users WHERE phone = ?").bind(phone).first();
  if (!buyer) return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), { status: 400 });

  // 检查等级限制
  if (goods.required_level > buyer.level) {
    return new Response(JSON.stringify({ code: 3, msg: '您的会员等级不足，无法购买此商品' }), { status: 400 });
  }

  // 检查余额
  if (buyer.token < price) {
    return new Response(JSON.stringify({ code: 2, msg: '酒令余额不足' }), { status: 400 });
  }

  // 获取算力倍数
  const cfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'powerRatio'").first();
  const powerRatio = Number(cfg?.value) || 2;
  const addPower = price * powerRatio;

  // 开始构建事务语句
  const statements = [
    // 扣减购买者酒令、增加算力
    env.DB.prepare("UPDATE users SET token = token - ?, power = power + ? WHERE phone = ? AND token >= ?")
      .bind(price, addPower, phone, price),
    // 插入订单
    env.DB.prepare("INSERT INTO orders (phone, goods_id, price) VALUES (?, ?, ?)")
      .bind(phone, goodsId, price)
  ];

  // 处理升级
  if (goods.upgrade_level > buyer.level) {
    statements.push(env.DB.prepare("UPDATE users SET level = ? WHERE phone = ?").bind(goods.upgrade_level, phone));
  }

  // 获取一级上级
  let parent1 = null;
  if (buyer.parent_phone) {
    parent1 = await env.DB.prepare("SELECT phone, power, asset, level, parent_phone FROM users WHERE phone = ?").bind(buyer.parent_phone).first();
  }

  // 1. 两层加速释放
  if (parent1) {
    // 一级上级 15%
    const acc1 = Math.floor(price * 0.15);
    if (acc1 > 0 && parent1.power >= acc1) {
      statements.push(env.DB.prepare("UPDATE users SET power = power - ?, asset = asset + ? WHERE phone = ? AND power >= ?")
        .bind(acc1, acc1, parent1.phone, acc1));
      statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount, type) VALUES (?, ?, 1, ?, 'acceleration')")
        .bind(phone, parent1.phone, acc1));
    }
    // 二级上级 5%
    if (parent1.parent_phone) {
      const parent2 = await env.DB.prepare("SELECT phone, power, asset FROM users WHERE phone = ?").bind(parent1.parent_phone).first();
      if (parent2) {
        const acc2 = Math.floor(price * 0.05);
        if (acc2 > 0 && parent2.power >= acc2) {
          statements.push(env.DB.prepare("UPDATE users SET power = power - ?, asset = asset + ? WHERE phone = ? AND power >= ?")
            .bind(acc2, acc2, parent2.phone, acc2));
          statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount, type) VALUES (?, ?, 2, ?, 'acceleration')")
            .bind(phone, parent2.phone, acc2));
        }
      }
    }
  }

  // 2. 伞下等级返利（无限层级，但只处理已升级的上级）
  // 从一级上级开始向上遍历，直到没有上级
  let currentParent = parent1;
  while (currentParent) {
    if (currentParent.level > 0) {
      // 获取该上级的等级百分比
      const levelInfo = await env.DB.prepare("SELECT reward_percent FROM member_levels WHERE level = ?").bind(currentParent.level).first();
      if (levelInfo && levelInfo.reward_percent > 0) {
        const rebate = Math.floor(price * levelInfo.reward_percent / 100);
        if (rebate > 0) {
          statements.push(env.DB.prepare("UPDATE users SET token = token + ? WHERE phone = ?").bind(rebate, currentParent.phone));
          statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount, type) VALUES (?, ?, 0, ?, 'rebate')")
            .bind(phone, currentParent.phone, rebate));
        }
      }
    }
    // 向上查找
    if (currentParent.parent_phone) {
      currentParent = await env.DB.prepare("SELECT phone, level, parent_phone FROM users WHERE phone = ?").bind(currentParent.parent_phone).first();
    } else {
      currentParent = null;
    }
  }

  // 执行事务
  const batchResult = await env.DB.batch(statements);
  if (batchResult[0].meta.changes === 0) {
    return new Response(JSON.stringify({ code: 2, msg: '支付失败，请稍后重试' }), { status: 400 });
  }

  // 返回最新用户信息
  const user = await env.DB.prepare("SELECT phone, invite_code, power, asset, bean, token, level FROM users WHERE phone = ?").bind(phone).first();
  return new Response(JSON.stringify({ code: 0, user }), { headers: { 'Content-Type': 'application/json' } });
}
