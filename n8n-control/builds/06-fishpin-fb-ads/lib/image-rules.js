// ============================================================================
// Image prompt construction and response validation.
// The headline is rendered BY the image model (owner decision, 2026-09-10),
// so the prompt carries the exact string and strict spelling instructions.
// Garbled text is caught by the human approval gate, not by code.
// Pure: no n8n globals, no requires.
// ============================================================================

// The owner's verdict on the first live images was "the generated image doesnt
// have a branded feels in our venture". The direction chosen: keep the
// documentary photography of Filipino fishermen and bangkas, but colour grade
// it hard to the FishPin palette and composite the real logo in.
//
// So this is no longer a mood ("deep navy and warm gold"), which the model was
// free to interpret as any blue and any yellow. It is a named, hex-specified
// grade with a "nothing else competes" rule, lifted from the FishPin app's own
// brand spec (see assets/BRAND.md).
const PALETTE = [
  { name: 'Persian Blue', hex: '#0A2461', use: 'the dominant dark: deep sea, hull shadow, and the shadow end of the whole grade' },
  { name: 'Accent Blue', hex: '#147DFF', use: 'the one saturated blue: water highlights and sky reflection' },
  { name: 'Amber', hex: '#FFC857', use: 'the single warm accent: sunrise or sunset light, lantern glow, skin highlight' },
  { name: 'Off White', hex: '#EEF4FB', use: 'the light end of the grade: foam, cloud, and highlight detail' },
];

const STYLE_SUFFIX = 'documentary photography of Filipino fishermen and their bangkas, '
  + 'real Philippine coastal light, photographic and not illustrated, not glossy stock photography. '
  + 'Colour grade the photograph deliberately to the FishPin brand palette, exactly these four colours: '
  + PALETTE.map((p) => p.name + ' ' + p.hex + ' as ' + p.use).join('; ') + '. '
  + 'No other hue competes with these four: push every stray green, teal, magenta or red in the scene '
  + 'towards the nearest of them, and keep the grade consistent across the whole image. '
  + 'Feel: reliable, calm, resilient, observant, local and steady. Never dramatic, heroic, or pitying. '
  + 'Single clear subject, generous negative space in the upper third';

// The FishPin logo is supplied to the model as an attached reference image
// (an inline_data part ahead of the text part, the same request shape proven in
// builds/brand-photoshoot-variations). This instruction is what tells the model
// what that attachment IS and what to do with it -- without it the model treats
// a leading image as a style reference and repaints the whole scene from it.
// REVISED 2026-09-11 (owner): the mark alone became a LOCKUP, and it moved to
// the bottom LEFT. The lockup is the mark, then the wordmark "FishPin", with
// the website set smaller directly beneath it -- the same composition as the
// web app's own Logo component (fishpin-web/components/ui/Logo.tsx: the icon,
// then "Fish" in medium and "Pin" in extra-bold, on one line).
//
// There is NO wordmark asset on disk: the web component composes icon + live
// text in code, so the model has to draw the words itself. The mark is still
// reproduced from the attached reference PNG (that part is proven to work);
// only the wordmark and the url are newly drawn text. The model has already
// rendered a flawless Tagalog headline into these images, so asking it for two
// short Latin-script strings is the same job it is already doing -- but it is
// still generation, not compositing, so a mangled wordmark is possible and the
// human approval gate is what catches it (see README, Known limitations).
//
// The website url arrives as an argument, from Config.websiteUrl, so it is
// never hardcoded here and never drifts from the url the caption must carry.
function logoInstruction(websiteUrl) {
  const site = String(websiteUrl || '').trim();
  return [
    'BRAND LOCKUP. The attached PNG is the FishPin logo mark, a blue rounded square with a white '
      + 'fin-and-waves mark. Composite it into the BOTTOM LEFT corner of the picture, unaltered, '
      + 'with a clear margin from both edges and over a calm part of the picture so it stays legible.',
    'The lockup reads left to right on one line: first the attached mark, reproduced pixel for pixel '
      + 'exactly as supplied, about 7 to 9 percent of the image width; then a small gap; then the '
      + 'wordmark "FishPin" as newly drawn text in a clean bold sans-serif, optically the same height '
      + 'as the mark and vertically centred against it. Spell it FishPin: one word, capital F, '
      + 'capital P, no space, no other lettering.',
    site
      ? 'Directly beneath the lockup, left aligned with the mark, set the website "' + site + '" in '
        + 'the same sans-serif at a noticeably smaller size, roughly half the height of the wordmark. '
        + 'Spell it character for character, nothing added and nothing dropped.'
      : '',
    'Keep the whole lockup small and unobtrusive: a signature in the corner, never a banner. It must '
      + 'not compete with the headline, must not sit on the main subject, and must not be enlarged to '
      + 'fill the corner.',
    'Only the wordmark and the website line are newly drawn text. The mark itself comes from the '
      + 'attached image and stays unaltered in shape and colour: do not invent, redraw, recreate, '
      + 'redesign, recolour, rotate or crop it, and do not use it as a style reference for the rest '
      + 'of the picture.',
  ].filter(Boolean).join(' ');
}

