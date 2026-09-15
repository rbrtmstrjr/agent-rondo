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

// ---------------------------------------------------------------- plan
section('plan', 'Scene plan to render payload', () => {
  const P = L('scene-plan.js');
  const script = {
    voiceover: 'Gabi na, nawala ang signal.',
    scenes: [
      { beat: 'hook', type: 'veo', seconds: 3, prompt: 'fog' },
      { beat: 'stakes', type: 'image', seconds: 2.5, prompt: 'a' },
      { beat: 'stakes', type: 'image', seconds: 2.5, prompt: 'b' },
      { beat: 'demo', type: 'screen', seconds: 4, screen: 'navigate' },
      { beat: 'relief', type: 'image', seconds: 5, prompt: 'c' },
    ],
  };
  const assets = { voiceoverB64: 'VO', hookClipB64: 'CLIP', hookStillB64: 'STILL', imagesB64: ['I1', 'I2', 'I3'] };
  const cfg = { endCardCta: 'I-download sa Play Store', websiteUrl: 'www.fishpin.app', endCardSeconds: 3.5 };

  check('screen urls are all on www.fishpin.app',
    Object.keys(P.SCREEN_URLS).every((k) => P.SCREEN_URLS[k].indexOf('https://www.fishpin.app/') === 0));
  check('navigate is onboarding4', P.SCREEN_URLS.navigate === 'https://www.fishpin.app/images/onboarding/onboarding4.png');
  check('dashboard is features1', P.SCREEN_URLS.dashboard === 'https://www.fishpin.app/images/features/features1.jpg');
  check('no url points at onboarding6', !JSON.stringify(P.SCREEN_URLS).includes('onboarding6'));
  check('counts image scenes', P.imageSceneCount(script) === 3);

  const r = P.buildRenderPayload(script, assets, cfg);
  check('ok with complete assets', r.ok === true && r.reason === '');
  check('no fallback when the clip exists', r.hookFallback === false);
  check('payload is 1080x1920 at 30fps', r.payload.width === 1080 && r.payload.height === 1920 && r.payload.fps === 30);
  check('payload carries voiceover audio and script text', r.payload.audio_b64 === 'VO' && r.payload.script === script.voiceover);
  check('payload language is Tagalog', r.payload.language === 'tl');
  check('hook becomes a video scene with ambient sound',
    JSON.stringify(r.payload.scenes[0]) === JSON.stringify({ type: 'video', b64: 'CLIP', seconds: 3, ambient: true }));
  check('images keep script order', r.payload.scenes[1].b64 === 'I1' && r.payload.scenes[2].b64 === 'I2' && r.payload.scenes[4].b64 === 'I3');
  check('screen scene resolves its url',
    JSON.stringify(r.payload.scenes[3]) === JSON.stringify({ type: 'screen', url: P.SCREEN_URLS.navigate, seconds: 4 }));
  check('end card comes from cfg',
    JSON.stringify(r.payload.end_card) === JSON.stringify({ cta: 'I-download sa Play Store', url: 'www.fishpin.app', seconds: 3.5 }));

  const fb = P.buildRenderPayload(script, Object.assign({}, assets, { hookClipB64: '' }), cfg);
  check('missing clip falls back to the still', fb.ok === true && fb.hookFallback === true);
  check('fallback hook is a punched image of the still',
    JSON.stringify(fb.payload.scenes[0]) === JSON.stringify({ type: 'image', b64: 'STILL', seconds: 3, punch: true }));

  const noStill = P.buildRenderPayload(script, Object.assign({}, assets, { hookClipB64: '', hookStillB64: '' }), cfg);
  check('no clip and no still is not ok', noStill.ok === false && /hook/.test(noStill.reason) && noStill.payload === null);
  const short = P.buildRenderPayload(script, Object.assign({}, assets, { imagesB64: ['I1'] }), cfg);
  check('too few images is not ok', short.ok === false && /image/.test(short.reason));
  const badScreen = P.buildRenderPayload({ voiceover: 'x', scenes: [script.scenes[0], { beat: 'demo', type: 'screen', seconds: 4, screen: 'signin' }] },
    assets, cfg);
  check('unknown screen is not ok', badScreen.ok === false && /screen/.test(badScreen.reason));
  const noVo = P.buildRenderPayload(script, Object.assign({}, assets, { voiceoverB64: '' }), cfg);
  check('missing voiceover is not ok', noVo.ok === false && /voiceover/.test(noVo.reason));
});

