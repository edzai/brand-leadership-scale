// Brand Leadership Scale — API Worker
// Handles /api/* routes; falls through to static assets for everything else.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function normalize(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
}

function avg(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const TIERS = [
  { min: 5.5, label: 'Brand Leader' },
  { min: 4.0, label: 'Brand Contender' },
  { min: 2.5, label: 'Brand Challenger' },
  { min: 0,   label: 'Brand Follower' },
];

const PLAN_LIMITS = {
  free:       100,
  starter:    1000,
  pro:        10000,
  enterprise: null,  // unlimited
};

// ── Entry point ─────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(url, request, env);
    }

    // Static assets
    return env.ASSETS.fetch(request);
  },
};

async function handleAPI(url, request, env) {
  try {
    const path = url.pathname;
    const method = request.method;

    if (path === '/api/v1/benchmarks' && method === 'POST') return submitBenchmark(request, env);
    if (path === '/api/v1/benchmarks' && method === 'GET')  return getBenchmarks(url, env);
    if (path === '/api/v1/score'      && method === 'POST') return apiScore(request, env);
    if (path === '/api/v1/keys'       && method === 'POST') return generateKey(request, env);
    if (path.startsWith('/api/v1/keys/') && method === 'GET') return getKeyStatus(path.split('/').pop(), env);

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    return json({ error: 'Internal server error' }, 500);
  }
}

// ── Benchmarks ──────────────────────────────────────────────────

async function updateAverage(env, key, scores) {
  const prev = (await env.BLS_KV.get(key, 'json')) || {
    count: 0, quality: 0, value: 0, innovativeness: 0, popularity: 0, overall: 0,
  };
  const n = prev.count + 1;
  const updated = {
    count: n,
    quality:        round2((prev.quality * prev.count + scores.quality) / n),
    value:          round2((prev.value * prev.count + scores.value) / n),
    innovativeness: round2((prev.innovativeness * prev.count + scores.innovativeness) / n),
    popularity:     round2((prev.popularity * prev.count + scores.popularity) / n),
    overall:        round2((prev.overall * prev.count + scores.overall) / n),
  };
  await env.BLS_KV.put(key, JSON.stringify(updated));
  return updated;
}

async function submitBenchmark(request, env) {
  const body = await request.json();
  const { brand, category, quality, value, innovativeness, popularity, overall } = body;

  if (!brand || [quality, value, innovativeness, popularity, overall].some(v => v == null)) {
    return json({ error: 'Required: brand, quality, value, innovativeness, popularity, overall' }, 400);
  }

  const scores = {
    quality: +quality, value: +value, innovativeness: +innovativeness,
    popularity: +popularity, overall: +overall,
  };

  await updateAverage(env, 'bm:global', scores);
  if (category) await updateAverage(env, `bm:cat:${normalize(category)}`, scores);
  await updateAverage(env, `bm:brand:${normalize(brand)}`, scores);

  return json({ success: true });
}

async function getBenchmarks(url, env) {
  const brand    = url.searchParams.get('brand');
  const category = url.searchParams.get('category');
  const result   = {};

  const global = await env.BLS_KV.get('bm:global', 'json');
  if (global) result.global = global;

  if (category) {
    const cat = await env.BLS_KV.get(`bm:cat:${normalize(category)}`, 'json');
    if (cat) result.category = { name: category, ...cat };
  }
  if (brand) {
    const br = await env.BLS_KV.get(`bm:brand:${normalize(brand)}`, 'json');
    if (br) result.brand = { name: brand, ...br };
  }

  return json(result);
}

// ── Freemium Score API ──────────────────────────────────────────

async function apiScore(request, env) {
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey) return json({ error: 'Missing X-API-Key header. Get a free key at POST /api/v1/keys' }, 401);

  const keyData = await env.BLS_KV.get(`key:${apiKey}`, 'json');
  if (!keyData) return json({ error: 'Invalid API key' }, 401);

  const month = new Date().toISOString().slice(0, 7);
  const used  = keyData.usage?.[month] || 0;
  const limit = PLAN_LIMITS[keyData.plan] ?? PLAN_LIMITS.free;

  if (limit && used >= limit) {
    return json({ error: `Monthly limit reached (${limit}/month on ${keyData.plan} plan). Upgrade at /docs.html`, usage: used, limit }, 429);
  }

  const body = await request.json();
  const { brand, category, scores } = body;

  if (!brand || !Array.isArray(scores) || scores.length !== 12) {
    return json({ error: 'Required: brand (string), scores (array of 12 numbers 1-7)' }, 400);
  }
  if (scores.some(s => typeof s !== 'number' || s < 1 || s > 7)) {
    return json({ error: 'Each score must be a number between 1 and 7' }, 400);
  }

  const quality        = round2(avg(scores.slice(0, 3)));
  const value          = round2(avg(scores.slice(3, 6)));
  const innovativeness = round2(avg(scores.slice(6, 9)));
  const popularity     = round2(avg(scores.slice(9, 12)));
  const overall        = round2((quality + value + innovativeness + popularity) / 4);
  const tier           = TIERS.find(t => overall >= t.min).label;

  // Collect benchmarks
  const benchmarks = {};
  const gl = await env.BLS_KV.get('bm:global', 'json');
  if (gl) benchmarks.global = gl;
  const br = await env.BLS_KV.get(`bm:brand:${normalize(brand)}`, 'json');
  if (br) benchmarks.brand = br;
  if (category) {
    const ct = await env.BLS_KV.get(`bm:cat:${normalize(category)}`, 'json');
    if (ct) benchmarks.category = ct;
  }

  // Track usage
  keyData.usage = keyData.usage || {};
  keyData.usage[month] = used + 1;
  await env.BLS_KV.put(`key:${apiKey}`, JSON.stringify(keyData));

  return json({
    brand,
    overall,
    tier,
    dimensions: { quality, value, innovativeness, popularity },
    benchmarks,
    usage: { month, count: used + 1, limit },
  });
}

// ── API Key Management ──────────────────────────────────────────

async function generateKey(request, env) {
  const { email } = await request.json();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Valid email required' }, 400);
  }

  const emailKey = email.toLowerCase();
  const existing = await env.BLS_KV.get(`key:email:${emailKey}`);
  if (existing) {
    return json({ api_key: existing, message: 'Key already exists for this email' });
  }

  const key = 'bls_' + crypto.randomUUID().replace(/-/g, '');
  await env.BLS_KV.put(`key:${key}`, JSON.stringify({
    email: emailKey,
    plan: 'free',
    created: new Date().toISOString(),
    usage: {},
  }));
  await env.BLS_KV.put(`key:email:${emailKey}`, key);

  return json({ api_key: key, plan: 'free', rate_limit: '100 requests/month', upgrade: '/docs.html' });
}

async function getKeyStatus(key, env) {
  const data = await env.BLS_KV.get(`key:${key}`, 'json');
  if (!data) return json({ error: 'Invalid API key' }, 404);

  const month = new Date().toISOString().slice(0, 7);
  const limit = PLAN_LIMITS[data.plan] ?? PLAN_LIMITS.free;
  return json({
    plan: data.plan,
    created: data.created,
    usage_this_month: data.usage?.[month] || 0,
    limit,
  });
}