const NEGATIVES = [
  // 'no logo' used to be here. It is gone because the brand logo is now
  // deliberately composited in (see LOGO_INSTRUCTION); the replacement below
  // still bans every OTHER logo and watermark, which is what that rule was for.
  'no watermark and no logo other than the supplied FishPin logo',
  'no app screenshot', 'no user interface', 'no extra fingers',
  'no deformed hands', 'no western yacht', 'no western fishing rods on a commercial bangka',
  'no impossible boat shapes', 'no exaggerated poverty imagery', 'no comedic or pitiful framing',
  'no imagery that reads as a real distress event or a real accident', 'no floating objects',
];

function aspectFor(pillar) {
  return String(pillar || '').toLowerCase() === 'fish fact' ? '1:1' : '4:5';
}

// The copy model returns 1 to 5 image prompts (copy-rules.js enforces that
// range before anything gets here). This is the defensive read used by the
// n8n glue: blanks dropped, hard-capped at 5 so a validator change can never
// turn into 20 Gemini image calls and 20 Facebook uploads.
function promptsOf(copy) {
  const c = copy || {};
  const list = Array.isArray(c.image_prompts) ? c.image_prompts : [];
  return list.map((p) => String(p == null ? '' : p).trim()).filter(Boolean).slice(0, 5);
}

// Builds the prompt for ONE image of the set. `index` is 0-based, `total` is
// how many images the post will carry.
//
// Only the FIRST image renders the headline. Repeating the same headline
// across five album frames looks like five rejected drafts of one poster, not
// a photo essay, and every extra rendered word is another chance for the model
// to garble Tagalog. So image 1 is the cover and carries the headline exactly
// as before; images 2..N are explicitly told to carry no text at all.
function buildImagePrompt(copy, pillar, index, total, opts) {
  const c = copy || {};
  const o = opts || {};
  const headline = String(c.headline || '').trim();
  const prompts = promptsOf(c);
  const n = Number(total || prompts.length || 1);
  const i = Number(index || 0);
  const scene = prompts[i] || prompts[0] || '';
  const isCover = i === 0;

  const lines = [scene, ''];

  if (n > 1) {
    lines.push(
      'This is image ' + (i + 1) + ' of ' + n + ' in one Facebook post. The ' + n + ' images tell '
        + 'one story in order, photographed on the same trip, with the same people, boat, clothing '
        + 'and time of day. This frame must clearly move that story on from the previous one.',
      ''
    );
  }

  if (isCover) {
    lines.push(
      'Render this exact headline text into the reserved negative space, character for character, '
        + 'spelled exactly as written, on one or two lines, in a bold clean sans-serif with high contrast '
        + 'against the background: "' + headline + '"',
      'Apart from that headline and the brand lockup described below, do not add, translate, '
        + 'correct, or invent any other text anywhere in the image.'
    );
  } else {
    lines.push(
      'Render NO text in this image except the brand lockup described below. No headline, no '
        + 'caption, no lettering, no numbers, no signage. The headline appears on the first image '
        + 'of the set only; this one is photograph plus the corner lockup.'
    );
  }

  lines.push(
    '',
    logoInstruction(o.websiteUrl),
    '',
    'Style: ' + STYLE_SUFFIX + '.',
    'Composition: ' + (aspectFor(pillar) === '1:1' ? 'square framing' : 'vertical 4:5 framing') + '.',
    'Avoid: ' + NEGATIVES.join(', ') + '.'
  );
  return lines.join('\n');
}

