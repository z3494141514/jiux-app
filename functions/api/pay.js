export async function onRequest({ request, env }) {
  if (request.method !== 'POST')
    return new Response(JSON.stringify({ code: 1, msg: 'Method not allowed' }), { status: 405 });

  const { phone, goodsId, price } = await request.json();
  if (!phone || !goodsId || !price)
    return new Response(JSON.stringify({ code: 1, msg: '参数不全' }), { status: 400 });

  // 获取配置中的算力倍数
  const cfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'powerRatio'").first();
  const powerRatio = Number(cfg?.value) || 2;
  const addPower = price * powerRatio;

  // ----- 查询两级上级信息 -----
  const buyer = await env.DB.prepare("SELECT parent_phone FROM users WHERE phone = ?").bind(phone).first();
  let parent1 = null;
  let parent2 = null;

  if (buyer && buyer.parent_phone) {
    parent1 = await env.DB.prepare("SELECT phone, power, parent_phone FROM users WHERE phone = ?").bind(buyer.parent_phone).first();
    if (parent1 && parent1.parent_phone) {
      parent2 = await env.DB.prepare("SELECT phone, power FROM users WHERE phone = ?").bind(parent1.parent_phone).first();
    }
  }

  // 计算加速释放金额（限制不能超过上级当前算力）
  const reward1 = parent1 ? Math.min(price * 0.15, parent1.power) : 0;
  const reward2 = parent2 ? Math.min(price * 0.05, parent2.power) : 0;

  // ----- 构造事务语句 -----
  const statements = [
    // 1. 更新购买者（扣酒令、加算力），带余额条件防超扣
    env.DB.prepare("UPDATE users SET token = token - ?, power = power + ? WHERE phone = ? AND token >= ?")
      .bind(price, addPower, phone, price),
    // 2. 插入订单
    env.DB.prepare("INSERT INTO orders (phone, goods_id, price) VALUES (?, ?, ?)")
      .bind(phone, goodsId, price)
  ];

  // 3. 一级上级返利（条件：power >= reward1，保证不扣成负数）
  if (parent1 && reward1 > 0) {
    statements.push(
      env.DB.prepare("UPDATE users SET power = power - ?, asset = asset + ? WHERE phone = ? AND power >= ?")
        .bind(reward1, reward1, parent1.phone, reward1)
    );
    statements.push(
      env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 1, ?)")
        .bind(phone, parent1.phone, reward1)
    );
  }

  // 4. 二级上级返利
  if (parent2 && reward2 > 0) {
    statements.push(
      env.DB.prepare("UPDATE users SET power = power - ?, asset = asset + ? WHERE phone = ? AND power >= ?")
        .bind(reward2, reward2, parent2.phone, reward2)
    );
    statements.push(
      env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 2, ?)")
        .bind(phone, parent2.phone, reward2)
    );
  }

  // ----- 执行事务 -----
  const batchResult = await env.DB.batch(statements);

  // 检查购买者更新是否成功
  const updateRes = batchResult[0];
  if (updateRes.meta.changes === 0) {
    return new Response(JSON.stringify({ code: 2, msg: '余额不足或支付失败' }), { status: 400 });
  }

  // 获取支付后的最新用户信息
  const user = await env.DB.prepare("SELECT phone, invite_code, power, asset, bean, token FROM users WHERE phone = ?").bind(phone).first();
  return new Response(JSON.stringify({ code: 0, user }), { headers: { 'Content-Type': 'application/json' } });
}
