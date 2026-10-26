import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders note Markdown safely: raw HTML is never interpreted (react-markdown
 * escapes it without rehype-raw), and URLs pass through the default
 * transform, which strips javascript:/data: and other unsafe protocols.
 */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose-note text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => defaultUrlTransform(url)}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => <span className="text-faint">[image: {alt || 'untitled'}]</span>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

/** Only http(s) links are rendered as clickable resource URLs. */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined
  } catch {
    return undefined
  }
}
