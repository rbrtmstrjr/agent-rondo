// ============================================================================
// Northwind Support Chatbot — unit / behaviour test harness
// Runs multiple multi-turn conversations against the LIVE webhook and asserts on
// memory recall (incl. rolling summary), pronoun resolution, reasoning, identity,
// off-topic redirects, contextual hand-off, and pricing accuracy.
//
// Run:  node test.js     Env: NORTHWIND_WEBHOOK, TEST_DELAY_MS
// ============================================================================

const WEBHOOK = process.env.NORTHWIND_WEBHOOK || 'https://n8n.srv1193790.hstgr.cloud/webhook/chat-northwind';
const DELAY_MS = Number(process.env.TEST_DELAY_MS || 1600);
const RUN = Date.now().toString(36);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lc = (s) => String(s == null ? '' : s).toLowerCase();

async function send(message, sessionId, attempt = 1) {
  try {
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    if (attempt < 3) { await sleep(1500 * attempt); return send(message, sessionId, attempt + 1); }
    throw e;
  }
}

const contains = (sub) => ({ desc: `contains "${sub}"`, fn: (r) => lc(r.reply).includes(lc(sub)) });
const containsAny = (subs) => ({ desc: `mentions any of [${subs.join(', ')}]`, fn: (r) => subs.some((s) => lc(r.reply).includes(lc(s))) });
const escalateIs = (v) => ({ desc: `escalate == ${v}`, fn: (r) => Boolean(r.escalate) === v });
const NO_MEMORY_PHRASES = [
  "can't remember", 'cannot remember', "don't have the ability", 'do not have the ability',
  "don't have access", 'as an ai', "i'm just a virtual", 'i am just a virtual', 'no ability to remember',
  'unable to remember', "don't retain", 'do not retain',
];
const soundsHuman = () => ({ desc: 'no robotic memory/AI disclaimer', fn: (r) => !NO_MEMORY_PHRASES.some((p) => lc(r.reply).includes(p)) });

const scenarios = [
  {
    key: 'memory-basic', title: 'Remembers name within a short chat',
    steps: [
      { msg: "Hi, I'm Sarah and I live in Beaverton.", checks: [escalateIs(false), soundsHuman()] },
      { msg: 'What are your hours?', checks: [containsAny(['monday', '7', 'seven', 'emergency']), escalateIs(false)] },
      { msg: "What's my name again?", checks: [contains('Sarah'), soundsHuman(), escalateIs(false)] },
    ],
  },
  {
    key: 'memory-long', title: 'Rolling summary: still remembers after a long conversation',
    steps: [
      { msg: 'Hello, my name is David and I live in Tigard.', checks: [escalateIs(false)] },
      { msg: 'Do you service my area?', checks: [escalateIs(false)] },
      { msg: 'What HVAC services do you offer?', checks: [escalateIs(false)] },
      { msg: 'And plumbing?', checks: [escalateIs(false)] },
      { msg: 'Do you do electrical panel upgrades?', checks: [escalateIs(false)] },
      { msg: 'Tell me about the Care Club.', checks: [escalateIs(false)] },
      { msg: 'What is your warranty?', checks: [escalateIs(false)] },
      { msg: 'Do you offer financing?', checks: [escalateIs(false)] },
      { msg: 'How much is the diagnostic fee?', checks: [contains('89')] },
      { msg: 'By the way, do you still remember my name and city?', checks: [contains('David'), contains('Tigard'), soundsHuman(), escalateIs(false)] },
    ],
  },
  {
    key: 'pronoun-followup', title: 'Resolves pronouns from prior turn',
    steps: [
      { msg: 'Tell me about the Care Club membership.', checks: [containsAny(['care club', '19', 'member']), escalateIs(false)] },
      { msg: 'How much does it cost?', checks: [containsAny(['19', '199']), escalateIs(false)] },
    ],
  },
  {
    key: 'reasoning-empathy', title: 'Reasons about an urgent situation and stays warm',
    steps: [
      { msg: "It's freezing and my furnace just died tonight. What do I do?", checks: [containsAny(['emergency', '24/7', '24 hours', 'right away', 'urgent']), escalateIs(false), soundsHuman()] },
    ],
  },
  {
    key: 'identity', title: 'Knows who it is',
    steps: [
      { msg: 'Who are you exactly?', checks: [contains('northwind'), escalateIs(false), soundsHuman()] },
    ],
  },
  {
    key: 'off-topic', title: 'Politely redirects off-topic without handing off',
    steps: [
      { msg: 'Can you recommend a good pizza place nearby?', checks: [containsAny(['northwind', 'home', 'hvac', 'plumbing', 'electrical', 'comfortable']), escalateIs(false)] },
    ],
  },
  {
    key: 'handoff-billing', title: 'Billing dispute: helpful reply THEN hand-off',
    steps: [
      { msg: 'I think I was overcharged on my last invoice and I want a refund.', checks: [escalateIs(true), soundsHuman(), containsAny(['team', 'call', '555', 'sorry', 'look into', 'refund', 'billing'])] },
    ],
  },
  {
    key: 'accuracy-fee', title: 'Accurate, grounded fee (no hallucination)',
    steps: [
      { msg: 'How much is a service call to diagnose a problem?', checks: [contains('89'), escalateIs(false)] },
    ],
  },
];

async function run() {
  console.log(`\nNorthwind chatbot tests → ${WEBHOOK}\n`);
  let passed = 0, failed = 0;
  const failures = [];
  for (const sc of scenarios) {
    const sid = `test-${RUN}-${sc.key}`;
    console.log(`\n■ ${sc.title}  (session ${sid})`);
    for (let i = 0; i < sc.steps.length; i++) {
      const step = sc.steps[i];
      let reply;
      try { reply = await send(step.msg, sid); }
      catch (e) {
        console.log(`   ✗ [turn ${i + 1}] "${step.msg}" → request failed: ${e.message}`);
        failed += step.checks.length;
        step.checks.forEach((c) => failures.push(`${sc.key} t${i + 1}: ${c.desc} (request error)`));
        continue;
      }
      const shortReply = String(reply.reply || '').replace(/\s+/g, ' ').slice(0, 110);
      console.log(`   • [turn ${i + 1}] "${step.msg}"`);
      console.log(`     ↳ ${shortReply}${shortReply.length >= 110 ? '…' : ''}  ${reply.escalate ? '(escalated)' : ''}`);
      for (const c of step.checks) {
        let ok = false;
        try { ok = c.fn(reply); } catch (e) { ok = false; }
        if (ok) { passed++; console.log(`        ✓ ${c.desc}`); }
        else { failed++; console.log(`        ✗ ${c.desc}`); failures.push(`${sc.key} t${i + 1}: ${c.desc}`); }
      }
      await sleep(DELAY_MS);
    }
  }
  console.log(`\n──────────────────────────────────────────────`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed  (${scenarios.length} conversations)`);
  if (failures.length) { console.log(`\nFailed checks:`); failures.forEach((f) => console.log(`  - ${f}`)); }
  console.log('');
  process.exit(failed ? 1 : 0);
}

run();
