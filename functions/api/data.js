export default async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const KEY = "app_data";
  const initData = {
    config: {
      powerRatio: 2,
      releaseHour: 8,
      releaseRate: 0.05,
      assetToBeanRate: 5
    },
    users: [],
    releaseLog: [],
    rechargeLog: [],
    withdrawLog: []
  };

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === "GET") {
    let data = await env.KV.get(KEY);
    if (!data) data = JSON.stringify(initData);
    return new Response(JSON.stringify({ data }), { headers: corsHeaders });
  }

  if (request.method === "POST") {
    const body = await request.json();
    await env.KV.put(KEY, body.data);
    return new Response(JSON.stringify({ code: 0, msg: "success" }), { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ msg: "Method Not Allowed" }), { status: 405, headers: corsHeaders });
}
