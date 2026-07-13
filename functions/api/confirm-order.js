export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, orderId } = await request.json();
  if (!phone || !orderId) return new Response(JSON.stringify({ code: 1, msg: '参数不全' }), { status: 400 });

  // 确认订单属于该用户且状态为已发货
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND phone = ? AND status = 'send'").bind(orderId, phone).first();
  if (!order) return new Response(JSON.stringify({ code: 1, msg: '订单不可确认' }), { status: 400 });

  // 检查库存并扣减
  const goods = await env.DB.prepare("SELECT stock FROM goods WHERE id = ?").bind(order.goods_id).first();
  if (!goods || goods.stock < 1) return new Response(JSON.stringify({ code: 1, msg: '库存不足' }), { status: 400 });

  const statements = [
    env.DB.prepare("UPDATE orders SET status = 'done' WHERE id = ?").bind(orderId),
    env.DB.prepare("UPDATE goods SET stock = stock - 1, sales = sales + 1 WHERE id = ? AND stock >= 1").bind(order.goods_id)
  ];

  // 读取加速时机配置
  const timingCfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'releaseTiming'").first();
  const releaseTiming = timingCfg?.value || 'delivery'; // 默认收货后加速

  // 如果是收货后加速，执行加速释放
  if (releaseTiming === 'delivery') {
    const buyer = await env.DB.prepare("SELECT parent_phone FROM users WHERE phone = ?").bind(phone).first();
    if (buyer && buyer.parent_phone) {
      const parent1Phone = buyer.parent_phone;
      const parent1 = await env.DB.prepare("SELECT power FROM users WHERE phone = ?").bind(parent1Phone).first();
      if (parent1 && parent1.power > 0) {
        const release1 = Math.floor(Math.min(order.price * 0.15, parent1.power));
        if (release1 > 0) {
          statements.push(env.DB.prepare("UPDATE users SET power = power - ?, asset = asset + ? WHERE phone = ?")
            .bind(release1, release1, parent1Phone));
          statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 3, ?)")
            .bind(phone, parent1Phone, release1));
        }
      }
      // 二级上级
      const parent1Info = await env.DB.prepare("SELECT parent_phone FROM users WHERE phone = ?").bind(parent1Phone).first();
      if (parent1Info && parent1Info.parent_phone) {
        const parent2Phone = parent1Info.parent_phone;
        const parent2 = await env.DB.prepare("SELECT power FROM users WHERE phone = ?").bind(parent2Phone).first();
        if (parent2 && parent2.power > 0) {
          const release2 = Math.floor(Math.min(order.price * 0.05, parent2.power));
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

  const batchResult = await env.DB.batch(statements);
  if (batchResult[1]?.meta?.changes === 0) {
    return new Response(JSON.stringify({ code: 1, msg: '库存扣减失败' }), { status: 400 });
  }

  return new Response(JSON.stringify({ code: 0, msg: '确认收货成功' }), { headers: { 'Content-Type': 'application/json' } });
}
