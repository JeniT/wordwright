import type { Email } from './mailer'

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

type Content = Omit<Email, 'to'>

/** Shared wrapper: simple, readable in any client, no remote images. */
function layout(bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fbfaf7;font-family:Georgia,'Times New Roman',serif;color:#1f2328;line-height:1.6">
<div style="max-width:520px;margin:0 auto">${bodyHtml}
<p style="color:#6b7280;font-size:13px;margin-top:32px">Long-form Writing Assistant</p></div></body></html>`
}

/** Names come from users, so they're escaped before going into HTML. */
export function passwordResetEmail(input: {
  name: string
  link: string
  ttlMinutes: number
}): Content {
  const { name, link, ttlMinutes } = input
  const valid =
    ttlMinutes % 60 === 0
      ? `${ttlMinutes / 60} hour${ttlMinutes === 60 ? '' : 's'}`
      : `${ttlMinutes} minutes`
  return {
    subject: 'Reset your password',
    text: `Hi ${name},

Someone (hopefully you) asked to reset your Long-form Writing Assistant password. Choose a new one here (the link works once and expires in ${valid}):

${link}

If you didn't ask for this, you can ignore this email; your password won't change.`,
    html: layout(`<p>Hi ${escapeHtml(name)},</p>
<p>Someone (hopefully you) asked to reset your Long-form Writing Assistant password.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f5d62;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Choose a new password</a></p>
<p style="font-size:14px">The link works once and expires in ${valid}. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
<p style="font-size:14px">If you didn't ask for this, you can ignore this email; your password won't change.</p>`),
  }
}
