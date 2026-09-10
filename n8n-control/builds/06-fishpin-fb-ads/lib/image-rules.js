// ============================================================================
// Image prompt construction and response validation.
// The headline is rendered BY the image model (owner decision, 2026-09-10),
// so the prompt carries the exact string and strict spelling instructions.
// Garbled text is caught by the human approval gate, not by code.
// Pure: no n8n globals, no requires.
// ============================================================================

const STYLE_SUFFIX = 'photographic, natural Philippine coastal light, documentary style, '
  + 'deep navy and warm gold palette, weathered wood and white foam accents, single clear subject, '
  + 'generous negative space in the upper third';

const NEGATIVES = [
  'no watermark', 'no logo', 'no app screenshot', 'no user interface', 'no extra fingers',
  'no deformed hands', 'no western yacht', 'no western fishing rods on a commercial bangka',
  'no impossible boat shapes', 'no exaggerated poverty imagery', 'no comedic or pitiful framing',
  'no imagery that reads as a real distress event or a real accident', 'no floating objects',
];

function aspectFor(pillar) {
  return String(pillar || '').toLowerCase() === 'fish fact' ? '1:1' : '4:5';
}

function buildImagePrompt(copy, pillar) {
  const c = copy || {};
  const headline = String(c.headline || '').trim();
  return [
    String(c.image_prompt || '').trim(),
    '',
    'Render this exact headline text into the reserved negative space, character for character, '
      + 'spelled exactly as written, on one or two lines, in a bold clean sans-serif with high contrast '
      + 'against the background: "' + headline + '"',
    'Do not add, translate, correct, or invent any other text anywhere in the image.',
    '',
    'Style: ' + STYLE_SUFFIX + '.',
    'Composition: ' + (aspectFor(pillar) === '1:1' ? 'square framing' : 'vertical 4:5 framing') + '.',
    'Avoid: ' + NEGATIVES.join(', ') + '.',
  ].join('\n');
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
    buildImagePrompt, aspectFor, readImageSize, validateImage, compareAspect, STYLE_SUFFIX, NEGATIVES,
  };
}
