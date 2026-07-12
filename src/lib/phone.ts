// Extract a Brazilian phone number and DDD from an arbitrary line.
// Returns { phone, ddd } where phone is only digits (no country code) and ddd is 2 digits.
export function parsePhone(line: string): { phone: string | null; ddd: string | null } {
  if (!line) return { phone: null, ddd: null };

  // Grab the longest run of digits (allowing separators inside).
  // Common formats: 5511987654321, 55 11 9 8765-4321, (11) 98765-4321, 11987654321
  const digitsOnly = line.replace(/\D+/g, " ");
  // Find candidate sequences of digits by joining consecutive digit groups if they look like a phone
  const candidates: string[] = [];
  const matches = digitsOnly.match(/\d[\d\s]{7,}\d/g);
  if (matches) {
    for (const m of matches) {
      candidates.push(m.replace(/\s+/g, ""));
    }
  }
  // Also try full-digit compact form
  const compact = line.replace(/\D+/g, "");
  if (compact.length >= 10) candidates.push(compact);

  for (let cand of candidates) {
    // Strip Brazil country code
    if ((cand.length === 12 || cand.length === 13) && cand.startsWith("55")) {
      cand = cand.slice(2);
    }
    if (cand.length === 10 || cand.length === 11) {
      const ddd = cand.slice(0, 2);
      // Valid Brazilian DDDs start 11-99, first digit not 0
      if (/^[1-9][1-9]$/.test(ddd)) {
        return { phone: cand, ddd };
      }
    }
  }
  return { phone: null, ddd: null };
}
