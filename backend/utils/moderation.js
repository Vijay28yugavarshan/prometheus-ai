import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function moderate(prompt) {
  if (!process.env.ENABLE_MODERATION || process.env.ENABLE_MODERATION === 'false') {
    return { allowed: true, reason: null, raw: null };
  }
  try {
    const resp = await openai.moderations.create({
      model: 'omni-moderation-latest',
      input: prompt
    });
    const results = resp.results && resp.results[0];
    const flagged = results && results.categories && Object.values(results.categories).some(v => v === true);
    return { allowed: !flagged, reason: results, raw: resp };
  } catch (e) {
    console.error('Moderation error', e);
    // Fail open (allow) if moderation call fails, but note reason
    return { allowed: true, reason: 'moderation_error', raw: e.toString() };
  }
}