// ---------------------------------------------------------------- prompt
section('prompt', 'Script prompts and generation requests', () => {
  const V = L('video-prompt.js');
  const S = L('script-rules.js');
  const B = L06('brand.js');
  const I = L06('image-rules.js');
  const voice = B.buildVoiceRules();

  const schema = V.buildScriptSchema(S.SCREEN_IDS, S.BEATS);
  check('schema requires all seven top-level fields',
    JSON.stringify(schema.required) === JSON.stringify(['pillar', 'topic', 'hook', 'voiceover', 'description', 'hashtags', 'scenes']));
  check('schema restricts screen to the allowlist',
    JSON.stringify(schema.properties.scenes.items.properties.screen.enum) === JSON.stringify(S.SCREEN_IDS));
  check('schema restricts scene type', JSON.stringify(schema.properties.scenes.items.properties.type.enum) === JSON.stringify(['veo', 'image', 'screen']));
  check('screen guide covers exactly the allowlist', JSON.stringify(Object.keys(V.SCREEN_GUIDE)) === JSON.stringify(S.SCREEN_IDS));

  const sys = V.buildScriptSystemPrompt(voice);
  check('system prompt includes the shared voice rules verbatim', sys.indexOf(voice) !== -1);
  check('system prompt states the length and scene rules',
    /8 words/.test(sys) && /45 to 70 words/.test(sys) && /first scene/i.test(sys) && /exactly one veo/i.test(sys) && /1 or 2 screen/i.test(sys));
  check('system prompt names every approved screen', S.SCREEN_IDS.every((id) => sys.indexOf('"' + id + '"') !== -1));
  check('system prompt forbids drawn app screens and text in images', /never draw an app screen/i.test(sys) && /no text/i.test(sys));
  check('system prompt forbids the social proof pillar', /social proof/i.test(sys));

  const withTopic = V.buildScriptUserPrompt({ topicInput: 'SOS feature for night fishing', pillars: Object.keys(B.PILLARS) });
  check('user prompt carries the typed topic', withTopic.indexOf('SOS feature for night fishing') !== -1);
  const noTopic = V.buildScriptUserPrompt({ topicInput: '', pillars: Object.keys(B.PILLARS) });
  check('blank topic lists pillars without social proof', /cost comparison/.test(noTopic) && !/social proof/.test(noTopic));
  const prior = Array.from({ length: 20 }, (_, i) => ({ hook: 'hook number ' + i, topic: 't' + i }));
  const withPrior = V.buildScriptUserPrompt({ topicInput: '', pillars: [], priorVideos: prior });
  check('prior videos are capped to the most recent 15',
    withPrior.indexOf('hook number 19') !== -1 && withPrior.indexOf('hook number 5') !== -1 && withPrior.indexOf('hook number 4') === -1);

  const still = V.buildStillRequest('A fisherman at dusk.', I.STYLE_SUFFIX, I.NEGATIVES);
  check('still is a 9:16 image request',
    still.generationConfig.imageConfig.aspectRatio === '9:16' && JSON.stringify(still.generationConfig.responseModalities) === '["IMAGE"]');
  const stillText = still.contents[0].parts[0].text;
  check('still prompt has no brand lockup instruction', !/BRAND LOCKUP/.test(stillText) && still.contents[0].parts.length === 1);
  check('still prompt forbids logos and text', /no logo/i.test(stillText) && /no text/i.test(stillText));
  check('video negatives drop the supplied-logo exception', V.videoNegatives(I.NEGATIVES).every((n) => !/FishPin logo/.test(n)));

  const veo = V.buildVeoRequest('B64', 'image/png', 'Fog rolls in.', { veoResolution: '1080p', veoSeconds: 6 });
  check('Veo request is 9:16, 1080p, 6 seconds, adults only',
    JSON.stringify(veo.parameters) === JSON.stringify({ aspectRatio: '9:16', resolution: '1080p', durationSeconds: '6', personGeneration: 'allow_adult' }));
  check('Veo request animates the still', veo.instances[0].image.inlineData.data === 'B64' && veo.instances[0].image.inlineData.mimeType === 'image/png');

  const tts = V.buildTtsRequest('Gabi na sa laot.', 'Gacrux');
  check('TTS request uses the voice and returns audio',
    tts.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === 'Gacrux'
      && JSON.stringify(tts.generationConfig.responseModalities) === '["AUDIO"]'
      && tts.contents[0].parts[0].text.indexOf('Gabi na sa laot.') !== -1);
});

