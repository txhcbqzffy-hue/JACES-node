const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || 'https://uxhzrobxhumreuntxrzw.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!serviceKey) {
    throw new Error('Aucune cle Supabase configuree (SUPABASE_SERVICE_KEY ou SUPABASE_KEY).');
  }

  return createClient(url, serviceKey);
}

function isAuthorized(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const provided = req.headers['x-admin-password'];
  return typeof provided === 'string' && provided === expected;
}

module.exports = { getSupabaseAdmin, isAuthorized };
