/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader isolates server modules for SQLite tests. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

// Run the existing TypeScript queries against a real, small SQLite database.
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(__dirname, '../../elosys/schema.sql'), 'utf8'));
sqlite.exec('PRAGMA foreign_keys = OFF');
sqlite.exec(`INSERT INTO people (id, canonical_name, created_at)
  VALUES (1, 'A', 'today'), (2, 'B', 'today');
  INSERT INTO declared_assets (person_id, year, value_cents, tse_candidacy_id, provenance_id, collected_at)
  VALUES (1, 2024, 100, '1', 1, 'today'), (1, 2026, 200, '1', 1, 'today'),
         (2, 2024, 500, '2', 1, 'today'), (2, 2026, 400, '2', 1, 'today');`);
sqlite.exec(`INSERT INTO politician_history
  (person_id, cpf_trusted, year, office, provenance_id, collected_at)
  VALUES (1, 0, 2024, 'Mayor', 1, 'today'), (1, 0, 2026, 'Senator', 1, 'today');
  INSERT INTO candidate_photo
  (person_id, tse_candidacy_id, year, photo_url, provenance_id, collected_at)
  VALUES (1, '1', 2026, 'https://example.test/photo.jpg', 1, 'today');`);
sqlite.exec(`INSERT INTO campaign_expense
  (cnpj, year, amount_cents, supplier_cpf_cnpj, supplier_name, supplier_company_id,
   tse_candidacy_id, provenance_id, collected_at) VALUES
  ('campaign', 2024, 100, '111', 'Company A', 1, 'candidate1', 1, 'today'),
  ('campaign', 2024, 200, '111', 'Company A', 1, 'candidate2', 1, 'today'),
  ('campaign', 2026, 500, '222', 'Company B', 2, 'candidate3', 1, 'today');`);
let queryCount = 0;
const connection = { prepare(sql) { queryCount++; return sqlite.prepare(sql); } };
const dbPath = require.resolve('../src/lib/db.ts');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { db: () => connection, hasTable: (name) => Boolean(sqlite.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)) } };

test('supplier ranking keeps year and limit separate and avoids repeating SQL', () => {
  const { getTopSuppliers } = require('../src/lib/queries.ts');
  const all = getTopSuppliers(null, 10);
  assert.deepEqual(all.map(r => r.totalCents), [500, 300]);
  const count = queryCount;
  assert.deepEqual(getTopSuppliers(null, 10), all);
  assert.equal(queryCount, count, 'repeated access must use the cache');
  assert.equal(getTopSuppliers(2024, 10)[0].totalCents, 300);
  assert.equal(getTopSuppliers(null, 1).length, 1);
});

test('startup prepares all home filters and shares cache with separately loaded modules', async () => {
  process.env.NEXT_RUNTIME = 'nodejs';
  process.env.NODE_ENV = 'production';
  await require('../src/instrumentation.ts').register();
  for (const filename of ['queries', 'stats', 'home-cache']) {
    const fullPath = path.join(__dirname, '../src/lib', `${filename}.ts`);
    if (fs.existsSync(fullPath)) delete require.cache[require.resolve(fullPath)];
  }
  const queries = require('../src/lib/queries.ts');
  const stats = require('../src/lib/stats.ts');
  const count = queryCount;
  assert.deepEqual(queries.getExpenseYears(), [2026, 2024]);
  for (const year of [undefined, 2024, 2026]) {
    assert.equal(stats.getHomeStats(year).expensesTotalCents,
      year === 2024 ? 300 : year === 2026 ? 500 : 800);
    queries.getTopSuppliers(year ?? null, 10);
  }
  stats.getSidebarCounts();
  queries.getAssetYears();
  assert.equal(queryCount, count, 'first visitor must not recalculate home aggregates');
  queries.getAssetsRanking({});
  queries.getAssetsGrowthRanking({});
  assert.ok(queryCount - count <= 4, 'rankings only fetch profiles and photos');
});

test('asset rankings reuse aggregates across pagination and sort while retaining latest snapshots', () => {
  const queries = require('../src/lib/queries.ts');
  const top = queries.getAssetsRanking({ limit: 1 });
  assert.equal(top.total, 2);
  assert.equal(top.rows[0].assetTotalCents, 400);
  const count = queryCount;
  const next = queries.getAssetsRanking({ limit: 1, offset: 1 });
  assert.equal(next.rows[0].assetTotalCents, 200);
  assert.equal(next.rows[0].name, 'A');
  assert.equal(next.rows[0].office, 'Senator');
  assert.equal(next.rows[0].photoUrl, 'https://example.test/photo.jpg');
  assert.ok(queryCount - count <= 2, 'pagination only fetches profiles and photos');
  assert.equal(queries.getAssetsRanking({ order: 'asc', limit: 1 }).rows[0].personId, 1);
  assert.equal(queries.getAssetsRanking({ year: 2024, limit: 1 }).rows[0].assetTotalCents, 500);
  assert.equal(queries.getAssetsRanking({ year: 2024, offset: 1, limit: 1 }).rows[0].office, 'Mayor');
  assert.equal(queries.getAssetsRanking({ offset: 100 }).rows.length, 0);
  assert.equal(queries.getAssetsGrowthRanking({ limit: 1 }).rows[0].growthCents, 100);
  const growthCount = queryCount;
  const bottom = queries.getAssetsGrowthRanking({ order: 'asc', limit: 1 });
  assert.equal(bottom.rows[0].growthCents, -100);
  assert.ok(queryCount - growthCount <= 2, 'growth sort only fetches profiles and photos');
});
