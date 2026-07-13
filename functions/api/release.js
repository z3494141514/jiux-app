export async function onRequest({ request, env }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // 检查是否已释放
  const exist = await env.DB.prepare("SELECT date FROM release_log WHERE date = ?").bind(today).first();
  if (exist) return new Response(JSON.stringify({ code: 0, msg: '今日已释放' }), { headers: { 'Content-Type': 'application/json' } });
  
  // 获取配置
  const cfgHour = await env.DB.prepare("SELECT value FROM config WHERE key = 'releaseHour'").first();
  const cfgRate = await env.DB.prepare("SELECT value FROM config WHERE key = 'releaseRate'").first();
  const releaseHour = Number(cfgHour?.value) || 8;
  const releaseRate = Number(cfgRate?.value) || 0.05;
  if (now.getHours() < releaseHour) return new Response(JSON.stringify({ code: 0, msg: '未到释放时间' }));
  
  const { results: users } = await env.DB.prepare("SELECT phone, power, asset FROM users WHERE power > 0").all();
  const stmts = [];
  for (const u of users) {
    const addAsset = u.power * releaseRate;
    stmts.push(env.DB.prepare("UPDATE users SET asset = asset + ? WHERE phone = ?").bind(addAsset, u.phone));
  }
  stmts.push(env.DB.prepare("INSERT INTO release_log (date, user_count, executed_time) VALUES (?, ?, ?)").bind(today, users.length, now.toISOString()));
  await env.DB.batch(stmts);
  return new Response(JSON.stringify({ code: 0, msg: `释放完成，共${users.length}人` }), { headers: { 'Content-Type': 'application/json' } });
}
