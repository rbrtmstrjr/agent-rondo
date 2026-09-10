// ============================================================================
// Copy validation — deterministic, no model in the loop. Returns every reason
// a draft fails so the reviewer and the regeneration prompt both get specifics.
// Pure: no n8n globals, no requires. Shared constants arrive via opts.
// ============================================================================

// Acronyms fishermen actually read as words. Stripped before the all-caps check
// so "walang GPS SMS signal" is not mistaken for shouting.
const OK_ACRONYMS = ['GPS', 'SOS', 'SMS', 'ETA', 'AI', 'PH', 'PHP', 'WIFI', 'DITO', 'FISHPIN'];

const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// --- price context (see rule 9) -------------------------------------------
// How much surrounding text counts as a peso figure's "immediate context".
const PRICE_CONTEXT_CHARS = 70;
// Marks a figure as somebody ELSE'S cost: a recurring top-up/subscription, or
// a rival device. Such a figure is a legitimate comparison, not a misquote.
const COMPARISON_COST_CONTEXT = /(load|buwan|monthly|per month|a month|subscription|gps|device|handheld|tracker|plotter|kada araw|daily|kuryente|gasolina)/i;
// Marks a figure as FISHPIN'S OWN price. Always wins over the line above, so
// "Isang bayad lang po, PHP 999, walang buwanang bayad" is still rejected.
// Every "* app" alternative is anchored with \b on BOTH sides: without the
// leading one, "ng app" matches inside "ibang app" ("another app"), which is
// the exact opposite meaning — a rival app's cost, not FishPin's.
const OWN_PRICE_CONTEXT = /(fishpin|isang bayad|isahang bayad|one[- ]?time|bayad lang|\bang app\b|\bsa app\b|\bng app\b|\bapp price\b|\bpresyo ng app\b)/i;

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
  // Two different mistakes hide behind "a peso figure that is not 499":
  //   (a) the model misquoted FishPin's OWN price   -> must still reject
  //   (b) the model quoted a COMPARISON cost        -> must pass
  // (b) is the entire point of the cost-comparison pillar: a one-time 499
  // against a monthly phone-load top-up or a handheld GPS unit. Rejecting (b)
  // with "the only allowed figure is 499" steered the regeneration into
  // relabelling that other cost AS 499, which then passed validation and
  // published a false comparison. So a figure whose immediate context marks it
  // as somebody else's recurring or device cost is ignored — unless that same
  // context also claims it as FishPin's own price, in which case (a) wins.
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
  priceHits.forEach((hit) => {
    const n = parseInt(String(hit.raw).replace(/,/g, ''), 10);
    if (isNaN(n) || n === price) return;
    const ctx = all.slice(Math.max(0, hit.start - PRICE_CONTEXT_CHARS), hit.end + PRICE_CONTEXT_CHARS);
    // A clearly-labelled comparison cost is legitimate copy, not a misquote.
    if (COMPARISON_COST_CONTEXT.test(ctx) && !OWN_PRICE_CONTEXT.test(ctx)) return;
    reasons.push('Peso figure ' + hit.raw + " reads as FishPin's own price. FishPin is " + price
      + ', a one-time purchase. If ' + hit.raw + " is somebody else's cost (a monthly load, a handheld "
      + 'GPS unit), say plainly whose cost it is and keep it out of the sentence that states '
      + "FishPin's price. Do not relabel it as FishPin's price.");
  });

  return { valid: reasons.length === 0, reasons };
}

if (typeof module !== 'undefined') {
  module.exports = { validateCopy, OK_ACRONYMS, COMPARISON_COST_CONTEXT, OWN_PRICE_CONTEXT };
}
