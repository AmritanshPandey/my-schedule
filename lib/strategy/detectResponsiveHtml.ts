export function detectResponsiveHtml(html: string): boolean {
  const hasViewportMeta =
    /<meta[^>]+name\s*=\s*["']viewport["'][^>]*content\s*=\s*["'][^"']*width\s*=\s*device-width/i.test(html) ||
    /<meta[^>]+content\s*=\s*["'][^"']*width\s*=\s*device-width[^"']*["'][^>]*name\s*=\s*["']viewport["']/i.test(html);

  if (!hasViewportMeta) return false;

  const hasMediaQueries = /@media\s*[\s(]*(max-width|min-width|screen)/i.test(html);
  const hasFlexGrid = /display\s*:\s*(flex|grid)/i.test(html);
  const hasPercentWidths = /(?:max-)?width\s*:\s*\d+%/i.test(html);
  const hasTailwind = /class\s*=\s*["'][^"']*(?:sm:|md:|lg:|xl:)/i.test(html);
  const hasBootstrap = /col-(?:xs|sm|md|lg|xl)-\d+/i.test(html);

  return hasMediaQueries || hasFlexGrid || hasPercentWidths || hasTailwind || hasBootstrap;
}
