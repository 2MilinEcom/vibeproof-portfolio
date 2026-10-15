#!/usr/bin/env node
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function transpile(file) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}

function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(transpile(file), {
    exports,
    Buffer,
    Date,
    Set,
    process: { env: {} },
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith('node:')) return require(name);
      throw new Error(`Unmocked dependency: ${name}`);
    },
  }, { filename: file });
  return exports;
}

function fakePrisma() {
  const jobs = [];
  const reviews = [];
  return {
    _jobs: jobs,
    _reviews: reviews,
    importJob: {
      async findFirst({ where }) { return jobs.find((j) => j.shop === where.shop && j.externalBatchId === where.externalBatchId) || null; },
      async create({ data }) {
        const row = { id: `job-${jobs.length + 1}`, totalRows: 0, importedRows: 0, skippedRows: 0, errorsJson: null, completedAt: null, ...data };
        jobs.push(row); return { ...row };
      },
      async update({ where, data }) {
        const row = jobs.find((j) => j.id === where.id); Object.assign(row, data); return { ...row };
      },
    },
    review: {
      async findMany({ where }) {
        const keys = new Set(where.importKey.in); return reviews.filter((r) => keys.has(r.importKey)).map((r) => ({ importKey: r.importKey }));
      },
      async createMany({ data }) { reviews.push(...data.map((r) => ({ ...r }))); return { count: data.length }; },
    },
  };
}

const csv = load('app/lib/csv.server.ts');

function loadImporter(prisma) {
  return load('app/lib/review-import.server.ts', {
    '../db.server': { __esModule: true, default: prisma },
    './csv.server': csv,
  });
}

test('NextPlay review import maps rows to the StoreForge Shopify product and retries without duplicates', async () => {
  const prisma = fakePrisma();
  const importer = loadImporter(prisma);
  const csvText = [
    'product_handle,rating,body,reviewer_name,verified_purchase',
    'wrong-product,5,Love it,Ada,false',
    'wrong-product,4,Works well,Lin,true',
  ].join('\n');
  const input = {
    shop: 'demo.myshopify.com', filename: 'reviews.csv', csvText, externalBatchId: 'launch-1-reviews',
    target: { productId: 'gid://shopify/Product/123', productHandle: 'real-product', productTitle: 'Real Product', forceProductMapping: true },
  };
  const first = await importer.importReviewCsv(input);
  assert.equal(first.importedRows, 2);
  assert.equal(prisma._reviews.length, 2);
  assert.ok(prisma._reviews.every((r) => r.productId === 'gid://shopify/Product/123'));
  assert.ok(prisma._reviews.every((r) => r.productHandle === 'real-product'));
  assert.equal(prisma._reviews[0].verifiedPurchase, false);
  assert.equal(prisma._reviews[1].verifiedPurchase, true);
  assert.ok(prisma._reviews.every((r) => r.source === 'IMPORT'));
  assert.ok(prisma._reviews.every((r) => typeof r.importKey === 'string' && r.importKey.length === 64));

  const second = await importer.importReviewCsv(input);
  assert.equal(second.reused, true);
  assert.equal(prisma._reviews.length, 2);
  assert.equal(prisma._jobs.length, 1);
});

test('manual batch id is stable for the same CSV bytes', () => {
  const prisma = fakePrisma();
  const importer = loadImporter(prisma);
  const a = importer.manualBatchId('rating,body,reviewer_name\n5,Great,Ada\n');
  const b = importer.manualBatchId('rating,body,reviewer_name\n5,Great,Ada\n');
  assert.equal(a, b);
  assert.match(a, /^manual:[a-f0-9]{64}$/);
});

test('internal integration routes require a shared key and expose no Shopify session bypass', () => {
  const status = fs.readFileSync('app/routes/internal.nextplay.status.ts', 'utf8');
  const imports = fs.readFileSync('app/routes/internal.nextplay.import-reviews.ts', 'utf8');
  for (const source of [status, imports]) {
    assert.match(source, /NEXTPLAY_INTERNAL_KEY/);
    assert.match(source, /x-nextplay-key/);
    assert.match(source, /Unauthorized/);
    assert.match(source, /verifySharedSecret/);
  }
  assert.match(imports, /forceProductMapping/);
});
