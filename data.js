export default async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const KEY = "app_data";

  // 初始化完整数据结构
  const initData = {
    // 全局配置（后台可修改）
    config: {
      powerRatio: 2,        // 购买赠送算力倍数
      releaseHour: 8,       // 每日算力开始释放 小时(0-23)
      releaseRate: 0.05,    // 每日算力释放比例 0.05=5%
      assetToBeanRate: 5    // 数字资产转酒豆比例 1:5
    },
    // 用户列表
    users: [],
    // 每日算力释放记录（防重复每日多次释放）
    releaseLog: []
  };

  // GET 查询数据
  if (request.method === "GET") {
    let data = await env.KV.get(KEY);
    if (!data) data = JSON.stringify(initData);
    return new Response(JSON.stringify({ data }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // POST 保存数据
  if (request.method === "POST") {
    const body = await request.json();
    await env.KV.put(KEY, body.data);
    return new Response(JSON.stringify({ code: 0, msg: "success" }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Method Not Allowed", { status: 405 });
}