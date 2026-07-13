export default async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const KEY = "app_data";

  // 完整初始化数据结构
  const initData = {
    // 全局配置
    config: {
      powerRatio: 2,        // 购买赠送算力倍数
      releaseHour: 8,       // 每日算力释放小时
      releaseRate: 0.05,    // 每日算力释放比例
      assetToBeanRate: 5    // 数字资产转酒豆比例
    },
    users: [],               // 会员列表
    releaseLog: [],          // 算力释放日志
    rechargeLog: [],         // 后台充值酒令记录
    withdrawLog: []          // 提现申请+审核记录
  };

  // GET 获取全部数据
  if (request.method === "GET") {
    let data = await env.KV.get(KEY);
    if (!data) data = JSON.stringify(initData);
    return new Response(JSON.stringify({ data }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // POST 保存全部数据
  if (request.method === "POST") {
    const body = await request.json();
    await env.KV.put(KEY, body.data);
    return new Response(JSON.stringify({ code: 0, msg: "success" }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Method Not Allowed", { status: 405 });
}
