// ============================================================================
// Retrieve — Code node (no credentials). Ranks KB chunks by cosine similarity,
// injects the rolling memory note + recent turns, and builds a grounded,
// human-feeling Gemini chat request.
// ============================================================================

const cfg = $('Config').first().json;
const prep = $('Prepare').first().json;
const emb = $json; // batchEmbedContents response

const message = prep.message;
const kb = prep.kb || [];
const vecs = (emb && Array.isArray(emb.embeddings)) ? emb.embeddings : [];

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
};

let context = '';
let score = 0;
let sources = [];

if (vecs.length >= kb.length + 1) {
  const qv = vecs[kb.length].values;
  const topK = Number(cfg.topK || 4);
  const ranked = kb
    .map((c, i) => ({ title: c.title, text: c.text, s: cosine(qv, vecs[i].values) }))
    .sort((a, b) => b.s - a.s);
  const top = ranked.slice(0, topK);
  score = top.length ? top[0].s : 0;
  sources = top.map((t) => t.title);
  context = top.map((c) => '[' + c.title + ']\n' + c.text).join('\n\n');
}

// ---- Persona: warm, intelligent, human — not a robotic FAQ ----
const persona = 'You are FishPin Assistant, a warm and genuinely helpful guide on the FishPin website. '
  + 'FishPin is an affordable, offline marine navigation Android app built for Filipino fishermen (₱499 one-time on Google Play). '
  + 'You care about fishermen — their safety at sea, their livelihood, and getting good value. You speak like a friendly, knowledgeable person '
  + '(think of a helpful kuya/ate), not like a machine. '
  + 'You can help with: what FishPin is, pricing, how to download, offline use, GPS / compass / speed, background trail recording, saved paths, '
  + 'custom spot pinning, the AI fish scanner, the Philippine species guide, weather & marine conditions, the fishing score, emergency SOS, '
  + 'nautical charts, offline map downloads, route planning / ETA, privacy, device support, comparisons with Navionics / Fishbrain / Garmin, and partnerships.';

const memoryNote = prep.summary
  ? '\n\nMEMORY NOTE — durable facts from earlier in this same conversation (treat as true and use naturally):\n' + prep.summary
  : '';

const style = '\n\nHOW TO TALK (be human and intelligent):\n'
  + '- Be warm, natural, and personable. Vary your wording; never sound canned or repeat the same sentences.\n'
  + '- Once you know the user\'s name, use it occasionally and naturally. Mirror their language and tone.\n'
  + '- Show genuine empathy for their situation (safety at sea, budget, long days fishing).\n'
  + '- REASON about what they really need: connect FishPin features to their specific situation. '
  + 'E.g. if they fish at night or far out, naturally highlight SOS, trail recording, or offline maps.\n'
  + '- If a question is ambiguous, ask one short, friendly clarifying question instead of guessing.\n'
  + '- For multi-part questions, address each part. Keep replies focused (usually 2-5 sentences) — helpful, not a wall of text.\n'
  + '- Never say "as an AI" or dismiss yourself as "just a bot". Be confident and personable.';

const rules = '\n\nIMPORTANT RULES:\n'
  + '1. FACTS: For concrete FishPin facts (prices, features, platforms, dates, policies) use ONLY the CONTEXT below. Never invent or guess them. You MAY reason, empathize, and make natural suggestions around those facts.\n'
  + '2. MEMORY: Use the MEMORY NOTE and the conversation history. Remember the user\'s name, location, boat, and what they asked. If they ask whether you remember them or what they told you, recall it confidently. NEVER claim you cannot remember things from this conversation.\n'
  + '3. Greetings, thanks, self-introductions, and questions about you — respond warmly. Do NOT escalate.\n'
  + '4. Truly unrelated topics (other apps, general trivia, jokes, weather elsewhere, coding) — gently steer back to FishPin. Do NOT escalate. (A user sharing their name, location, or that they fish is NOT off-topic — welcome it.)\n'
  + '5. HUMAN HAND-OFF — for a genuine support or business matter that needs a real person (billing or refund, "I paid but can\'t download", an app crash/bug, wrong GPS, account help, partnership / investor / sponsorship / press, or anything you genuinely cannot resolve from the facts): do NOT just deflect. FIRST reply warmly and helpfully — acknowledge their specific question, share anything relevant you do know (e.g. for investment/partnership, that FishPin works with cooperatives, LGUs, NGOs and sponsors), and let them know you are connecting them with the FishPin team and that they can reach us at ' + cfg.supportContact + '. THEN add a final line containing ONLY the marker [[HANDOFF]] — this marker line is removed before the user sees it, so never explain it.\n'
  + '6. Do not mention the word "context" or say you are reading from documents.\n'
  + '7. When it fits naturally, invite the user to download FishPin on Google Play.\n'
  + '8. Reply in the user\'s language (English or Filipino/Tagalog), matching how they wrote.';

const sys = persona + memoryNote + style + rules;

// ---- Recent verbatim turns (the rolling summary covers older history) ----
let history = Array.isArray(prep.history) ? prep.history.slice() : [];
while (history.length && history[0].role !== 'user') history.shift(); // Gemini needs a user-first turn
const historyContents = history.map((t) => ({
  role: t.role === 'model' ? 'model' : 'user',
  parts: [{ text: String(t.text || '') }],
}));

const chatBody = {
  systemInstruction: { parts: [{ text: sys }] },
  contents: [
    ...historyContents,
    { role: 'user', parts: [{ text: 'CONTEXT (FishPin facts you may use):\n' + (context || '(no relevant information found)') + '\n\nUSER MESSAGE: ' + message }] },
  ],
  generationConfig: {
    temperature: Number(cfg.chatTemperature || 0.55),
    topP: 0.95,
    maxOutputTokens: 700,
  },
};

return [{ json: { message, sessionId: prep.sessionId, score: Number(score.toFixed(3)), sources, chatBody } }];
