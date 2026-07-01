// ============================================================================
// FishPin Chatbot — unit / behaviour test harness
// ----------------------------------------------------------------------------
// Runs multiple multi-turn conversations against the LIVE webhook and asserts on
// the bot's behaviour: memory recall (incl. rolling summary over long chats),
// smart escalation, off-topic redirects, identity, accuracy, reasoning, Tagalog.
//
// Run:   node test.js
// Env:   FISHPIN_WEBHOOK (override URL), TEST_DELAY_MS (gap between turns)
//
// Each conversation uses its own sessionId so memory is isolated. Turns run in
// order with a small delay so each n8n execution (incl. the post-response
// summarizer) finishes persisting before the next turn — mirrors a real user.
// ============================================================================

const WEBHOOK = process.env.FISHPIN_WEBHOOK || 'https://n8n.srv1193790.hstgr.cloud/webhook/chat-fishpin';
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
    if (attempt < 3) {
      await sleep(1500 * attempt); // transient network blip — back off and retry
      return send(message, sessionId, attempt + 1);
    }
    throw e;
  }
}

// ---- assertion builders: each returns { desc, fn(reply) -> bool } ----
const contains = (sub) => ({ desc: `contains "${sub}"`, fn: (r) => lc(r.reply).includes(lc(sub)) });
const containsAny = (subs) => ({ desc: `mentions any of [${subs.join(', ')}]`, fn: (r) => subs.some((s) => lc(r.reply).includes(lc(s))) });
const escalateIs = (v) => ({ desc: `escalate == ${v}`, fn: (r) => Boolean(r.escalate) === v });
const NO_MEMORY_PHRASES = [
  "can't remember", 'cannot remember', "don't have the ability", 'do not have the ability',
  "don't have access", 'as an ai', "i'm just a virtual", 'i am just a virtual', 'no ability to remember',
  'unable to remember', "don't retain", 'do not retain',
];
const soundsHuman = () => ({ desc: 'does not give a robotic memory/AI disclaimer', fn: (r) => !NO_MEMORY_PHRASES.some((p) => lc(r.reply).includes(p)) });

// ---- scenarios ----
const scenarios = [
  {
    key: 'memory-basic',
    title: 'Remembers name within a short chat',
    steps: [
      { msg: "Hi, I'm Mang Tonyo, a fisherman from Palawan.", checks: [escalateIs(false), soundsHuman()] },
      { msg: 'How much does the app cost?', checks: [contains('499'), escalateIs(false)] },
      { msg: "What's my name again?", checks: [contains('Tonyo'), soundsHuman(), escalateIs(false)] },
    ],
  },
  {
    key: 'memory-long',
    title: 'Rolling summary: still remembers after a long conversation',
    steps: [
      { msg: 'Hello! My name is Robert, I am from Cebu and I fish at night.', checks: [escalateIs(false)] },
      { msg: 'Does FishPin work without internet?', checks: [escalateIs(false)] },
      { msg: 'Tell me about the emergency SOS.', checks: [escalateIs(false)] },
      { msg: 'How does the AI fish scanner work?', checks: [escalateIs(false)] },
      { msg: 'Is there a Philippine species guide?', checks: [escalateIs(false)] },
      { msg: 'What about weather and marine conditions?', checks: [escalateIs(false)] },
      { msg: 'Explain the fishing score.', checks: [escalateIs(false)] },
      { msg: 'Do you have nautical charts with depth?', checks: [escalateIs(false)] },
      { msg: 'Can I plan a route with an ETA?', checks: [escalateIs(false)] },
      { msg: 'How much does it cost again?', checks: [contains('499')] },
      { msg: 'By the way, do you still remember my name and where I am from?', checks: [contains('Robert'), contains('Cebu'), soundsHuman(), escalateIs(false)] },
    ],
  },
  {
    key: 'pronoun-followup',
    title: 'Resolves pronouns from prior turn',
    steps: [
      { msg: 'Tell me about the fishing score.', checks: [containsAny(['score', '0 to 100', '0-100']), escalateIs(false)] },
      { msg: 'What data does it use?', checks: [containsAny(['weather', 'wind', 'pressure', 'visibility']), escalateIs(false)] },
    ],
  },
  {
    key: 'reasoning-empathy',
    title: 'Reasons about the user situation and stays warm',
    steps: [
      { msg: 'I fish alone at night far from shore. Is this app good for someone like me?', checks: [containsAny(['sos', 'safety', 'offline', 'trail', 'gps']), escalateIs(false), soundsHuman()] },
    ],
  },
  {
    key: 'identity',
    title: 'Knows who it is',
    steps: [
      { msg: 'Who are you exactly?', checks: [contains('fishpin'), escalateIs(false), soundsHuman()] },
      { msg: 'What can you help me with?', checks: [containsAny(['price', 'feature', 'download', 'offline', 'navigation']), escalateIs(false)] },
    ],
  },
  {
    key: 'off-topic',
    title: 'Politely redirects off-topic without escalating',
    steps: [
      { msg: 'Write me a poem about the moon.', checks: [contains('fishpin'), escalateIs(false)] },
      { msg: 'What is the capital of France?', checks: [escalateIs(false)] },
    ],
  },
  {
    key: 'escalation',
    title: 'Escalates a genuine support issue — but answers warmly first',
    steps: [
      { msg: 'I paid on Google Play but the download keeps failing and I have no app.', checks: [escalateIs(true), contains('@'), soundsHuman()] },
    ],
  },
  {
    key: 'handoff-investor',
    title: 'Investor/partnership: helpful reply THEN hand-off (not a cold deflection)',
    steps: [
      { msg: 'Is FishPin open for investors?', checks: [escalateIs(true), containsAny(['invest', 'partner', 'sponsor', 'cooperative', 'ngo', 'lgu']), contains('@'), soundsHuman()] },
    ],
  },
  {
    key: 'accuracy-pricing',
    title: 'Accurate, grounded pricing (no hallucination)',
    steps: [
      { msg: 'Is there a monthly subscription or recurring fee?', checks: [containsAny(['one-time', 'no subscription', 'once', '499']), escalateIs(false)] },
    ],
  },
  {
    key: 'tagalog',
    title: 'Answers in Tagalog',
    steps: [
      { msg: 'Magkano po ang FishPin at may bayad po ba buwan-buwan?', checks: [contains('499'), escalateIs(false)] },
    ],
  },
];

async function run() {
  console.log(`\nFishPin chatbot tests → ${WEBHOOK}\n`);
  let passed = 0, failed = 0;
  const failures = [];

  for (const sc of scenarios) {
    const sid = `test-${RUN}-${sc.key}`;
    console.log(`\n■ ${sc.title}  (session ${sid})`);
    for (let i = 0; i < sc.steps.length; i++) {
      const step = sc.steps[i];
      let reply;
      try {
        reply = await send(step.msg, sid);
      } catch (e) {
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
  if (failures.length) {
    console.log(`\nFailed checks:`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log('');
  process.exit(failed ? 1 : 0);
}

run();
