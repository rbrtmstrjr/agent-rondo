// Glue: build the Gemini copy request from the brand bible.
const cfg = $('Config').first().json;
const q = $('Pick Row').first().json;

const body = {
  system_instruction: { parts: [{ text: buildSystemPrompt() }] },
  contents: [{ role: 'user', parts: [{ text: buildUserPrompt(q.row, q.revision_note, q.rejected_headline) }] }],
  generationConfig: {
    temperature: Number(cfg.copyTemperature),
    responseMimeType: 'application/json',
    responseSchema: COPY_SCHEMA,
  },
};
return [{ json: { geminiBody: body } }];
