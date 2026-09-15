// ============================================================================
// Scene plan -> /render-ad payload. Pure. Timing is scaled by the render
// service against the measured voiceover, not here, so there is one source of
// truth for durations.
// ============================================================================
const SCREEN_URLS = {
  offline: 'https://www.fishpin.app/images/onboarding/onboarding1.png',
  spots: 'https://www.fishpin.app/images/onboarding/onboarding2.png',
  path: 'https://www.fishpin.app/images/onboarding/onboarding3.png',
  navigate: 'https://www.fishpin.app/images/onboarding/onboarding4.png',
  dashboard: 'https://www.fishpin.app/images/features/features1.jpg',
  smarter: 'https://www.fishpin.app/images/onboarding/onboarding5.png',
};

const imageSceneCount = (script) => ((script && Array.isArray(script.scenes)) ? script.scenes : [])
  .filter((sc) => sc && sc.type === 'image').length;

function buildRenderPayload(script, assets, cfg) {
  const s = script || {};
  const a = assets || {};
  const c = cfg || {};
  const fail = (reason) => ({ ok: false, reason, hookFallback: false, payload: null });
  const scenesIn = Array.isArray(s.scenes) ? s.scenes : [];
  const images = Array.isArray(a.imagesB64) ? a.imagesB64 : [];

  if (!String(a.voiceoverB64 || '')) return fail('No voiceover audio was produced.');
  if (images.length < imageSceneCount(s)) {
    return fail('Expected ' + imageSceneCount(s) + ' image scenes but only ' + images.length + ' images were generated.');
  }

  let hookFallback = false;
  let k = 0;
  const scenes = [];
  for (let i = 0; i < scenesIn.length; i++) {
    const sc = scenesIn[i] || {};
    const seconds = Number(sc.seconds) || 0;
    if (sc.type === 'veo') {
      if (String(a.hookClipB64 || '')) {
        scenes.push({ type: 'video', b64: a.hookClipB64, seconds, ambient: true });
      } else if (String(a.hookStillB64 || '')) {
        hookFallback = true;
        scenes.push({ type: 'image', b64: a.hookStillB64, seconds, punch: true });
      } else {
        return fail('The hook has neither a Veo clip nor a still image.');
      }
    } else if (sc.type === 'image') {
      scenes.push({ type: 'image', b64: images[k++], seconds });
    } else if (sc.type === 'screen') {
      if (!Object.prototype.hasOwnProperty.call(SCREEN_URLS, sc.screen)) {
        return fail('Scene ' + (i + 1) + ' uses screen "' + sc.screen + '", which is not an approved app screen.');
      }
      scenes.push({ type: 'screen', url: SCREEN_URLS[sc.screen], seconds });
    } else {
      return fail('Scene ' + (i + 1) + ' has an unknown type "' + sc.type + '".');
    }
  }

  return {
    ok: true, reason: '', hookFallback,
    payload: {
      width: 1080, height: 1920, fps: 30,
      audio_b64: a.voiceoverB64,
      script: String(s.voiceover || ''),
      language: 'tl',
      scenes,
      end_card: { cta: String(c.endCardCta || ''), url: String(c.websiteUrl || ''), seconds: Number(c.endCardSeconds) || 3.5 },
    },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { SCREEN_URLS, imageSceneCount, buildRenderPayload };
}