// ---------------------------------------------------------------- sheet
section('sheet', 'Videos tab rules', () => {
  const V = L('video-sheet-rules.js');
  check('headers are exactly the 10 Videos columns in order', JSON.stringify(V.VIDEO_HEADERS) === JSON.stringify(
    ['id', 'created_at', 'topic_input', 'pillar', 'topic', 'hook', 'voiceover', 'status', 'video_url', 'est_cost_usd']));
  check('column letters', V.columnLetter(0) === 'A' && V.columnLetter(7) === 'H' && V.columnLetter(9) === 'J');

  const values = [V.VIDEO_HEADERS,
    ['VID-1', '', '', 'safety', 't1', 'h1', 'v1', 'delivered'],
    ['VID-2', '', '', 'safety', 't2', 'h2', 'v2', 'failed']];
  const rows = V.parseValues(values);
  check('parses rows with sheet row numbers', rows.length === 2 && rows[0]._rowNumber === 2 && rows[1].hook === 'h2');
  check('prior videos come only from delivered rows', JSON.stringify(V.collectPriorVideos(rows)) === JSON.stringify([{ hook: 'h1', voiceover: 'v1', topic: 't1' }]));
  const many = Array.from({ length: 20 }, (_, i) => ({ status: 'delivered', hook: 'h' + i, voiceover: 'v', topic: 't' }));
  const capped = V.collectPriorVideos(many);
  check('prior videos are capped to the most recent 15', capped.length === 15 && capped[0].hook === 'h5' && capped[14].hook === 'h19');

  const row = V.buildNewRow({ id: 'VID-9', createdAt: '2026-09-15T01:02:03Z', topicInput: 'SOS at night' });
  check('new row has 10 cells', row.length === 10);
  check('new row places id, time and topic input', row[0] === 'VID-9' && row[1] === '2026-09-15T01:02:03Z' && row[2] === 'SOS at night');
  check('new row starts generating', row[7] === 'generating');

  check('row number from an append range', V.rowNumberFromAppend({ updates: { updatedRange: 'Videos!A7:J7' } }) === 7);
  check('row number from a quoted tab name', V.rowNumberFromAppend({ updates: { updatedRange: "'Videos'!A12:J12" } }) === 12);
  check('row number is null when absent', V.rowNumberFromAppend({}) === null);

  const up = V.statusUpdate('Videos', 5, { video_url: 'https://files.slack.com/x', status: 'delivered', nonsense: 'x' });
  check('status update targets exact cells in header order', JSON.stringify(up) === JSON.stringify({ valueInputOption: 'RAW', data: [
    { range: 'Videos!H5', values: [['delivered']] }, { range: 'Videos!I5', values: [['https://files.slack.com/x']] }] }));
  check('video id format', V.newVideoId(new Date(Date.UTC(2026, 8, 15, 1, 2, 3))) === 'VID-20260915-010203');
  check('cost with a Veo hook and 4 images', V.estCost({ veoUsed: true, veoSeconds: 6, images: 4 }) === 0.65);
  check('cost after a Veo fallback', V.estCost({ veoUsed: false, veoSeconds: 6, images: 4 }) === 0.17);
});

// ---------------------------------------------------------------- results
Promise.all(PENDING).then(() => {
  console.log('\n' + '─'.repeat(40));
  console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
  if (fails.length) console.log('Failed: ' + fails.join('; '));
  process.exit(fail ? 1 : 0);
});
