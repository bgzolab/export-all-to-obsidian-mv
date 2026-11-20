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

export function renderMarkdown(markdown: string): string {
  // marked can return a Promise when async extensions are enabled; this app
  // never registers any, so `async: false` keeps the type a plain string.
  return sanitizeHtml(marked.parse(markdown, { async: false }) as string)
}
