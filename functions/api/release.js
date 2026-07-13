// functions/api/release.js
export async function onRequest({ request, env }) {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = beijingTime.toISOString().slice(0, 10);
  const currentHour = beijingTime.getUTCHours();

  const cfgHour = await env.DB.prepare("SELECT value FROM config WHERE key='releaseHour'").first();
  const releaseHour = Number(cfgHour?.value) || 8;

  if (currentHour < releaseHour) {
    return new Response(JSON.stringify({ code: 0, msg: '未到释放时间' }), { headers: { 'Content-Type': 'application/json' } });
  }

  const exist = await env.DB.prepare("SELECT date FROM release_log WHERE date = ?").bind(today).first();
  if (exist) {
    return new Response(JSON.stringify({ code: 0, msg: '今日已释放' }), { headers: { 'Content-Type': 'application/json' } });
  }

  const cfgRate = await env.DB.prepare("SELECT value FROM config WHERE key='releaseRate'").first();
  const releaseRate = Number(cfgRate?.value) || 0.05;

  const { results: users } = await env.DB.prepare("SELECT phone, power FROM users WHERE power > 0").all();

  if (users.length === 0) {
    await env.DB.prepare("INSERT INTO release_log (date, user_count, executed_time) VALUES (?,0,?)").bind(today, beijingTime.toISOString()).run();
    return new Response(JSON.stringify({ code: 0, msg: '无用户需要释放' }));
  }

  const stmts = [];
  for (const u of users) {
    const releaseAmount = parseFloat((u.power * releaseRate).toFixed(2));
    // 同时增加资产并扣除算力
    stmts.push(
      env.DB.prepare("UPDATE users SET asset = asset + ?, power = power - ? WHERE phone = ? AND power >= ?")
        .bind(releaseAmount, releaseAmount, u.phone, releaseAmount)
    );
  }
  stmts.push(
    env.DB.prepare("INSERT INTO release_log (date, user_count, executed_time) VALUES (?,?,?)")
      .bind(today, users.length, beijingTime.toISOString())
  );

  await env.DB.batch(stmts);
  return new Response(JSON.stringify({ code: 0, msg: `释放完成，共${users.length}人` }), { headers: { 'Content-Type': 'application/json' } });
}
