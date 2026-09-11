// ============================================================================
// Copy validation — deterministic, no model in the loop. Returns every reason
// a draft fails so the reviewer and the regeneration prompt both get specifics.
// Pure: no n8n globals, no requires. Shared constants arrive via opts.
//
// This file also owns buildPostMessage, the ONE place the published post is
// assembled (see below). The validator and the composer live together on
// purpose: the rules about what the caption may contain, and the code that
// adds everything the caption may NOT contain, have to agree.
// ============================================================================

// Acronyms fishermen actually read as words. Stripped before the all-caps check
// so "walang GPS SMS signal" is not mistaken for shouting.
const OK_ACRONYMS = ['GPS', 'SOS', 'SMS', 'ETA', 'AI', 'PH', 'PHP', 'WIFI', 'DITO', 'FISHPIN'];

const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// The caption band. The caption is PROSE ONLY now — the CTA, the two links and
// the hashtags are appended by buildPostMessage, in code, and none of them
// count towards this band. Before 2026-09-11 the two urls lived inside the
// caption and the ceiling was raised to 152 to stop a model being rejected for
// obeying the links rule; with the links moved out, the band is simply the
// prose band the prompt asks for.
const CAPTION_MIN_WORDS = 80;
const CAPTION_MAX_WORDS = 150;

// Caption shape. The first live post came out as one unbroken ~110-word block,
// which on a phone is a wall nobody scans. The caption must be 2 to 4 short
// paragraphs separated by a BLANK line, each of 1 to 3 sentences, with the
// hook (paragraph 1) shortest because Facebook hides everything past the first
// few lines behind "See more".
const CAPTION_MIN_PARAGRAPHS = 2;
const CAPTION_MAX_PARAGRAPHS = 4;
const PARAGRAPH_MAX_SENTENCES = 3;

// A paragraph break is a blank line: one or more newlines with nothing but
// whitespace between them. \r\n is handled too — a model (or a sheet round
// trip) can hand back Windows line endings, and a caption that is correctly
// shaped must not be rejected for its line endings. Leading/trailing blank
// lines produce no empty paragraphs.
const captionParagraphs = (s) => String(s == null ? '' : s)
  .replace(/\r\n?/g, '\n')
  .trim()
  .split(/\n[ \t]*\n+/)
  .map((p) => p.trim())
  .filter(Boolean);

// Sentence count, deliberately crude: a run of . ! ? … followed by whitespace
// or the end of the paragraph ends a sentence, and a trailing fragment with no
// terminator still counts as one. Good enough to tell a 1-to-3-sentence
// paragraph from a six-sentence block, which is the only judgement being made.
const sentenceCount = (s) => String(s == null ? '' : s)
  .split(/[.!?…]+(?=\s|$)/)
  .map((x) => x.trim())
  .filter(Boolean).length;

// Normalisation for the exact-repeat check: trim, collapse every whitespace run
// to one space, lowercase. Deliberately nothing more — no stemming, no
// similarity scoring. See rule 13.
const normalizeForRepeat = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

// ============================================================================
// buildPostMessage — the ONE place a published post is assembled.
//
// The model writes PROSE ONLY. Everything else is added here, deterministically,
// in exactly this order:
//
//     {caption}
//                                  <- blank line
//     {cta}
//                                  <- blank line
//     {websiteUrl}
//     {playStoreUrl}               <- consecutive lines, NO blank line between
//                                  <- blank line
//     {hashtags joined by a space}
//
// Both `Publish Post` (the Facebook /feed body) and `Post Preview` (what the
// reviewer sees in Slack) read the SAME computed string, so the reviewer
// approves character-for-character what gets published.
//
// Why this exists: the two used to build their own message in their own node
// expression, and the system prompt ALSO told the model to end the caption
// with the CTA and the links. The first real published post therefore carried
// the CTA twice — once from the model, once from Publish Post. Composition in
// one pure function is what makes that class of drift impossible.
function buildPostMessage(copy, cfg) {
  const c = copy || {};
  const o = cfg || {};
  const NL = String.fromCharCode(10);
  const blocks = [];

  const caption = String(c.caption == null ? '' : c.caption).trim();
  if (caption) blocks.push(caption);

  const cta = String(c.cta == null ? '' : c.cta).trim();
  if (cta) blocks.push(cta);

  // The two links come from Config (websiteUrl / playStoreUrl), never from a
  // lib constant, exactly as they reach the validator. Consecutive lines: they
  // are one block, not two.
  const links = [String(o.websiteUrl || '').trim(), String(o.playStoreUrl || '').trim()]
    .filter(Boolean);
  if (links.length) blocks.push(links.join(NL));

  const tags = (Array.isArray(c.hashtags) ? c.hashtags : [])
    .map((t) => String(t == null ? '' : t).trim())
    .filter(Boolean);
  if (tags.length) blocks.push(tags.join(' '));

  // A missing block never leaves a double blank line or a trailing newline.
  return blocks.join(NL + NL);
}