function readImageSize(buf) {
  if (!buf || buf.length < 24) return null;
  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
  }
  // JPEG: walk the marker segments to the first SOF (0xC0-0xCF, excluding C4/C8/CC)
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), type: 'jpeg' };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  // WebP: 'RIFF' .... 'WEBP', then a FourCC-specific chunk carries the dimensions.
  // Guard every read with a length check and return null on anything short or
  // malformed, same as the PNG and JPEG paths above -- never throw.
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8 ') {
      if (buf.length < 30 || buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
      return { width: buf.readUInt16LE(26) & 0x3FFF, height: buf.readUInt16LE(28) & 0x3FFF, type: 'webp' };
    }
    if (fourcc === 'VP8L') {
      if (buf.length < 25 || buf[20] !== 0x2f) return null;
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3FFF) + 1, height: ((b >> 14) & 0x3FFF) + 1, type: 'webp' };
    }
    if (fourcc === 'VP8X') {
      if (buf.length < 30) return null;
      const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
      const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
      return { width, height, type: 'webp' };
    }
    return null;
  }
  return null;
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

// Spec §16 item 1: verify whether the model honoured
// generationConfig.imageConfig.aspectRatio. Per spec §7 this is an
// OBSERVATION, never a rejection — a mismatched aspect still publishes, it is
// just recorded (in validateImage's output and in the Attempts tab) so the
// question "does this model honour aspectRatio?" can be answered from real
// runs instead of assumed. Returns:
//   true  — requested and observed agree
//   false — they disagree
//   null  — no request was made, or the dimensions were unreadable
function compareAspect(observed, requested) {
  const req = String(requested || '').trim();
  if (!req || !observed || observed === 'unknown') return null;
  return observed === req;
}

function validateImage(input, opts) {
  const o = opts || {};
  const minBytes = o.minBytes || 20480;
  const aspectRequested = String(o.aspectRequested || '');
  const reasons = [];
  const b64 = String((input && input.b64) || '');
  const mime = String((input && input.mime) || '').toLowerCase();

  if (!b64) {
    return {
      valid: false, reasons: ['No image returned by the model.'], bytes: 0, width: 0, height: 0,
      aspect: 'unknown', aspectRequested, aspectMatches: null,
    };
  }
  if (!/^image\/(png|jpe?g|webp)$/.test(mime)) reasons.push('Unexpected mime type: ' + (mime || 'none'));

  const buf = Buffer.from(b64, 'base64');
  if (buf.length < minBytes) reasons.push('Image too small (' + buf.length + ' bytes, minimum ' + minBytes + '). Likely a truncated or blank generation.');

  const size = readImageSize(buf);
  let aspect = 'unknown';
  if (size && size.width && size.height) {
    const g = gcd(size.width, size.height) || 1;
    aspect = (size.width / g) + ':' + (size.height / g);
  }

  return {
    valid: reasons.length === 0,
    reasons,
    bytes: buf.length,
    width: size ? size.width : 0,
    height: size ? size.height : 0,
    aspect,
    aspectRequested,
    // Deliberately NOT folded into `reasons`: an aspect mismatch is recorded,
    // not enforced (spec §7).
    aspectMatches: compareAspect(aspect, aspectRequested),
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    buildImagePrompt, aspectFor, promptsOf, readImageSize, validateImage, compareAspect,
    STYLE_SUFFIX, NEGATIVES, PALETTE, logoInstruction,
  };
}
