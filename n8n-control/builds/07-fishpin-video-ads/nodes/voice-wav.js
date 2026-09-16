// Glue: Gemini TTS returns raw 16-bit mono PCM. Wrap it in a WAV header for the
// render service, and refuse audio too short to be the voiceover. Runs before
// any image or Veo spend.
const run = $('Set Row').first().json;
const fail = (why) => [{ json: { ok: false, status: 'failed',
  message: 'FishPin video ' + run.id + ': voiceover (TTS) failed, nothing else was generated. ' + why } }];
const parts = ((($json.candidates || [])[0] || {}).content || {}).parts || [];
const found = parts.find((p) => p && (p.inlineData || p.inline_data));
if (!found) return fail(JSON.stringify($json.error || $json).slice(0, 300));
const d = found.inlineData || found.inline_data;
const rate = Number(((d.mimeType || d.mime_type || '').match(/rate=(\d+)/) || [])[1]) || 24000;
const pcm = Buffer.from(d.data || '', 'base64');
const seconds = pcm.length / (rate * 2);
if (seconds < 10) return fail('The audio is only ' + seconds.toFixed(1) + ' seconds, too short for a 45 to 70 word voiceover.');
if (seconds > 34) return fail('The audio is ' + seconds.toFixed(1) + ' seconds, too long to fit a 30-second Reel. The voiceover ran long; shorten it.');
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
return [{ json: { ok: true, wav_b64: Buffer.concat([h, pcm]).toString('base64'), seconds: Math.round(seconds * 10) / 10 } }];
