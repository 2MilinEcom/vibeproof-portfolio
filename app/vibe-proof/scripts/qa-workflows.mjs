import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const qaDir = mkdtempSync(join(tmpdir(), 'vibeproof-qa-'));
const databasePath = join(qaDir, 'qa.sqlite');
const sqlite = new DatabaseSync(databasePath);
for (const name of readdirSync(join(root, 'prisma/migrations')).sort()) {
  if (name === 'migration_lock.toml') continue;
  sqlite.exec(readFileSync(join(root, 'prisma/migrations', name, 'migration.sql'), 'utf8'));
}
sqlite.close();
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } });
const state = globalThis.__vibeproofQA = { db, shop: 'qa-isolated.myshopify.com', payload: {}, storageDeleteOk: true, deletedKeys: [] };
const server = await createServer({ root, cacheDir: join(qaDir, 'vite-cache'), configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false }, plugins: [{
  name: 'isolated-qa-dependencies', enforce: 'pre',
  resolveId(source) {
    if (source === '../db.server') return '\0qa-db';
    if (source === '../shopify.server') return '\0qa-auth';
    if (source === '../lib/media.server') return '\0qa-media';
  },
  load(id) {
    if (id === '\0qa-db') return 'export default globalThis.__vibeproofQA.db;';
    if (id === '\0qa-auth') return `export const authenticate = { webhook: async () => ({shop: globalThis.__vibeproofQA.shop, payload: globalThis.__vibeproofQA.payload}), admin: async () => ({session: {shop: globalThis.__vibeproofQA.shop}, admin: {graphql: async () => Response.json({data: {products: {nodes: []}}})}}), public: {appProxy: async () => ({})} };`;
    if (id === '\0qa-media') return `export * from '${root}/app/lib/media.server.ts'; export function mediaUploadsConfigured() { return true; } export function presignObject(method, key, expires) { return 'https://qa-storage.invalid/' + key + '?expires=' + expires; } export async function deleteStorageObject(key) { globalThis.__vibeproofQA.deletedKeys.push(key); return globalThis.__vibeproofQA.storageDeleteOk; }`;
  },
}] });
const failures = [];
let checkCount = 0;
async function check(name, fn) { checkCount++; try { await fn(); console.log('PASS ' + name); } catch (e) { failures.push(name); console.log('FAIL ' + name + ': ' + e.message); } }
const args = (path, body) => ({request: new Request('https://qa.invalid' + path, {method: body ? 'POST' : 'GET', ...(body ? {body} : {})}), params: {}, context: {}});
try {
  const dataRequest = await server.ssrLoadModule('/app/routes/webhooks.customers.data_request.tsx');
  const customerRedact = await server.ssrLoadModule('/app/routes/webhooks.customers.redact.tsx');
  const shopRedact = await server.ssrLoadModule('/app/routes/webhooks.shop.redact.tsx');
  const privacy = await server.ssrLoadModule('/app/routes/app.privacy-export.tsx');
  const publicRoute = await server.ssrLoadModule('/app/routes/apps.vibeproof.tsx');
  const reviews = await server.ssrLoadModule('/app/routes/app.reviews.tsx');
  const imports = await server.ssrLoadModule('/app/routes/app.imports.tsx');
  await check('CSV imports skip invalid rows and normalize customer email for privacy matching', async () => {
    const form = new FormData();
    form.set('file', new File(['product_handle,rating,body,reviewer_name,reviewer_email,status\nqa-product,4,Synthetic import,CSV QA,CSV@EXAMPLE.INVALID,PENDING\nqa-product,9,Invalid rating,Invalid QA,,PENDING\n'], 'qa.csv', {type: 'text/csv'}));
    const result = await imports.action(args('/app/imports', form));
    assert.equal(result.ok, true);
    assert.equal(await db.review.count({where: {reviewerEmail: 'csv@example.invalid'}}), 1);
    const job = await db.importJob.findFirst();
    assert.equal(job.importedRows, 1);
    assert.equal(job.skippedRows, 1);
  });
  const email = 'qa@example.invalid';
  const review = await db.review.create({data: {shop: state.shop, productId: 'qa-product', productHandle: 'qa-product', rating: 5, body: 'Synthetic QA review', reviewerName: 'QA', reviewerEmail: email, status: 'APPROVED', source: 'CUSTOMER', media: {create: {type: 'IMAGE', storageKey: 'reviews/qa-isolated/fixture.png'}}, merchantReply: {create: {body: 'Synthetic reply'}}}});
  state.payload = {customer: {email: ' QA@EXAMPLE.INVALID '}, data_request: {id: 101}};
  await dataRequest.action(args('/webhooks/customers/data_request', '{}'));
  let item = await db.privacyRequest.findFirst();
  const original = JSON.parse(item.payloadJson);
  await check('data request exports customer review, media, and merchant reply', async () => { assert.equal(original.reviews.length, 1); assert.equal(original.reviews[0].merchantReply, 'Synthetic reply'); assert.equal(original.reviews[0].media.length, 1); });
  await dataRequest.action(args('/webhooks/customers/data_request', '{}'));
  await check('repeated data request preserves the full export', async () => { item = await db.privacyRequest.findFirst(); assert.deepEqual(JSON.parse(item.payloadJson), original); assert.equal(await db.privacyRequest.count(), 1); });
  await check('privacy export returns a JSON attachment with the complete review', async () => { const response = await privacy.loader(args('/app/privacy-export?download=' + item.id)); assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8'); assert.match(response.headers.get('Content-Disposition'), /attachment/); assert.deepEqual(await response.json(), original); });
  await check('privacy downloads are restricted to the merchant shop', async () => { state.shop = 'another-shop.myshopify.com'; await assert.rejects(() => privacy.loader(args('/app/privacy-export?download=' + item.id)), e => e.status === 404); state.shop = review.shop; });
  await db.review.create({data: {shop: state.shop, productId: 'qa-product', productHandle: 'qa-product', rating: 1, body: 'Hidden AI demo', reviewerName: 'AI Demo', status: 'APPROVED', source: 'AI_DEMO'}});
  await db.review.create({data: {shop: state.shop, productId: 'qa-product', productHandle: 'qa-product', rating: 1, body: 'Pending review', reviewerName: 'Pending QA', status: 'PENDING', source: 'CUSTOMER'}});
  await check('public feed excludes pending and AI demo reviews', async () => { const response = await publicRoute.loader(args('/apps/vibeproof?shop=' + state.shop + '&product_handle=qa-product')); const data = await response.json(); assert.equal(data.count, 1); assert.equal(data.rating, 5); assert.equal(data.reviews.length, 1); assert.ok(!('reviewerEmail' in data.reviews[0])); });
  await check('approved media uses short-lived storage URLs instead of proxy redirects', async () => { const data = await (await publicRoute.loader(args('/apps/vibeproof?shop=' + state.shop + '&product_handle=qa-product'))).json(); const url = new URL(data.reviews[0].media[0].url); assert.equal(url.origin, 'https://qa-storage.invalid'); assert.equal(url.searchParams.get('expires'), '600'); });
  await check('bulk moderation cannot alter another merchant shop', async () => { state.shop = 'another-shop.myshopify.com'; await reviews.action(args('/app/reviews', new URLSearchParams({intent: 'bulk_reject', reviewId: review.id}))); assert.equal((await db.review.findUnique({where: {id: review.id}})).status, 'APPROVED'); state.shop = review.shop; });
  state.payload = {customer: {email}};
  state.storageDeleteOk = false;
  await check('customer redaction retries when object storage deletion fails', async () => { let failure; try { const response = await customerRedact.action(args('/webhooks/customers/redact', '{}')); if (response.status >= 500) failure = response; } catch (e) { failure = e; } assert.ok(failure, 'must signal a retryable failure'); assert.ok(await db.review.findUnique({where: {id: review.id}}), 'must retain storage references until deletion succeeds'); });
  state.storageDeleteOk = true;
  await customerRedact.action(args('/webhooks/customers/redact', '{}'));
  await check('customer redaction also removes stored privacy exports', async () => { assert.equal(await db.review.count({where: {reviewerEmail: email}}), 0); assert.equal(await db.privacyRequest.count({where: {customerEmail: email}}), 0); });
  const remaining = await db.review.create({data: {shop: state.shop, productId: 'qa-product', rating: 4, body: 'Shop redaction QA', reviewerName: 'Shop QA', media: {create: {type: 'VIDEO', storageKey: 'reviews/qa-isolated/fixture.mp4'}}}});
  state.storageDeleteOk = false;
  await check('shop redaction retries when object storage deletion fails', async () => { let failure; try { const response = await shopRedact.action(args('/webhooks/shop/redact', '{}')); if (response.status >= 500) failure = response; } catch (e) { failure = e; } assert.ok(failure, 'must signal a retryable failure'); assert.ok(await db.review.findUnique({where: {id: remaining.id}})); });
  state.storageDeleteOk = true;
  await shopRedact.action(args('/webhooks/shop/redact', '{}'));
  await check('shop redaction removes review and settings data', async () => { assert.equal(await db.review.count({where: {shop: state.shop}}), 0); assert.equal(await db.privacyRequest.count({where: {shop: state.shop}}), 0); });
  console.log(`${checkCount - failures.length}/${checkCount} checks passed. Authentication is stubbed; all data is isolated from dev.sqlite.`);
} finally { await server.close(); await db.$disconnect(); rmSync(qaDir, {recursive: true, force: true}); delete globalThis.__vibeproofQA; }
if (failures.length) process.exitCode = 1;
