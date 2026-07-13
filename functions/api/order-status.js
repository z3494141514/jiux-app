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

  // 获取原订单状态
  const order = await env.DB.prepare("SELECT status, goods_id FROM orders WHERE id = ?").bind(orderId).first();
  if (!order) {
    return new Response(JSON.stringify({ code: 1, msg: '订单不存在' }), { status: 400 });
  }

  const oldStatus = order.status;

  // 如果要改为 done 且原状态不是 done，需要处理库存
  if (status === 'done' && oldStatus !== 'done') {
    // 检查库存
    const goods = await env.DB.prepare("SELECT stock FROM goods WHERE id = ?").bind(order.goods_id).first();
    if (!goods) {
      return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });
    }
    if (goods.stock < 1) {
      return new Response(JSON.stringify({ code: 1, msg: '库存不足，无法完成' }), { status: 400 });
    }

    // 事务：更新订单状态 + 扣库存 + 增销量
    const batchResult = await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status = 'done' WHERE id = ?").bind(orderId),
      env.DB.prepare("UPDATE goods SET stock = stock - 1, sales = sales + 1 WHERE id = ? AND stock >= 1").bind(order.goods_id)
    ]);
    if (batchResult[1].meta.changes === 0) {
      return new Response(JSON.stringify({ code: 1, msg: '扣减库存失败' }), { status: 400 });
    }
  } else {
    // 其他状态变更直接更新
    await env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, orderId).run();
  }

  return new Response(JSON.stringify({ code: 0, msg: '状态修改成功' }), { headers: { 'Content-Type': 'application/json' } });
}
