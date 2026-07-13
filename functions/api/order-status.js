export async function onRequest({ request, env }) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ code: 403, msg: 'Forbidden' }), { status: 403 });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ code: 1, msg: 'Method not allowed' }), { status: 405 });
  }

  const { orderId, status } = await request.json();
  if (!orderId || !['wait', 'send', 'done'].includes(status)) {
    return new Response(JSON.stringify({ code: 1, msg: '参数错误' }), { status: 400 });
  }

  const order = await env.DB.prepare("SELECT status, phone, goods_id, price FROM orders WHERE id = ?").bind(orderId).first();
  if (!order) {
    return new Response(JSON.stringify({ code: 1, msg: '订单不存在' }), { status: 400 });
  }

  const oldStatus = order.status;

  // 如果要改为 done 且原状态不是 done
  if (status === 'done' && oldStatus !== 'done') {
    const goods = await env.DB.prepare("SELECT stock FROM goods WHERE id = ?").bind(order.goods_id).first();
    if (!goods) {
      return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });
    }
    if (goods.stock < 1) {
      return new Response(JSON.stringify({ code: 1, msg: '库存不足，无法完成' }), { status: 400 });
    }

    const statements = [
      env.DB.prepare("UPDATE orders SET status = 'done' WHERE id = ?").bind(orderId),
      env.DB.prepare("UPDATE goods SET stock = stock - 1, sales = sales + 1 WHERE id = ? AND stock >= 1").bind(order.goods_id)
    ];

    // 加速释放逻辑（与 confirm-order.js 相同）
    const timingCfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'releaseTiming'").first();
    const releaseTiming = timingCfg?.value || 'delivery';

    if (releaseTiming === 'delivery') {
      const buyer = await env.DB.prepare("SELECT parent_phone FROM users WHERE phone = ?").bind(order.phone).first();
      if (buyer && buyer.parent_phone) {
        const parent1Phone = buyer.parent_phone;
        const parent1 = await env.DB.prepare("SELECT power FROM users WHERE phone = ?").bind(parent1Phone).first();
        if (parent1 && parent1.power > 0) {
          const release1 = Math.floor(Math.min(order.price * 0.15, parent1.power));
          if (release1 > 0) {
            statements.push(env.DB.prepare("UPDATE users SET power = power - ?, asset = asset + ? WHERE phone = ?")
              .bind(release1, release1, parent1Phone));
            statements.push(env.DB.prepare("INSERT INTO reward_log (from_phone, to_phone, level, amount) VALUES (?, ?, 3, ?)")
              .bind(order.phone, parent1Phone, release1));
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
                .bind(order.phone, parent2Phone, release2));
            }
          }
        }
      }
    }

    const batchResult = await env.DB.batch(statements);
    if (batchResult[1].meta.changes === 0) {
      return new Response(JSON.stringify({ code: 1, msg: '扣减库存失败' }), { status: 400 });
    }
  } else {
    // 其他状态更新
    await env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, orderId).run();
  }

  return new Response(JSON.stringify({ code: 0, msg: '状态修改成功' }), { headers: { 'Content-Type': 'application/json' } });
}
