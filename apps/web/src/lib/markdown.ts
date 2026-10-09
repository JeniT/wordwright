import MarkdownIt from 'markdown-it'

/**
 * Renders the AI's Markdown as HTML that is safe to insert into the page. The AI's output is
 * untrusted (it may be steered by text in the idea or a web page), so:
 * - raw HTML in the text is escaped, never passed through (`html: false`);
 * - images are shown as their alt text only: an image address is a way to leak data to a stranger's server;
 * - only web, email and in-page links are kept, and they open in a new tab without giving the page access to ours.
 */
const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false })

md.validateLink = (url) => /^(https?:|mailto:|#)/i.test(url.trim())

md.renderer.rules.image = (tokens, index) => md.utils.escapeHtml(tokens[index]!.content)

const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, i, options, _env, self) => self.renderToken(tokens, i, options))
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index]!
  if (String(token.attrGet('href') ?? '').startsWith('#'))
    return defaultLinkOpen(tokens, index, options, env, self)
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, index, options, env, self)
}

export function renderMarkdown(text: string): string {
  return md.render(text)
}
