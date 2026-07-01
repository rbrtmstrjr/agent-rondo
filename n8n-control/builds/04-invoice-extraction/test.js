// ============================================================================
// Invoice Extraction — unit / behaviour test harness
// Posts sample invoice PDFs at the LIVE webhook and asserts: clean extraction +
// logging, DUPLICATE rejection, math-mismatch → Needs Review, and junk rejection.
//
// Run:  AIRTABLE_PAT=pat... node test.js
//   (AIRTABLE_PAT is only used to pre-clean test records so the run is deterministic;
//    base/table default to the Northwind Ops Invoices table.)
// ============================================================================

const fs = require('fs');
const path = require('path');

const WEBHOOK = process.env.INVOICE_WEBHOOK || 'https://n8n.srv1193790.hstgr.cloud/webhook/invoice-northwind';
const PAT = process.env.AIRTABLE_PAT || '';
const BASE = process.env.AIRTABLE_BASE || 'appug80MzHJWdeZNU';
const TABLE = process.env.AIRTABLE_TABLE || 'tbldFhqjuFOPJsD7G';
const SAMPLES = path.join(__dirname, 'samples');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postPdf(file) {
  const data = fs.readFileSync(path.join(SAMPLES, file)).toString('base64');
  const res = await fetch(WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file, mimeType: 'application/pdf', data }),
  });
  return res.json();
}

async function preClean(invoiceNumbers) {
  if (!PAT) return;
  const formula = 'OR(' + invoiceNumbers.map((n) => `{Invoice Number}="${n}"`).join(',') + ')';
  const url = 'https://api.airtable.com/v0/' + BASE + '/' + TABLE + '?maxRecords=50&filterByFormula=' + encodeURIComponent(formula);
  const r = await (await fetch(url, { headers: { Authorization: 'Bearer ' + PAT } })).json();
  for (const rec of (r.records || [])) {
    await fetch('https://api.airtable.com/v0/' + BASE + '/' + TABLE + '/' + rec.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + PAT } });
  }
}

let pass = 0, fail = 0; const fails = [];
const check = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; fails.push(name); console.log('  ✗ ' + name); } };

async function run() {
  console.log('Invoice extraction tests → ' + WEBHOOK + '\n');
  if (!PAT) console.log('(no AIRTABLE_PAT — skipping pre-clean; the duplicate test may be affected by prior data)\n');

  await preClean(['CHS-20418', 'PED-5592', 'RCPW-77310']);

  console.log('■ Extracts a clean invoice and logs it');
  const a = await postPdf('invoice-cascade-hvac.pdf');
  check('ok', a.ok === true);
  check('not flagged duplicate', a.duplicate === false);
  check('status OK', a.status === 'OK');
  check('vendor = Cascade', /cascade/i.test(a.vendor || ''));
  check('total ≈ 623', Math.abs((a.total || 0) - 623) < 1);
  await sleep(1500);

  console.log('\n■ Rejects the SAME invoice as a duplicate');
  const a2 = await postPdf('invoice-cascade-hvac.pdf');
  check('flagged duplicate', a2.duplicate === true);
  check('status Duplicate', a2.status === 'Duplicate');
  await sleep(1500);

  console.log('\n■ Flags a math-mismatch invoice for review');
  const c = await postPdf('invoice-pacific-electrical-ERROR.pdf');
  check('not duplicate', c.duplicate === false);
  check('status Needs Review', c.status === 'Needs Review');
  check('reason mentions total', (c.reasons || []).some((r) => /total/i.test(r)));
  await sleep(1500);

  console.log('\n■ Rejects junk (non-document) upload');
  const bad = await (await fetch(WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'note.txt', mimeType: 'text/plain', data: 'aGVsbG8=' }),
  })).json();
  check('ok = false', bad.ok === false);

  console.log('\n─────────────────────────');
  console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
  if (fails.length) console.log('Failed: ' + fails.join('; '));
  process.exit(fail ? 1 : 0);
}
run();
