// ============================================================================
// Copy validation — deterministic, no model in the loop. Returns every reason
// a draft fails so the reviewer and the regeneration prompt both get specifics.
// Pure: no n8n globals, no requires. Shared constants arrive via opts.
// ============================================================================

// Acronyms fishermen actually read as words. Stripped before the all-caps check
// so "walang GPS SMS signal" is not mistaken for shouting.
const OK_ACRONYMS = ['GPS', 'SOS', 'SMS', 'ETA', 'AI', 'PH', 'PHP', 'WIFI', 'DITO', 'FISHPIN'];

const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

function validateCopy(copy, opts) {
  const o = opts || {};
  const banned = o.bannedWords || [];
  const competitors = o.competitors || [];
  const price = o.price;
  const reasons = [];
  const c = copy || {};

  // 1. required fields
  ['headline', 'subhead', 'caption', 'cta', 'image_prompt', 'alt_text'].forEach((f) => {
    if (!String(c[f] || '').trim()) reasons.push('Missing or empty field: ' + f);
  });
  if (!Array.isArray(c.hashtags) || c.hashtags.length < 3 || c.hashtags.length > 5) {
    reasons.push('hashtags must be an array of 3 to 5 tags');
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
  if (capWords < 80 || capWords > 150) reasons.push('caption is ' + capWords + ' words, must be 80 to 150');

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
  const priceHits = [];
  let m;
  const rx1 = /(?:₱|PHP|Php|php)\s*([\d,]+)/g;
  while ((m = rx1.exec(all)) !== null) priceHits.push(m[1]);
  const rx2 = /([\d,]+)\s*(?:pesos?|piso)\b/gi;
  while ((m = rx2.exec(all)) !== null) priceHits.push(m[1]);
  // Bare "P" shorthand (e.g. "P999") — the informal peso notation this
  // audience actually writes. \bP requires the P itself to start a word, so
  // this does not also fire on the "P" inside "PHP" (no boundary before it).
  const rx3 = /\bP\s?(\d[\d,]*)\b/g;
  while ((m = rx3.exec(all)) !== null) priceHits.push(m[1]);
  priceHits.forEach((raw) => {
    const n = parseInt(String(raw).replace(/,/g, ''), 10);
    if (!isNaN(n) && n !== price) reasons.push('Wrong price: ' + raw + '. The only allowed figure is ' + price + '.');
  });

  return { valid: reasons.length === 0, reasons };
}

if (typeof module !== 'undefined') module.exports = { validateCopy, OK_ACRONYMS };
