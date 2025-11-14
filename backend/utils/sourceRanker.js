export const TRUSTED_DOMAINS = ['.gov', '.edu', 'who.int', 'nih.gov', 'ieee.org', 'nature.com', 'science.org', 'reuters.com', 'bbc.co.uk'];

// Simple heuristic scoring: + points for trustworthy domains, - points for low-quality
export function scoreSource(url) {
  const u = (url || '').toLowerCase();
  let score = 0;
  for (const d of TRUSTED_DOMAINS) if (u.includes(d)) score += 100;
  if (u.includes('.gov')) score += 80;
  if (u.includes('.edu')) score += 70;
  if (u.includes('wikipedia.org')) score += 10; // useful but editable
  // penalize obvious low-quality
  if (u.includes('blogspot') || u.includes('medium.com')) score -= 20;
  if (u.includes('localhost') || u.startsWith('file:')) score -= 100;
  return score;
}

// sort results by score desc
export function rankResults(results) {
  if (!Array.isArray(results)) return results;
  return results.map(r => ({...r, _score: scoreSource(r.url)})).sort((a,b)=> (b._score||0)-(a._score||0));
}