function validateCopy(copy, opts) {
  const o = opts || {};
  const banned = o.bannedWords || [];
  const competitors = o.competitors || [];
  const reasons = [];
  const c = copy || {};

  // 1. required fields
  ['headline', 'subhead', 'caption', 'cta', 'alt_text'].forEach((f) => {
    if (!String(c[f] || '').trim()) reasons.push('Missing or empty field: ' + f);
  });
  if (!Array.isArray(c.hashtags) || c.hashtags.length < 3 || c.hashtags.length > 5) {
    reasons.push('hashtags must be an array of 3 to 5 tags');
  }
  // 1b. image_prompts: the model chooses how many images the topic needs, and
  // every one of them becomes a real Gemini image call and a real Facebook
  // photo upload. An out-of-range count or a blank entry is caught here, before
  // any of that is spent: 0 entries would publish a post with no picture at
  // all, more than 5 exceeds what the album step is built and budgeted for, and
  // a blank entry would send the image model an empty scene and get back
  // whatever it felt like.
  if (!Array.isArray(c.image_prompts)) {
    reasons.push('image_prompts must be an array of 1 to 5 image descriptions, one per image');
  } else if (c.image_prompts.length < 1 || c.image_prompts.length > 5) {
    reasons.push('image_prompts has ' + c.image_prompts.length
      + ' entries, must be an array of 1 to 5 image descriptions');
  } else if (c.image_prompts.some((p) => !String(p == null ? '' : p).trim())) {
    reasons.push('image_prompts contains an empty entry. Every image in the set needs its own '
      + 'non-empty description, or drop it from the array.');
  }

  const textFields = { headline: c.headline, subhead: c.subhead, caption: c.caption, cta: c.cta };
  const all = Object.values(textFields).map((v) => String(v || '')).join('\n');
  const lower = all.toLowerCase();

  // 2. em dash
  Object.keys(textFields).forEach((f) => {
    if (/—/.test(String(textFields[f] || ''))) reasons.push('Em dash found in ' + f + '. Use a comma, colon, or parentheses.');
  });

  // 3. banned words
  banned.forEach((wRaw) => {
    const w = String(wRaw).toLowerCase();
    if (lower.includes(w)) reasons.push('Banned word or phrase: "' + wRaw + '"');
  });

  // 4. lengths
  if (wordCount(c.headline) > 7) reasons.push('headline is ' + wordCount(c.headline) + ' words, max is 7');
  if (wordCount(c.subhead) > 12) reasons.push('subhead is ' + wordCount(c.subhead) + ' words, max is 12');
  const capWords = wordCount(c.caption);
  if (capWords < CAPTION_MIN_WORDS || capWords > CAPTION_MAX_WORDS) {
    reasons.push('caption is ' + capWords + ' words, must be ' + CAPTION_MIN_WORDS + ' to '
      + CAPTION_MAX_WORDS + ' words of prose. The call to action, the two links and the '
      + 'hashtags are added automatically after the caption and do not count towards this.');
  }

  // 5. emoji budget
  const emoji = String(c.caption || '').match(/\p{Extended_Pictographic}/gu) || [];
  if (emoji.length > 3) reasons.push('caption has ' + emoji.length + ' emoji, max is 3');

  // 6. all-caps shouting (two or more consecutive caps words, acronyms excluded).
  // Scoped per field: a field-ending emphasis word followed by the next
  // field's own emphasis word must not read as one cross-field shouting run.
  Object.keys(textFields).forEach((f) => {
    let fieldScrubbed = String(textFields[f] || '');
    OK_ACRONYMS.forEach((a) => {
      fieldScrubbed = fieldScrubbed.replace(new RegExp('\\b' + a + '\\b', 'g'), '_');
    });
    if (/\b[A-Z]{2,}\b[^A-Za-z0-9]+\b[A-Z]{2,}\b/.test(fieldScrubbed)) {
      reasons.push('All caps run longer than one word in ' + f + '. Only a single word may be capitalised for emphasis.');
    }
  });

  // 7. compliance
  if (/hindi ka mamamatay|hindi ka malulunod|siguradong masasagip|will save your life|guaranteed rescue|guarantees rescue/i.test(all)) {
    reasons.push('Rescue guarantee. Phrase safety as "mas mabilis kang mahanap", never a promise of survival.');
  }
  if (/(safe to eat|ligtas kainin|pwedeng kainin)/i.test(all)
      && !/(generally considered safe to eat|karaniwang itinuturing na ligtas)/i.test(all)) {
    reasons.push('Fish-safety absolute. Write "generally considered safe to eat".');
  }
  competitors.forEach((brand) => {
    // \w* (not \b at the end) so a plural/possessive/suffixed form of the
    // brand name ("Garmins") still counts as naming the competitor.
    if (new RegExp('\\b' + brand + '\\w*', 'i').test(all)) reasons.push('Names a competitor brand: ' + brand);
  });
  // Count quantifier: a digit run (with an optional k/M suffix, e.g. "10k") or
  // a spelled-out/Tagalog quantifier (thousands of, libo-libo, daan-daang, ...).
  const countQuantifier = '(?:\\d[\\d,\\.]*\\s*[kKmM]?\\+?|libo-?libong?|libu-?libong?|daan-?daang?|thousands?\\s+of|millions?\\s+of)';
  const countNoun = '(?:users|user|downloads|installs|reviews|ratings|mangingisda ang gumagamit|ang gumagamit)';
  if (new RegExp('\\b' + countQuantifier + '\\s*' + countNoun, 'i').test(all)) {
    reasons.push('Fabricated user or download count.');
  }
  // Rating: digit (optionally hyphenated, e.g. "5-star") or spelled-out/Tagalog
  // number before star/bituin, or a slash-out-of-5 form ("4.8/5").
  const ratingDigit = '\\d(?:\\.\\d)?\\s*(?:-\\s*)?';
  const ratingWord = '(?:four|five|apat|lima)\\s+';
  const ratingNoun = '(star|stars|bituin)\\b';
  if (new RegExp('\\b' + ratingDigit + ratingNoun, 'i').test(all)
      || new RegExp('\\b' + ratingWord + ratingNoun, 'i').test(all)
      || /\b\d(\.\d)?\s*\/\s*5\b/.test(all)) {
    reasons.push('Fabricated star rating.');
  }

  // 8. forbidden product claims
  if (/\biphone\b|\bios\b|\bapple\b/i.test(all)) reasons.push('Forbidden claim: iPhone or iOS support.');
  if (/typhoon warning|babala sa bagyo|bagyo alert/i.test(all)) reasons.push('Forbidden claim: typhoon warnings.');
  if (/\bbfar\b|government[- ]approved|endorsed by the government|aprubado ng gobyerno/i.test(all)) {
    reasons.push('Forbidden claim: government or BFAR endorsement.');
  }
  if (/track(ing)? (the )?(other|ibang) (boats?|bangka)/i.test(all)) {
    reasons.push('Forbidden claim: live tracking of other boats.');
  }

  // 9. price
  // The owner does not want price mentioned at all, ever: not FishPin's own
  // price, and not a comparison figure (a rival device's cost, a monthly
  // load top-up, a subscription fee). Ads must lead with the problem, not a
  // number. So ANY peso figure found anywhere in the generated copy is a
  // rejection, full stop, no context-sniffing to tell "our price" apart from
  // "their price" (that distinction is exactly what let a wrong app price
  // slip through before, e.g. "Halagang P999 lang, at wala nang bayad kada
  // buwan" used to pass because "kada buwan" read as a comparison label).
  // Detection stays intentionally scoped to peso notations only, so an
  // ordinary count like "200 species" or "3 to 5 contacts" still passes:
  // a number adjacent to ₱, PHP/Php/php, a bare capital P prefix, or a
  // trailing pesos/piso.
  const priceHits = [];
  let m;
  const pushHit = (mm) => priceHits.push({ raw: mm[1], start: mm.index, end: mm.index + mm[0].length });
  const rx1 = /(?:₱|PHP|Php|php)\s*([\d,]+)/g;
  while ((m = rx1.exec(all)) !== null) pushHit(m);
  const rx2 = /([\d,]+)\s*(?:pesos?|piso)\b/gi;
  while ((m = rx2.exec(all)) !== null) pushHit(m);
  // Bare "P" shorthand (e.g. "P999") — the informal peso notation this
  // audience actually writes. \bP requires the P itself to start a word, so
  // this does not also fire on the "P" inside "PHP" (no boundary before it).
  const rx3 = /\bP\s?(\d[\d,]*)\b/g;
  while ((m = rx3.exec(all)) !== null) pushHit(m);
  if (priceHits.length > 0) {
    // The reason deliberately never names the figure: restating a number in
    // the rejection reason invites the regeneration to echo that same number
    // straight back into the next attempt.
    reasons.push('Do not mention a price or any peso amount. Lead with the problem FishPin solves instead.');
  }

  // 10. the caption is PROSE ONLY.
  // The model writes the body text and nothing else: buildPostMessage appends
  // the call to action, the two links and the hashtags afterwards. Anything
  // the model writes itself in those three shapes is therefore a DUPLICATE in
  // the published post — which is exactly what happened on the first real
  // post, where the CTA appeared once from the model and once from
  // Publish Post. Rejected here so it never reaches the Page again.
  const captionText = String(c.caption || '');
  if (captionText.trim()) {
    if (/https?:\/\//i.test(captionText) || /\bhttp\b/i.test(captionText)
        || /www\./i.test(captionText)
        || (String(o.playStoreUrl || '').trim()
            && captionText.indexOf(String(o.playStoreUrl).trim()) !== -1)
        || (String(o.websiteUrl || '').trim()
            && captionText.indexOf(String(o.websiteUrl).trim()) !== -1)) {
      reasons.push('The caption contains a link. Write prose only: the website and the '
        + 'Play Store link are added automatically after the caption, so a link written '
        + 'into the caption is published twice.');
    }
    if (/(^|[\s(\[])#[A-Za-z0-9_\u00C0-\u024F]/.test(captionText)) {
      reasons.push('The caption contains a hashtag. Write prose only: the hashtags are '
        + 'added automatically after the caption, so a hashtag written into the caption '
        + 'is published twice.');
    }
    const ctaText = String(c.cta || '').trim();
    if (ctaText && normalizeForRepeat(captionText).indexOf(normalizeForRepeat(ctaText)) !== -1) {
      reasons.push('The caption repeats the call to action. Write prose only: the call to '
        + 'action is added automatically on its own line after the caption, so writing it '
        + 'into the caption publishes it twice.');
    }

    // 11. caption SHAPE: 2 to 4 short paragraphs, blank line between them, at
    // most 3 sentences each. One unbroken block is an unscannable wall on a
    // phone, and Facebook hides everything past the first few lines behind
    // "See more", so the hook has to stand on its own.
    const paras = captionParagraphs(captionText);
    if (paras.length < CAPTION_MIN_PARAGRAPHS || paras.length > CAPTION_MAX_PARAGRAPHS) {
      reasons.push('The caption has ' + paras.length + ' paragraph'
        + (paras.length === 1 ? '' : 's') + ', it must have ' + CAPTION_MIN_PARAGRAPHS + ' to '
        + CAPTION_MAX_PARAGRAPHS + ', separated by a blank line. The first paragraph is the '
        + 'hook and must be the shortest.');
    }
    paras.forEach((p, i) => {
      const n = sentenceCount(p);
      if (n > PARAGRAPH_MAX_SENTENCES) {
        reasons.push('Paragraph ' + (i + 1) + ' of the caption has ' + n + ' sentences, max is '
          + PARAGRAPH_MAX_SENTENCES + '. Break it into shorter paragraphs with a blank line '
          + 'between them.');
      }
    });
  }

  // 12. required links, checked on the ASSEMBLED MESSAGE.
  // Every published post must carry BOTH the website and the Play Store
  // listing, or the ad goes out with no way to act on it. That rule has not
  // gone away, it MOVED: the links are no longer written by the model into the
  // caption (rule 10 now rejects them there), they are appended by
  // buildPostMessage — so the thing that must be checked is the message that
  // will actually be published, not the prose. This is what catches a
  // regression in buildPostMessage itself; a caller may also pass an
  // already-composed `opts.message` to validate that exact string.
  // The two URLs arrive through opts (Config.websiteUrl / Config.playStoreUrl),
  // never hardcoded here. A caller that supplies neither (an old unit test, a
  // client with no links) simply does not get the check, exactly as an empty
  // bannedWords list does not get the banned-word check.
  const assembled = typeof o.message === 'string' ? o.message : buildPostMessage(c, o);
  [
    { url: o.websiteUrl, label: 'website' },
    { url: o.playStoreUrl, label: 'Play Store' },
  ].forEach((link) => {
    const url = String(link.url || '').trim();
    if (!url) return;
    if (assembled.indexOf(url) === -1) {
      reasons.push('The assembled post message is missing the required ' + link.label
        + ' link: ' + url + '. Both links are appended after the call to action, each on its '
        + 'own line; a post without them gives the reader no way to act on the ad.');
    }
  });

  // 13. never publish the same post twice.
  // The owner's rule: the same SUBJECT may come around again, but the wording
  // and the angle must differ from what is already live on the Page.
  // Deliberately EXACT-match only, after normalising whitespace and case: a
  // deterministic rule the model can actually satisfy, with no similarity
  // threshold to tune and no risk of a legitimate second post about the same
  // feature being rejected by a fuzzy score. Near-duplicates are therefore
  // allowed by design; the angle instruction in the prompt (and the human
  // approval gate) is what keeps them apart.
  // priorPosts arrives from opts as [{ topic, caption, headline? }, ...],
  // collected by nodes/load-queue.js from every posted/measured Queue row.
  const priorPosts = Array.isArray(o.priorPosts) ? o.priorPosts : [];
  if (priorPosts.length) {
    const newCaption = normalizeForRepeat(c.caption);
    const newHeadline = normalizeForRepeat(c.headline);
    if (newCaption && priorPosts.some((p) => normalizeForRepeat(p && p.caption) === newCaption)) {
      reasons.push('This exact caption has already been published. Keep the subject if you want, '
        + 'but change the angle: a different hook, a different situation, different sentences.');
    }
    // The Queue tab has no headline column, so a prior headline is only
    // compared when the caller actually has one (the loop payload, or a future
    // feed from the Attempts tab). When it is absent the caption check above
    // is what catches a repeat.
    if (newHeadline && priorPosts.some((p) => normalizeForRepeat(p && p.headline) === newHeadline)) {
      reasons.push('This exact headline has already been published. Write a different headline '
        + 'and a different angle on the topic.');
    }
  }

  return { valid: reasons.length === 0, reasons };
}

if (typeof module !== 'undefined') {
  module.exports = {
    validateCopy, buildPostMessage, OK_ACRONYMS, normalizeForRepeat,
    captionParagraphs, sentenceCount,
    CAPTION_MIN_WORDS, CAPTION_MAX_WORDS,
    CAPTION_MIN_PARAGRAPHS, CAPTION_MAX_PARAGRAPHS, PARAGRAPH_MAX_SENTENCES,
  };
}
