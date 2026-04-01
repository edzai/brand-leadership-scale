// Usage: node scripts/seed-benchmarks.js [base_url]
// Default: http://localhost:8787
//
// Seeds the benchmark database with realistic brand perception data
// for 20 well-known brands across 8 categories using the Brand Leadership Scale.
// Scores are on a 1–7 Likert scale (avg of 3 items per dimension).

const BASE_URL = process.argv[2] || 'http://localhost:8787';

const round2 = (n) => Math.round(n * 100) / 100;

const brands = [
  // ── Technology ──────────────────────────────────────────────────
  {
    name: 'Apple',
    category: 'Technology',
    quality: 6.4,
    value: 4.2,
    innovativeness: 6.5,
    popularity: 6.6,
  },
  {
    name: 'Samsung',
    category: 'Technology',
    quality: 5.8,
    value: 5.3,
    innovativeness: 5.7,
    popularity: 6.1,
  },
  {
    name: 'Google',
    category: 'Technology',
    quality: 6.1,
    value: 5.8,
    innovativeness: 6.3,
    popularity: 6.5,
  },

  // ── Automotive ─────────────────────────────────────────────────
  {
    name: 'Tesla',
    category: 'Automotive',
    quality: 5.5,
    value: 3.8,
    innovativeness: 6.7,
    popularity: 5.9,
  },
  {
    name: 'BMW',
    category: 'Automotive',
    quality: 6.2,
    value: 3.6,
    innovativeness: 5.4,
    popularity: 5.8,
  },
  {
    name: 'Toyota',
    category: 'Automotive',
    quality: 6.0,
    value: 5.9,
    innovativeness: 4.8,
    popularity: 6.3,
  },

  // ── Sports & Athletics ─────────────────────────────────────────
  {
    name: 'Nike',
    category: 'Sports & Athletics',
    quality: 5.9,
    value: 4.3,
    innovativeness: 5.8,
    popularity: 6.7,
  },
  {
    name: 'Adidas',
    category: 'Sports & Athletics',
    quality: 5.5,
    value: 4.7,
    innovativeness: 5.2,
    popularity: 6.1,
  },

  // ── Food & Beverage ────────────────────────────────────────────
  {
    name: 'Coca-Cola',
    category: 'Food & Beverage',
    quality: 5.4,
    value: 5.1,
    innovativeness: 4.2,
    popularity: 6.8,
  },
  {
    name: 'Starbucks',
    category: 'Food & Beverage',
    quality: 5.6,
    value: 3.5,
    innovativeness: 5.0,
    popularity: 6.3,
  },
  {
    name: "McDonald's",
    category: 'Food & Beverage',
    quality: 4.1,
    value: 5.5,
    innovativeness: 4.3,
    popularity: 6.7,
  },

  // ── Fashion & Apparel ──────────────────────────────────────────
  {
    name: 'Zara',
    category: 'Fashion & Apparel',
    quality: 4.8,
    value: 4.9,
    innovativeness: 5.3,
    popularity: 5.6,
  },
  {
    name: 'H&M',
    category: 'Fashion & Apparel',
    quality: 4.2,
    value: 5.4,
    innovativeness: 4.5,
    popularity: 5.4,
  },

  // ── Retail ─────────────────────────────────────────────────────
  {
    name: 'Amazon',
    category: 'Retail',
    quality: 5.5,
    value: 6.1,
    innovativeness: 6.2,
    popularity: 6.7,
  },
  {
    name: 'Walmart',
    category: 'Retail',
    quality: 4.3,
    value: 6.3,
    innovativeness: 3.8,
    popularity: 6.2,
  },

  // ── Beauty & Personal Care ─────────────────────────────────────
  {
    name: "L'Oréal",
    category: 'Beauty & Personal Care',
    quality: 5.7,
    value: 4.6,
    innovativeness: 5.4,
    popularity: 6.0,
  },
  {
    name: 'Dove',
    category: 'Beauty & Personal Care',
    quality: 5.3,
    value: 5.6,
    innovativeness: 4.7,
    popularity: 5.8,
  },

  // ── Financial Services ─────────────────────────────────────────
  {
    name: 'Visa',
    category: 'Financial Services',
    quality: 5.9,
    value: 4.8,
    innovativeness: 5.1,
    popularity: 6.2,
  },
  {
    name: 'PayPal',
    category: 'Financial Services',
    quality: 5.4,
    value: 5.3,
    innovativeness: 5.5,
    popularity: 5.7,
  },
];

async function seedBrand(brand) {
  const overall = round2(
    (brand.quality + brand.value + brand.innovativeness + brand.popularity) / 4
  );

  const payload = {
    brand: brand.name,
    category: brand.category,
    quality: brand.quality,
    value: brand.value,
    innovativeness: brand.innovativeness,
    popularity: brand.popularity,
    overall,
  };

  const response = await fetch(`${BASE_URL}/api/v1/benchmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

async function main() {
  console.log(`Seeding benchmarks against ${BASE_URL}`);
  console.log(`Submitting ${brands.length} brands...\n`);

  let succeeded = 0;
  let failed = 0;

  for (const brand of brands) {
    const overall = round2(
      (brand.quality + brand.value + brand.innovativeness + brand.popularity) / 4
    );

    try {
      await seedBrand(brand);
      console.log(
        `  [OK]  ${brand.name.padEnd(14)} ` +
        `(${brand.category}) — ` +
        `Q:${brand.quality} V:${brand.value} I:${brand.innovativeness} P:${brand.popularity} ` +
        `Overall:${overall}`
      );
      succeeded++;
    } catch (err) {
      console.error(`  [FAIL] ${brand.name.padEnd(14)} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
