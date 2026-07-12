/**
 * Best-effort guard against putting direct personal contact details in public
 * organisation free text. This is intentionally a warning boundary, not a
 * claim that arbitrary user-submitted text is verified or risk-free.
 */
export function containsDirectContact(value: string): boolean {
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  if (email.test(value)) return true;

  // Do not mistake dates or opening hours for phone numbers. A plausible
  // phone candidate must contain at least ten digits; punctuation and spaces
  // are allowed so common UK formats still match.
  const phoneCandidates = value.match(/\+?\d[\d\s().-]{7,}\d/g) ?? [];
  return phoneCandidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  });
}
