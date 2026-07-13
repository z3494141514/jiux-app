export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, goodsId, price } = await request.json();
  if (!phone || !goodsId || !price) return new Response(JSON.stringify({ code: 1, msg: '参数不全' }), { status: 400 });

  // 获取商品信息
  const goods = await env.DB.prepare("SELECT required_level, upgrade_level FROM goods WHERE id = ?").bind(goodsId).first();
  if (!goods) return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });

  // 获取购买者信息
  const buyer = await env.DB.prepare("SELECT level, token, parent_phone FROM users WHERE phone = ?").bind(phone).first();
  if (!buyer) return new Response(JSON.stringify({ code: 1, msg: '用户不存在' }), { status: 400 });

  // 检查等级限制
  if (goods.required_level > buyer.level) {
    return new Response(JSON.stringify({ code: 3, msg: '您的会员等级不足，无法购买此商品' }), { status: 400 });
  }

  // 预先检查余额
  if (buyer.token < price) {
    return new Response(JSON.stringify({ code: 2, msg: '酒令余额不足' }), { status: 400 });
  }

  // 获取算力倍数配置
  const cfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'powerRatio'").first();
  const powerRatio = Number(cfg?.value) || 2;
  const addPower = price * powerRatio;

  // 构建事务语句
  const statements = [
    // 扣减酒令、增加算力
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

  // ====== 等级返利（酒令） ======
  const buyerLevelInfo = await env.DB.prepare("SELECT reward_percent FROM member_levels WHERE level = ?").bind(buyer.level).first();
  const rewardPercent = buyerLevelInfo?.reward_percent || 0;
  if (rewardPercent > 0 && buyer.parent_phone) {
    const rewardAmount = Math.floor(price * rewardPercent / 100);
    if (rewardAmount > 0) {
      statements.push(env.DB.prepare("UPDATE users SET token = token + ? WHERE phone = ?").bind(rewardAmount, buyer.parent_phone));
      statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 1, ?)").bind(phone, buyer.parent_phone, rewardAmount));

      // 二级上级返利（减半）
      const parent1 = await env.DB.prepare("SELECT parent_phone FROM users WHERE phone = ?").bind(buyer.parent_phone).first();
      if (parent1 && parent1.parent_phone) {
        const reward2 = Math.floor(price * rewardPercent / 200);
        if (reward2 > 0) {
          statements.push(env.DB.prepare("UPDATE users SET token = token + ? WHERE phone = ?").bind(reward2, parent1.parent_phone));
          statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 2, ?)").bind(phone, parent1.parent_phone, reward2));
        }
      }
    }
  }

  // ====== 加速释放（算力→资产）两层，算力不足时有多少释放多少 ======
  if (buyer.parent_phone) {
    // 一级上级：应释放金额的15%
    const parent1Phone = buyer.parent_phone;
    const parent1 = await env.DB.prepare("SELECT power FROM users WHERE phone = ?").bind(parent1Phone).first();
    if (parent1 && parent1.power > 0) {
      const release1 = Math.floor(Math.min(price * 0.15, parent1.power));
      if (release1 > 0) {
        statements.push(env.DB.prepare("UPDATE users SET power = power - ?, asset = asset + ? WHERE phone = ?")
          .bind(release1, release1, parent1Phone));
        statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 3, ?)")
          .bind(phone, parent1Phone, release1));
      }
    }

    // 二级上级：应释放金额的5%
    if (parent1) { // parent1 可能没有记录，但上面已经查询过
      const parent2 = await env.DB.prepare("SELECT parent_phone FROM users WHERE phone = ?").bind(parent1Phone).first();
      if (parent2 && parent2.parent_phone) {
        const parent2Phone = parent2.parent_phone;
        const parent2Data = await env.DB.prepare("SELECT power FROM users WHERE phone = ?").bind(parent2Phone).first();
        if (parent2Data && parent2Data.power > 0) {
          const release2 = Math.floor(Math.min(price * 0.05, parent2Data.power));
          if (release2 > 0) {
            statements.push(env.DB.prepare("UPDATE users SET power = power - ?, asset = asset + ? WHERE phone = ?")
              .bind(release2, release2, parent2Phone));
            statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 4, ?)")
              .bind(phone, parent2Phone, release2));
          }
        }
      }
    }
  }

  // 执行事务
  const batchResult = await env.DB.batch(statements);
  if (batchResult[0].meta.changes === 0) {
    return new Response(JSON.stringify({ code: 2, msg: '支付失败，请稍后重试' }), { status: 400 });
  }

  // 获取更新后的用户信息
  const user = await env.DB.prepare("SELECT phone, invite_code, power, asset, bean, token, level FROM users WHERE phone = ?").bind(phone).first();
  return new Response(JSON.stringify({ code: 0, user }), { headers: { 'Content-Type': 'application/json' } });
}
