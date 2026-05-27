const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const USER_ID = process.env.DEFAULT_USER_ID || '00000000-0000-0000-0000-000000000001';

function defaultProgress() {
  return { answered: {}, wrongIds: [], favIds: [], tagIds: {}, dailyStats: {}, positions: {} };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const [answersRes, favsRes, tagsRes, statsRes, posRes] = await Promise.all([
        supabase.from('answers').select('question_id, correct, your_answer, correct_answer').eq('user_id', USER_ID),
        supabase.from('favorites').select('question_id').eq('user_id', USER_ID),
        supabase.from('tags').select('question_id, tag').eq('user_id', USER_ID),
        supabase.from('daily_stats').select('date, total, correct').eq('user_id', USER_ID),
        supabase.from('positions').select('filter_key, idx').eq('user_id', USER_ID),
      ]);

      const answered = {};
      const wrongIds = [];
      for (const row of (answersRes.data || [])) {
        answered[row.question_id] = {
          correct: row.correct,
          yourAnswer: row.your_answer,
          correctAnswer: row.correct_answer,
        };
        if (!row.correct) wrongIds.push(row.question_id);
      }

      const favIds = (favsRes.data || []).map(r => r.question_id);

      const tagIds = {};
      for (const row of (tagsRes.data || [])) {
        tagIds[row.question_id] = row.tag;
      }

      const dailyStats = {};
      for (const row of (statsRes.data || [])) {
        dailyStats[row.date] = { total: row.total, correct: row.correct };
      }

      const positions = {};
      for (const row of (posRes.data || [])) {
        positions[row.filter_key] = row.idx;
      }

      res.status(200).json({ answered, wrongIds, favIds, tagIds, dailyStats, positions });
    } catch {
      res.status(200).json(defaultProgress());
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      // answers
      const answered = body.answered || {};
      const answerRows = Object.entries(answered).map(([qid, a]) => ({
        user_id: USER_ID,
        question_id: parseInt(qid),
        correct: a.correct,
        your_answer: a.yourAnswer,
        correct_answer: a.correctAnswer,
      }));

      // favorites
      const favIds = Array.isArray(body.favIds) ? body.favIds : [];
      const favRows = favIds.map(qid => ({ user_id: USER_ID, question_id: qid }));

      // tags
      const tagIds = typeof body.tagIds === 'object' ? body.tagIds : {};
      const tagRows = Object.entries(tagIds).map(([qid, tag]) => ({
        user_id: USER_ID,
        question_id: parseInt(qid),
        tag,
      }));

      // daily stats
      const dailyStats = typeof body.dailyStats === 'object' ? body.dailyStats : {};
      const statsRows = Object.entries(dailyStats).map(([date, s]) => ({
        user_id: USER_ID,
        date,
        total: s.total,
        correct: s.correct,
      }));

      // positions
      const positions = typeof body.positions === 'object' ? body.positions : {};
      const posRows = Object.entries(positions).map(([key, idx]) => ({
        user_id: USER_ID,
        filter_key: key,
        idx,
      }));

      // batch upsert
      const ops = [];
      if (answerRows.length > 0) {
        ops.push(supabase.from('answers').upsert(answerRows, { onConflict: 'user_id,question_id' }));
      }
      // delete removed favorites, then upsert current
      ops.push(supabase.from('favorites').delete().eq('user_id', USER_ID));
      if (favRows.length > 0) {
        ops.push(supabase.from('favorites').upsert(favRows, { onConflict: 'user_id,question_id' }));
      }
      // delete removed tags, then upsert current
      ops.push(supabase.from('tags').delete().eq('user_id', USER_ID));
      if (tagRows.length > 0) {
        ops.push(supabase.from('tags').upsert(tagRows, { onConflict: 'user_id,question_id' }));
      }
      if (statsRows.length > 0) {
        ops.push(supabase.from('daily_stats').upsert(statsRows, { onConflict: 'user_id,date' }));
      }
      if (posRows.length > 0) {
        ops.push(supabase.from('positions').upsert(posRows, { onConflict: 'user_id,filter_key' }));
      }

      await Promise.all(ops);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: 'save failed', detail: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
