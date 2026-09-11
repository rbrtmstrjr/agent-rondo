// ============================================================================
// Copy validation — deterministic, no model in the loop. Returns every reason
// a draft fails so the reviewer and the regeneration prompt both get specifics.
// Pure: no n8n globals, no requires. Shared constants arrive via opts.
// ============================================================================

// Acronyms fishermen actually read as words. Stripped before the all-caps check
// so "walang GPS SMS signal" is not mistaken for shouting.
const OK_ACRONYMS = ['GPS', 'SOS', 'SMS', 'ETA', 'AI', 'PH', 'PHP', 'WIFI', 'DITO', 'FISHPIN'];

const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// The caption band. 80 to 150 words is the PROSE band the prompt asks for; the
// two required links (the website and the Play Store listing) are then added on
// their own lines at the end, and a whitespace-split word count counts each URL
// as one word. So the hard ceiling is 150 + 2. Without the +2 a model that
// wrote a perfectly good 150-word caption and then obeyed the links rule would
// be rejected for a length it was told to write.
const CAPTION_MIN_WORDS = 80;
const CAPTION_PROSE_MAX_WORDS = 150;
const CAPTION_MAX_WORDS = CAPTION_PROSE_MAX_WORDS + 2;

// Normalisation for the exact-repeat check: trim, collapse every whitespace run
// to one space, lowercase. Deliberately nothing more — no stemming, no
// similarity scoring. See rule 11.
const normalizeForRepeat = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

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
      + CAPTION_MAX_WORDS + ' (' + CAPTION_PROSE_MAX_WORDS + ' of prose plus the two required links)');
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

  // 10. required links.
  // Every caption must carry BOTH the website and the Play Store listing, or
  // the ad is published with no way to act on it. The two URLs arrive through
  // opts (Config.websiteUrl / Config.playStoreUrl), never hardcoded here, so
  // this rule and the prompt rule that asks for them can never disagree: the
  // glue hands both builders the same two Config values. A caller that
  // supplies neither (an old unit test, a client with no links) simply does
  // not get the check, exactly as an empty bannedWords list does not get the
  // banned-word check.
  const captionText = String(c.caption || '');
  [
    { url: o.websiteUrl, label: 'website' },
    { url: o.playStoreUrl, label: 'Play Store' },
  ].forEach((link) => {
    const url = String(link.url || '').trim();
    if (!url) return;
    if (captionText.indexOf(url) === -1) {
      reasons.push('The caption is missing the required ' + link.label + ' link: ' + url
        + '. Both links must appear in full at the end of the caption, after the call to action, '
        + 'each on its own line.');
    }
  });

  // 11. never publish the same post twice.
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
    validateCopy, OK_ACRONYMS, normalizeForRepeat,
    CAPTION_MIN_WORDS, CAPTION_PROSE_MAX_WORDS, CAPTION_MAX_WORDS,
  };
}
