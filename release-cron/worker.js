export default {
  async scheduled(event, env, ctx) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const cfgHour = await env.DB.prepare("SELECT value FROM config WHERE key='releaseHour'").first();
    const cfgRate = await env.DB.prepare("SELECT value FROM config WHERE key='releaseRate'").first();
    const releaseHour = Number(cfgHour?.value) || 8;
    const releaseRate = Number(cfgRate?.value) || 0.05;
    if (now.getUTCHours() < releaseHour) return; // 注意时区，可能需要调整为北京时间

    const exist = await env.DB.prepare("SELECT date FROM release_log WHERE date = ?").bind(today).first();
    if (exist) return;

    const { results: users } = await env.DB.prepare("SELECT phone, power FROM users WHERE power > 0").all();
    const stmts = [];
    for (const u of users) {
      const addAsset = u.power * releaseRate;
      stmts.push(env.DB.prepare("UPDATE users SET asset = asset + ? WHERE phone = ?").bind(addAsset, u.phone));
    }
    stmts.push(env.DB.prepare("INSERT INTO release_log (date, user_count, executed_time) VALUES (?,?,?)")
      .bind(today, users.length, now.toISOString()));
    await env.DB.batch(stmts);
  }
};
