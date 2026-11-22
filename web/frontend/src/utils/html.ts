import DOMPurify from 'dompurify'
import { marked } from 'marked'

// Crawled HTML may contain scripts or event handlers. Every HTML/Markdown path
// must go through this module; FieldRenderer never renders raw v-html.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'A') return
  const href = node.getAttribute('href') ?? ''
  if (href.startsWith('http')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

/**
 * Markdown stored from GitHub often contains repository-relative images and
 * links. Resolve them against the raw repository URL before sanitizing.
 */
function resolveRelativeUrls(html: string, baseUrl: string): string {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return html
  }
  return html.replace(/\b(src|href)=(["'])([^"']+)\2/gi, (match, attr, quote, value) => {
    if (/^(https?:|data:|mailto:|#)/i.test(value)) return match
    try {
      return `${attr}=${quote}${new URL(value, base).href}${quote}`
    } catch {
      return match
    }
  })
}

export function renderMarkdown(markdown: string, baseUrl?: string): string {
  // marked can return a Promise when async extensions are enabled; this app
  // never registers any, so `async: false` keeps the type a plain string.
  const html = marked.parse(markdown, { async: false }) as string
  return sanitizeHtml(baseUrl ? resolveRelativeUrls(html, baseUrl) : html)
}
