const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

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
  if (typeof provided !== 'string') return false;

  // timingSafeEqual throws on a length mismatch rather than just returning
  // false, and requires equal-length buffers - compare lengths first (this
  // alone leaks only the expected password's length, not its content) then
  // do the actual byte comparison in constant time so a wrong guess doesn't
  // reveal how many leading characters it got right via response timing.
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { getSupabaseAdmin, isAuthorized };
