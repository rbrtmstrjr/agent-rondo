// ============================================================================
// Script validation for the FishPin video ad. Deterministic, no model in the
// loop. The brand/compliance prose rules are build 06's checkProse, passed in
// through opts so this lib never requires another (build.js inlines libs).
// ============================================================================
const HOOK_MAX_WORDS = 8;
const VO_MIN_WORDS = 45;
const VO_MAX_WORDS = 70;
const DESC_MIN_WORDS = 20;
const DESC_MAX_WORDS = 60;
const DESC_MAX_PARAGRAPHS = 2;
const SCENES_MIN = 5;
const SCENES_MAX = 6;
const SCREEN_MIN = 1;
const SCREEN_MAX = 2;
const PLANNED_MIN_SECONDS = 18;
const PLANNED_MAX_SECONDS = 28;
// Real app screens published on fishpin.app. onboarding6 (Sign In) is never
// allowed: it carries placeholder text and says "Free", which is false.
const SCREEN_IDS = ['offline', 'spots', 'path', 'navigate', 'dashboard', 'smarter'];
const BEATS = ['hook', 'stakes', 'demo', 'relief'];
const SCENE_TYPES = ['veo', 'image', 'screen'];

// Not `wordCount`: build 06's copy-rules.js declares that at top level, and
// the Validate Script node inlines both libs into one body.
const scriptWordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const normalizeText = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
const paragraphsOf = (s) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim()
  .split(/\n[ \t]*\n+/).map((p) => p.trim()).filter(Boolean);
const plannedSeconds = (scenes) => (Array.isArray(scenes) ? scenes : [])
  .reduce((a, sc) => a + (Number(sc && sc.seconds) || 0), 0);

