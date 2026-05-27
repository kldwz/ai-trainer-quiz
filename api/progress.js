const { supabase } = require('../lib/supabase');

function defaultProgress() {
  return { answered: {}, wrongIds: [], favIds: [], tagIds: {}, dailyStats: {}, positions: {} };
}

function validateProgress(data) {
  const valid = {};
  if (typeof data.answered === 'object' && data.answered !== null) valid.answered = data.answered;
  if (Array.isArray(data.wrongIds)) valid.wrongIds = data.wrongIds;
  if (Array.isArray(data.favIds)) valid.favIds = data.favIds;
  if (typeof data.tagIds === 'object' && data.tagIds !== null) valid.tagIds = data.tagIds;
  if (typeof data.dailyStats === 'object' && data.dailyStats !== null) valid.dailyStats = data.dailyStats;
  if (typeof data.positions === 'object' && data.positions !== null) valid.positions = data.positions;
  return { ...defaultProgress(), ...valid };
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
      const { data, error } = await supabase
        .from('progress')
        .select('data')
        .eq('id', 'solo')
        .single();

      if (error || !data) {
        res.status(200).json(defaultProgress());
        return;
      }

      res.status(200).json(data.data);
    } catch {
      res.status(200).json(defaultProgress());
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const validated = validateProgress(body);

      const { error } = await supabase
        .from('progress')
        .upsert({ id: 'solo', data: validated, updated_at: new Date().toISOString() })
        .eq('id', 'solo');

      if (error) {
        res.status(500).json({ error: 'save failed' });
        return;
      }

      res.status(200).json({ ok: true });
    } catch {
      res.status(400).json({ error: 'invalid json' });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
