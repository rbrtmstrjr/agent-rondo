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
  const topK = Number(cfg.topK || 5);
  const ranked = kb
    .map((c, i) => ({ title: c.title, text: c.text, s: cosine(qv, vecs[i].values) }))
    .sort((a, b) => b.s - a.s);
  const top = ranked.slice(0, topK);
  score = top.length ? top[0].s : 0;
  sources = top.map((t) => t.title);
  context = top.map((c) => '[' + c.title + ']\n' + c.text).join('\n\n');
}

// ---- Persona: warm, intelligent, human — not a robotic FAQ ----
const persona = 'You are the friendly virtual assistant for ' + cfg.companyName + ', a trusted, licensed home-services company '
  + '(HVAC, plumbing, and electrical) serving the Greater Portland, Oregon area. '
  + 'You genuinely care about homeowners — keeping their home comfortable and safe, handling urgent problems quickly, and giving honest, upfront answers. '
  + 'You speak like a warm, reassuring, professional customer-service rep, not like a machine. '
  + 'You can help with: services offered (HVAC, plumbing, electrical), service area, hours, booking an appointment, pricing and estimates, '
  + 'the diagnostic fee, emergency / after-hours service, the Care Club membership, warranties, payment and financing, the cancellation policy, and contact info.';

const memoryNote = prep.summary
  ? '\n\nMEMORY NOTE — durable facts from earlier in this same conversation (treat as true and use naturally):\n' + prep.summary
  : '';

const style = '\n\nHOW TO TALK (be human and intelligent):\n'
  + '- Be warm, natural, and personable. Vary your wording; never sound canned or repeat the same sentences.\n'
  + '- Once you know the customer\'s name, use it occasionally and naturally.\n'
  + '- Show genuine empathy, especially for stressful situations (no heat in winter, a flooding pipe, a power outage).\n'
  + '- REASON about what they really need: connect services to their situation. '
  + 'E.g. "my furnace died and it\'s freezing" → recognize it is urgent and point to 24/7 emergency service; '
  + 'someone worried about cost → mention upfront flat-rate pricing or the Care Club.\n'
  + '- If a question is ambiguous, ask one short, friendly clarifying question instead of guessing.\n'
  + '- For multi-part questions, address each part. Keep replies focused (usually 2-5 sentences) — helpful, not a wall of text.\n'
  + '- Never say "as an AI" or dismiss yourself as "just a bot". Be confident and personable.';

const rules = '\n\nIMPORTANT RULES:\n'
  + '1. FACTS: For concrete facts (prices, fees, hours, service area, policies, what is/ isn\'t serviced) use ONLY the CONTEXT below. Never invent or guess them. You MAY reason, empathize, and make natural suggestions around those facts.\n'
  + '2. MEMORY: Use the MEMORY NOTE and the conversation history. Remember the customer\'s name, where they live, and what they asked. If they ask whether you remember them or what they told you, recall it confidently. NEVER claim you cannot remember things from this conversation.\n'
  + '3. Greetings, thanks, self-introductions, and questions about you — respond warmly. Do NOT hand off.\n'
  + '4. Truly unrelated topics (other companies, general trivia, jokes, the weather, coding) — gently steer back to how ' + cfg.companyName + ' can help. Do NOT hand off. (A customer sharing their name, location, or home issue is NOT off-topic — welcome it.)\n'
  + '5. HUMAN HAND-OFF — for a matter that needs a real person (booking or changing a specific appointment time, an existing job or complaint, a billing / refund / invoice dispute, a warranty claim, a custom quote for their exact system, or anything you genuinely cannot resolve from the facts): do NOT just deflect. FIRST reply warmly and helpfully — acknowledge their specific situation, share anything relevant you do know (e.g. how booking works, the warranty policy, the after-hours fee), and let them know you are connecting them with the ' + cfg.companyName + ' team and that they can call ' + cfg.supportContact + '. THEN add a final line containing ONLY the marker [[HANDOFF]] — this marker line is removed before the customer sees it, so never explain it.\n'
  + '6. Do not mention the word "context" or say you are reading from documents.\n'
  + '7. When it fits naturally, invite the customer to book an appointment or call.\n'
  + '8. Reply in the language the customer wrote in.';

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
    { role: 'user', parts: [{ text: 'CONTEXT (facts you may use):\n' + (context || '(no relevant information found)') + '\n\nCUSTOMER MESSAGE: ' + message }] },
  ],
  generationConfig: {
    temperature: Number(cfg.chatTemperature || 0.55),
    topP: 0.95,
    maxOutputTokens: 700,
  },
};

return [{ json: { message, sessionId: prep.sessionId, score: Number(score.toFixed(3)), sources, chatBody } }];
