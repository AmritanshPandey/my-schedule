const ADAPTIVE_CSS = `
<style id="__strategy-adaptive__">
*,*::before,*::after{box-sizing:border-box}
html{overflow-x:hidden!important;-webkit-text-size-adjust:100%}
body{max-width:100vw!important;overflow-x:hidden!important;margin:0!important;padding:16px!important}
[style*="width:"]{max-width:100%!important}
table{display:block!important;width:100%!important;overflow-x:auto!important}
img,video,canvas,svg{max-width:100%!important;height:auto!important}
pre,code{white-space:pre-wrap!important;word-break:break-word!important}
h1{font-size:clamp(1.4rem,5vw,2rem)!important}
h2{font-size:clamp(1.2rem,4vw,1.6rem)!important}
h3{font-size:clamp(1.05rem,3.5vw,1.3rem)!important}
p,li{font-size:clamp(0.95rem,3vw,1.05rem)!important;line-height:1.65!important}
/* Kill fixed-width grid columns */
[class*="col-"],[class*="column"],[class*="grid-"]{float:none!important;width:100%!important;max-width:100%!important}
/* Flex containers that break on small screens */
.row,[class*="flex-row"]{flex-wrap:wrap!important}
/* Ensure links are tappable */
a{min-height:44px;display:inline-flex;align-items:center}
</style>
`;

export function injectResponsiveStyles(html: string): string {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${ADAPTIVE_CSS}</head>`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1${ADAPTIVE_CSS}`);
  }
  return ADAPTIVE_CSS + html;
}
