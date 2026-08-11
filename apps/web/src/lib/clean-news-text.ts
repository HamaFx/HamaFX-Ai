// SPDX-License-Identifier: Apache-2.0

/**
 * Normalize provider text before rendering it as plain text.
 *
 * News providers occasionally return HTML entities, literal escape sequences
 * ("\\n"), or malformed XML/HTML fragments such as <n>. We intentionally do
 * not render this content as HTML: decode safe text entities, remove markup
 * delimiters, and collapse whitespace for a stable card layout.
 */
export function cleanNewsText(raw: string): string {
  let text = raw;

  // Decode twice so values such as &amp;lt;tag&amp;gt; are normalized before
  // markup-like fragments are removed. This is text normalization, not HTML
  // rendering.
  for (let pass = 0; pass < 2; pass += 1) {
    text = text
      .replace(
        /&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27|#x2F|#60);/gi,
        (entity) => {
          switch (entity.toLowerCase()) {
            case '&amp;': return '&';
            case '&lt;': return '<';
            case '&gt;': return '>';
            case '&quot;': return '"';
            case '&apos;':
            case '&#39;':
            case '&#x27;': return "'";
            case '&nbsp;': return ' ';
            case '&#x2f;': return '/';
            case '&#x60;': return '`';
            default: return entity;
          }
        },
      )
      .replace(/&#(\d+);/g, (entity, digits: string) => {
        const codePoint = Number(digits);
        return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      });
  }

  // Handle both actual newlines and providers that return a literal "\\n"
  // (including a second escaped slash from some JSON/XML feeds).
  text = text.replace(/\\+[rnt]/g, ' ');

  // Remove known HTML/XML tags and malformed empty tags. Keep the text between
  // tags, and also unwrap unknown pseudo-tags so encoded wrappers like
  // &amp;lt;calm&amp;gt; become "calm" rather than leaking angle brackets.
  text = text
    .replace(/<\s*\/?\s*(?:a|b|br|code|div|em|i|li|ol|p|pre|strong|u|ul|n)\b[^>]*>/gi, ' ')
    .replace(/<\s*\\?\s*>/g, ' ')
    .replace(/<\s*\/\s*[a-z][^>]*>/gi, ' ')
    .replace(/<\s*\\?\s*([a-z][^>]*)>/gi, '$1');

  // Replace non-printing controls without using a control-character regexp
  // (which is rejected by the repository's ESLint rules).
  text = Array.from(text, (char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 32 && char !== '\n' && char !== '\r' && char !== '\t' ? ' ' : code === 127 ? ' ' : char;
  }).join('');

  return text.replace(/\s+/g, ' ').trim();
}
