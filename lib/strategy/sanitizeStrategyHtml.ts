export function sanitizeStrategyHtml(html: string): string {
  // Remove script tags and content
  let s = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove javascript: and data: URIs (except data: images)
  s = s.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  s = s.replace(/src\s*=\s*["']javascript:[^"']*["']/gi, 'src=""');

  // Remove event handler attributes
  s = s.replace(/\s+on[a-z]+\s*=\s*["'][^"']*["']/gi, "");
  s = s.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "");

  return s;
}