function validateScript(script, opts) {
  const s = script || {};
  const o = opts || {};
  const reasons = [];

  if (typeof o.checkProse !== 'function') {
    reasons.push('Internal: the prose rules (checkProse) are not wired in, so the script cannot be checked.');
  }

  const pillar = String(s.pillar || '').trim().toLowerCase();
  if (pillar === 'social proof') {
    reasons.push('The social proof pillar is never machine-generated: it needs a real screenshot or quote.');
  } else if (!pillar || (Array.isArray(o.pillars) && o.pillars.length && o.pillars.indexOf(pillar) === -1)) {
    reasons.push('pillar must be one of: ' + (o.pillars || []).filter((p) => p !== 'social proof').join(', '));
  }
  if (!String(s.topic || '').trim()) reasons.push('topic is empty.');

  const hookWords = scriptWordCount(s.hook);
  if (hookWords === 0 || hookWords > HOOK_MAX_WORDS) {
    reasons.push('hook is ' + hookWords + ' words, must be 1 to ' + HOOK_MAX_WORDS + '.');
  }
  const voWords = scriptWordCount(s.voiceover);
  if (voWords < VO_MIN_WORDS || voWords > VO_MAX_WORDS) {
    reasons.push('voiceover is ' + voWords + ' words, must be ' + VO_MIN_WORDS + ' to ' + VO_MAX_WORDS
      + ' so it fits a 22 to 25 second video.');
  }

  const desc = String(s.description || '');
  const descWords = scriptWordCount(desc);
  if (descWords < DESC_MIN_WORDS || descWords > DESC_MAX_WORDS) {
    reasons.push('description is ' + descWords + ' words, must be ' + DESC_MIN_WORDS + ' to ' + DESC_MAX_WORDS + '.');
  }
  const paras = paragraphsOf(desc).length;
  if (paras < 1 || paras > DESC_MAX_PARAGRAPHS) {
    reasons.push('description has ' + paras + ' paragraphs, must be 1 to ' + DESC_MAX_PARAGRAPHS + '.');
  }
  if (/https?:\/\/|www\./i.test(desc)) {
    reasons.push('description contains a link. The website and Play Store links are added automatically.');
  }
  if (/(^|[\s(\[])#[A-Za-z0-9_À-ɏ]/.test(desc)) {
    reasons.push('description contains a hashtag. Hashtags are added automatically.');
  }

  const tags = Array.isArray(s.hashtags) ? s.hashtags.filter((t) => String(t || '').trim()) : [];
  if (tags.length < 3 || tags.length > 5) reasons.push('hashtags must be 3 to 5 tags.');

  const scenes = Array.isArray(s.scenes) ? s.scenes : [];
  if (scenes.length < SCENES_MIN || scenes.length > SCENES_MAX) {
    reasons.push('scenes has ' + scenes.length + ' entries, must be ' + SCENES_MIN + ' to ' + SCENES_MAX + '.');
  }
  if (!scenes[0] || scenes[0].beat !== 'hook' || scenes[0].type !== 'veo') {
    reasons.push('The first scene must be the hook, of type veo.');
  }
  const veoCount = scenes.filter((sc) => sc && sc.type === 'veo').length;
  if (veoCount !== 1) reasons.push('There must be exactly one veo scene, found ' + veoCount + '.');
  const screenCount = scenes.filter((sc) => sc && sc.type === 'screen').length;
  if (screenCount < SCREEN_MIN || screenCount > SCREEN_MAX) {
    reasons.push('There must be ' + SCREEN_MIN + ' to ' + SCREEN_MAX + ' screen scenes, found ' + screenCount + '.');
  }
  scenes.forEach((sc, i) => {
    const n = i + 1;
    if (!sc || BEATS.indexOf(sc.beat) === -1) reasons.push('Scene ' + n + ' has an unknown beat; use one of ' + BEATS.join(', ') + '.');
    if (!sc || SCENE_TYPES.indexOf(sc.type) === -1) reasons.push('Scene ' + n + ' has an unknown type; use one of ' + SCENE_TYPES.join(', ') + '.');
    if (!sc || !(Number(sc.seconds) > 0)) reasons.push('Scene ' + n + ' needs seconds greater than 0.');
    if (sc && (sc.type === 'image' || sc.type === 'veo') && !String(sc.prompt || '').trim()) {
      reasons.push('Scene ' + n + ' (' + sc.type + ') needs a non-empty prompt.');
    }
    if (sc && sc.type === 'screen' && SCREEN_IDS.indexOf(sc.screen) === -1) {
      reasons.push('Scene ' + n + ' uses screen "' + sc.screen + '", which is not an approved app screen. Use one of '
        + SCREEN_IDS.join(', ') + '.');
    }
  });
  const planned = plannedSeconds(scenes);
  if (planned < PLANNED_MIN_SECONDS || planned > PLANNED_MAX_SECONDS) {
    reasons.push('The planned scene seconds add up to ' + planned + ', must be ' + PLANNED_MIN_SECONDS + ' to '
      + PLANNED_MAX_SECONDS + ' (the end card is added separately).');
  }

  if (typeof o.checkProse === 'function') {
    o.checkProse({ hook: s.hook, voiceover: s.voiceover, description: s.description },
      { bannedWords: o.bannedWords, competitors: o.competitors }).forEach((r) => reasons.push(r));
  }

  const prior = Array.isArray(o.priorVideos) ? o.priorVideos : [];
  const nh = normalizeText(s.hook);
  const nv = normalizeText(s.voiceover);
  if (nh && prior.some((p) => normalizeText(p && p.hook) === nh)) {
    reasons.push('This exact hook has already been published. Take a different angle and a different hook.');
  }
  if (nv && prior.some((p) => normalizeText(p && p.voiceover) === nv)) {
    reasons.push('This exact voiceover has already been published. Write a different angle.');
  }

  return { valid: reasons.length === 0, reasons };
}

if (typeof module !== 'undefined') {
  module.exports = {
    validateScript, normalizeText, plannedSeconds,
    HOOK_MAX_WORDS, VO_MIN_WORDS, VO_MAX_WORDS, DESC_MIN_WORDS, DESC_MAX_WORDS, DESC_MAX_PARAGRAPHS,
    SCENES_MIN, SCENES_MAX, SCREEN_MIN, SCREEN_MAX, PLANNED_MIN_SECONDS, PLANNED_MAX_SECONDS,
    SCREEN_IDS, BEATS, SCENE_TYPES,
  };
}
