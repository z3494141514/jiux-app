export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { phone, orderId } = await request.json();
  if (!phone || !orderId) return new Response(JSON.stringify({ code: 1, msg: '参数不全' }), { status: 400 });

  // 校验订单状态为已发货，且属于该用户
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND phone = ? AND status = 'send'").bind(orderId, phone).first();
  if (!order) return new Response(JSON.stringify({ code: 1, msg: '订单不存在或不可确认' }), { status: 400 });

  // 查询商品当前库存
  const goods = await env.DB.prepare("SELECT stock FROM goods WHERE id = ?").bind(order.goods_id).first();
  if (!goods) return new Response(JSON.stringify({ code: 1, msg: '商品不存在' }), { status: 400 });
  if (goods.stock < 1) {
    return new Response(JSON.stringify({ code: 1, msg: '库存不足，无法确认收货' }), { status: 400 });
  }

  // 事务：更新订单状态、扣减库存、增加销量
  const batchResult = await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'done' WHERE id = ?").bind(orderId),
    env.DB.prepare("UPDATE goods SET stock = stock - 1, sales = sales + 1 WHERE id = ? AND stock >= 1").bind(order.goods_id)
  ]);

  if (batchResult[1].meta.changes === 0) {
    return new Response(JSON.stringify({ code: 1, msg: '库存扣减失败' }), { status: 400 });
  }

  return new Response(JSON.stringify({ code: 0, msg: '确认收货成功' }), { headers: { 'Content-Type': 'application/json' } });
}
