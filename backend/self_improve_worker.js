import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();

const INTERVAL_MS = Number(process.env.SELF_IMPROVE_INTERVAL_MS || 1000 * 60 * 60); // default 1 hour
const ENABLE = process.env.ENABLE_SELF_IMPROVE === 'true';

export function startSelfImproveWorker() {
  if (!ENABLE) {
    console.log('Self-improve worker disabled');
    return;
  }
  console.log('Starting self-improve worker, interval', INTERVAL_MS);
  setInterval(async () => {
    try {
      console.log('Running self-improve...');
      const resp = await fetch(`http://localhost:${process.env.PORT||3000}/api/self_improve/run`, { method: 'POST' });
      const data = await resp.json();
      console.log('Self-improve result', data.suggestions ? data.suggestions.length + ' suggestions' : data);
    } catch (e) {
      console.error('Self-improve worker error', e);
    }
  }, INTERVAL_MS);
}
