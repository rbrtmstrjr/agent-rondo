// FishPin Video Ads — offline unit tests. No dependencies.
// Run:  node test.js              (all)
//       node test.js --only=script
const path = require('path');
const fs = require('fs');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';

let pass = 0, fail = 0; const fails = [];
const PENDING = [];
const defer = (label, p) => PENDING.push(Promise.resolve(p).catch((e) => check(label + ' threw: ' + e.message, false)));
const check = (name, cond) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ ' + name); }
};
const section = (tag, title, fn) => {
  if (ONLY && ONLY !== tag) return;
  console.log('\n■ ' + title);
  fn();
};
const L = (f) => require(path.join(__dirname, 'lib', f));
const L06 = (f) => require(path.join(__dirname, '..', '06-fishpin-fb-ads', 'lib', f));

// ---------------------------------------------------------------- script
section('script', 'Script validation', () => {
  const S = L('script-rules.js');
  const B = L06('brand.js');
  const C = L06('copy-rules.js');
  const OPTS = { checkProse: C.checkProse, bannedWords: B.BANNED_WORDS, competitors: B.COMPETITORS,
    pillars: Object.keys(B.PILLARS), priorVideos: [] };

  const good = {
    pillar: 'safety',
    topic: 'Finding the way home when fog and night come',
    hook: 'Nawala ang signal, gabi na sa laot',
    voiceover: 'Gabi na, makapal ang ulap, at nawala ang signal sa laot. Kinakabahan ka, di ba? '
      + 'Nasa bahay ang pamilya, naghihintay. Sa FishPin, alam mo pa rin kung nasaan ka, kahit walang '
      + 'internet. Naka-save ang iyong daan pauwi, at ang compass ay nagtuturo sa uwian. Mas panatag '
      + 'ang biyahe, mas panatag ang pamilya. I-download na po.',
    description: 'Nawala ang signal sa laot at gabi na? Huwag mag-alala.\n\nSa FishPin, alam mo pa rin '
      + 'kung nasaan ka at ang daan pauwi, kahit walang internet. Para sa mas panatag na biyahe.',
    hashtags: ['#FishPin', '#Mangingisda', '#KaligtasanSaLaot'],
    scenes: [
      { beat: 'hook', type: 'veo', seconds: 3, prompt: 'Fog rolls over a bangka at dusk, the fisherman looks up.' },
      { beat: 'stakes', type: 'image', seconds: 2.5, prompt: 'Dark sea, no shoreline visible, a single lantern.' },
      { beat: 'stakes', type: 'image', seconds: 2.5, prompt: 'A mother at a doorway looking out to sea at night.' },
      { beat: 'demo', type: 'screen', seconds: 4, screen: 'navigate' },
      { beat: 'demo', type: 'screen', seconds: 4, screen: 'offline' },
      { beat: 'relief', type: 'image', seconds: 5, prompt: 'The bangka reaches the shore at dawn, family waving.' },
    ],
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const w = (mut) => { const s = clone(good); mut(s); return s; };
  const rejects = (name, s, rx, opts) => {
    const r = S.validateScript(s, opts || OPTS);
    check(name, r.valid === false && r.reasons.some((x) => rx.test(x)));
    if (!(r.valid === false && r.reasons.some((x) => rx.test(x)))) console.log('     got: ' + JSON.stringify(r.reasons));
  };
  const words = (n) => Array.from({ length: n }, () => 'salita').join(' ');

  const g = S.validateScript(good, OPTS);
  check('accepts the clean script', g.valid === true);
  check('clean script has no reasons', g.reasons.length === 0);
  if (g.reasons.length) console.log('     got: ' + JSON.stringify(g.reasons));

  rejects('rejects when prose rules are not wired', good, /prose rules/, Object.assign({}, OPTS, { checkProse: undefined }));
  rejects('rejects the social proof pillar', w((s) => { s.pillar = 'social proof'; }), /social proof/);
  rejects('rejects an unknown pillar', w((s) => { s.pillar = 'giveaway'; }), /pillar/);
  rejects('rejects an empty topic', w((s) => { s.topic = ' '; }), /topic/);
  rejects('rejects a 9-word hook', w((s) => { s.hook = words(9); }), /hook/);
  rejects('rejects a 44-word voiceover', w((s) => { s.voiceover = words(44); }), /voiceover/);
  rejects('rejects a 71-word voiceover', w((s) => { s.voiceover = words(71); }), /voiceover/);
  rejects('rejects a 19-word description', w((s) => { s.description = words(19); }), /description/);
  rejects('rejects a 3-paragraph description',
    w((s) => { s.description = words(8) + '\n\n' + words(8) + '\n\n' + words(8); }), /paragraph/);
  rejects('rejects a link in the description', w((s) => { s.description += ' www.fishpin.app'; }), /link/);
  rejects('rejects a hashtag in the description', w((s) => { s.description += ' #FishPin'; }), /hashtag/);
  rejects('rejects 2 hashtags', w((s) => { s.hashtags = ['#a', '#b']; }), /hashtags/);
  rejects('rejects 4 scenes', w((s) => { s.scenes = s.scenes.slice(0, 4); }), /scenes/);
  rejects('rejects 7 scenes', w((s) => { s.scenes.push({ beat: 'relief', type: 'image', seconds: 1, prompt: 'x' }); }), /scenes/);
  rejects('rejects a first scene that is not the Veo hook', w((s) => { s.scenes[0].type = 'image'; }), /first scene/);
  rejects('rejects two Veo scenes', w((s) => { s.scenes[1].type = 'veo'; }), /exactly one/);
  rejects('rejects an unknown screen id', w((s) => { s.scenes[3].screen = 'sos'; }), /screen/);
  rejects('rejects the sign-in screen', w((s) => { s.scenes[3].screen = 'signin'; }), /screen/);
  rejects('rejects zero screen scenes',
    w((s) => { s.scenes[3] = { beat: 'demo', type: 'image', seconds: 4, prompt: 'x' };
      s.scenes[4] = { beat: 'demo', type: 'image', seconds: 4, prompt: 'y' }; }), /screen/);
  rejects('rejects three screen scenes', w((s) => { s.scenes[5] = { beat: 'relief', type: 'screen', seconds: 5, screen: 'smarter' }; }), /screen/);
  rejects('rejects an image scene without a prompt', w((s) => { s.scenes[1].prompt = ''; }), /prompt/);
  rejects('rejects an unknown beat', w((s) => { s.scenes[1].beat = 'cta'; }), /beat/);
  rejects('rejects zero seconds', w((s) => { s.scenes[1].seconds = 0; }), /seconds/);
  rejects('rejects a 17s plan', w((s) => { s.scenes[5].seconds = 1; }), /planned/);
  rejects('rejects a 29s plan', w((s) => { s.scenes[5].seconds = 13; }), /planned/);
  rejects('rejects an em dash in the voiceover', w((s) => { s.voiceover = s.voiceover.replace('Kinakabahan ka,', 'Kinakabahan ka —'); }), /Em dash found in voiceover/);
  rejects('rejects a price in the description', w((s) => { s.description = s.description.replace('Para sa', 'Halagang P999 lang, para sa'); }), /price/);
  rejects('rejects an exact repeat of a published hook', good, /already been published/,
    Object.assign({}, OPTS, { priorVideos: [{ hook: good.hook, voiceover: 'other' }] }));
  rejects('rejects a whitespace/case variant of a published voiceover', good, /already been published/,
    Object.assign({}, OPTS, { priorVideos: [{ hook: 'other', voiceover: '  ' + good.voiceover.toUpperCase() + ' ' }] }));
  check('allows a near-duplicate hook (exact-match rule only)',
    S.validateScript(good, Object.assign({}, OPTS, { priorVideos: [{ hook: good.hook + ' po', voiceover: 'other' }] })).valid === true);

  check('screen allowlist is exactly the six approved ids',
    JSON.stringify(S.SCREEN_IDS) === JSON.stringify(['offline', 'spots', 'path', 'navigate', 'dashboard', 'smarter']));
  check('screen allowlist excludes the sign-in screen', S.SCREEN_IDS.indexOf('signin') === -1 && S.SCREEN_IDS.indexOf('onboarding6') === -1);
});

// ---------------------------------------------------------------- results
Promise.all(PENDING).then(() => {
  console.log('\n' + '─'.repeat(40));
  console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
  if (fails.length) console.log('Failed: ' + fails.join('; '));
  process.exit(fail ? 1 : 0);
});
