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
  }
  return null;
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

function validateImage(input, opts) {
  const o = opts || {};
  const minBytes = o.minBytes || 20480;
  const reasons = [];
  const b64 = String((input && input.b64) || '');
  const mime = String((input && input.mime) || '').toLowerCase();

  if (!b64) {
    return { valid: false, reasons: ['No image returned by the model.'], bytes: 0, width: 0, height: 0, aspect: 'unknown' };
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
  };
}

if (typeof module !== 'undefined') module.exports = { buildImagePrompt, aspectFor, readImageSize, validateImage, STYLE_SUFFIX, NEGATIVES };
