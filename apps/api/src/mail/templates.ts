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
<p style="color:#6b7280;font-size:13px;margin-top:32px">Wordwright</p></div></body></html>`
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

Someone (hopefully you) asked to reset your Wordwright password. Choose a new one here (the link works once and expires in ${valid}):

${link}

If you didn't ask for this, you can ignore this email; your password won't change.`,
    html: layout(`<p>Hi ${escapeHtml(name)},</p>
<p>Someone (hopefully you) asked to reset your Wordwright password.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f5d62;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Choose a new password</a></p>
<p style="font-size:14px">The link works once and expires in ${valid}. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
<p style="font-size:14px">If you didn't ask for this, you can ignore this email; your password won't change.</p>`),
  }
}

export function verifyEmailEmail(input: {
  name: string
  link: string
  ttlHours: number
  /** If set, says unused, unconfirmed accounts are deleted after this many days. */
  unusedAccountDays?: number
}): Content {
  const { name, link, ttlHours, unusedAccountDays } = input
  const cleanup = unusedAccountDays
    ? ` If you don't confirm and don't use the account, we'll delete it after ${unusedAccountDays} days.`
    : ''
  return {
    subject: 'Confirm your email address',
    text: `Hi ${name},

Welcome to Wordwright. Please confirm this is your email address (the link expires in ${ttlHours} hours):

${link}

Confirming lets you share profiles with co-writers and keeps your account safe.${cleanup} If you didn't sign up, you can ignore this email.`,
    html: layout(`<p>Hi ${escapeHtml(name)},</p>
<p>Welcome to Wordwright. Please confirm this is your email address.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f5d62;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Confirm my email</a></p>
<p style="font-size:14px">The link expires in ${ttlHours} hours. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
<p style="font-size:14px">Confirming lets you share profiles with co-writers and keeps your account safe.${escapeHtml(cleanup)} If you didn't sign up, you can ignore this email.</p>`),
  }
}

export function deletionReminderEmail(input: {
  name: string
  link: string
  daysLeft: number
  ttlHours: number
  signInLink: string
}): Content {
  const { name, link, daysLeft, ttlHours, signInLink } = input
  const when = daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`
  return {
    subject: `Your account will be deleted ${when} unless you confirm it`,
    text: `Hi ${name},

You signed up for Wordwright but haven't confirmed your email address or started using the account, so we'll delete it ${when}. To keep it, confirm your address (this link expires in ${ttlHours} hours):

${link}

Or sign in at ${signInLink} and start using it: saving a draft, an idea or your API key also keeps it. If you don't want the account, there is nothing to do. This is the only reminder we'll send.`,
    html: layout(`<p>Hi ${escapeHtml(name)},</p>
<p>You signed up for Wordwright but haven't confirmed your email address or started using the account, so we'll delete it <strong>${escapeHtml(when)}</strong>.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f5d62;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Keep my account</a></p>
<p style="font-size:14px">The link expires in ${ttlHours} hours. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
<p style="font-size:14px">Or <a href="${escapeHtml(signInLink)}">sign in</a> and start using it: saving a draft, an idea or your API key also keeps it. If you don't want the account, there is nothing to do. This is the only reminder we'll send.</p>`),
  }
}

export function invitationEmail(input: {
  inviterName: string
  profileName: string
  link: string
  declineLink: string
  ttlDays: number
}): Content {
  const { inviterName, profileName, link, declineLink, ttlDays } = input
  return {
    subject: `${inviterName} invited you to write together`,
    text: `${inviterName} has invited you to join "${profileName}" on Wordwright, so you can work on pieces together.

Accept the invitation here (you'll sign in or create an account with this email address; the link expires in ${ttlDays} days):

${link}

If you weren't expecting this, you can ignore this email and nothing will happen. To decline, or to stop invitations from ${inviterName} or from everyone, use this page:

${declineLink}`,
    html: layout(`<p><strong>${escapeHtml(inviterName)}</strong> has invited you to join <strong>${escapeHtml(profileName)}</strong> on Wordwright, so you can work on pieces together.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f5d62;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Accept the invitation</a></p>
<p style="font-size:14px">You'll sign in or create an account with this email address. The link expires in ${ttlDays} days. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
<p style="font-size:14px">If you weren't expecting this, you can ignore this email and nothing will happen. You can also <a href="${escapeHtml(declineLink)}">decline, or stop invitations</a> from ${escapeHtml(inviterName)} or from everyone.</p>`),
  }
}

/** Tells a member the draft's editor wants to hand the draft to them. The link opens the draft, where they answer. */
export function handoverOfferEmail(input: {
  fromName: string
  draftTitle: string
  profileName: string
  link: string
}): Content {
  const { fromName, draftTitle, profileName, link } = input
  const title = draftTitle.trim() || 'an untitled draft'
  return {
    subject: `${fromName} has offered you a draft`,
    text: `${fromName} has offered to hand you "${title}" in "${profileName}" on Wordwright, so you become the editor, the one person who changes its words.

Open the draft to accept or decline. Nothing changes until you accept, and ${fromName} can keep working on it until then:

${link}`,
    html: layout(`<p><strong>${escapeHtml(fromName)}</strong> has offered to hand you <strong>${escapeHtml(title)}</strong> in ${escapeHtml(profileName)}, so you become its editor, the one person who changes its words.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f5d62;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Open the draft</a></p>
<p style="font-size:14px">Nothing changes until you accept, and ${escapeHtml(fromName)} can keep working on it until then. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>`),
  }
}

/** Tells people when their password changed, so a change they didn't make is noticed. No link to act on a token. */
export function passwordChangedEmail(input: { name: string; resetUrl: string }): Content {
  const { name, resetUrl } = input
  return {
    subject: 'Your password was changed',
    text: `Hi ${name},

The password for your Wordwright account was just changed, and any other devices were signed out.

If that was you, there's nothing to do. If it wasn't, reset your password straight away: ${resetUrl}`,
    html: layout(`<p>Hi ${escapeHtml(name)},</p>
<p>The password for your Wordwright account was just changed, and any other devices were signed out.</p>
<p>If that was you, there's nothing to do. If it wasn't, <a href="${escapeHtml(resetUrl)}">reset your password straight away</a>.</p>`),
  }
}

/** For accounts that sign in with Google (no password yet): the link proves they own the inbox. */
export function passwordSetupEmail(input: {
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
    subject: 'Set a password for your account',
    text: `Hi ${name},

You asked to add a password to your Wordwright account, so you can sign in with your email as well as Google. Choose one here (the link works once and expires in ${valid}; you'll be signed out of your devices afterwards):

${link}

If you didn't ask for this, you can ignore this email.`,
    html: layout(`<p>Hi ${escapeHtml(name)},</p>
<p>You asked to add a password to your Wordwright account, so you can sign in with your email as well as Google.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f5d62;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Choose a password</a></p>
<p style="font-size:14px">The link works once and expires in ${valid}. You'll be signed out of your devices afterwards. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
<p style="font-size:14px">If you didn't ask for this, you can ignore this email.</p>`),
  }
}

/** Goes to the *new* address: opening the link proves the person can read mail there. */
export function changeEmailEmail(input: { name: string; link: string; ttlHours: number }): Content {
  const { name, link, ttlHours } = input
  return {
    subject: 'Confirm your new email address',
    text: `Hi ${name},

You asked to use this address for your Wordwright account. Confirm it here (the link expires in ${ttlHours} hours; until then your account keeps its current address):

${link}

If you didn't ask for this, you can ignore this email and nothing will change.`,
    html: layout(`<p>Hi ${escapeHtml(name)},</p>
<p>You asked to use this address for your Wordwright account.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f5d62;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Confirm this address</a></p>
<p style="font-size:14px">The link expires in ${ttlHours} hours; until then your account keeps its current address. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
<p style="font-size:14px">If you didn't ask for this, you can ignore this email and nothing will change.</p>`),
  }
}

/**
 * Goes to the *old* address, so a change the owner didn't make is noticed and can be undone. The link
 * only opens a page with a button: acting on a bare GET would let a mail scanner undo a real change.
 */
export function emailChangedEmail(input: {
  name: string
  newEmail: string
  undoLink: string
  undoDays: number
}): Content {
  const { name, newEmail, undoLink, undoDays } = input
  return {
    subject: 'Your email address was changed',
    text: `Hi ${name},

The email address for your Wordwright account was just changed to ${newEmail}. You'll sign in with the new address from now on, and we'll send account emails there instead of here.

If that was you, there's nothing to do. If it wasn't, someone knows your password. Within ${undoDays} days you can put this address back, sign everyone out and choose a new password here:

${undoLink}`,
    html: layout(`<p>Hi ${escapeHtml(name)},</p>
<p>The email address for your Wordwright account was just changed to <strong>${escapeHtml(newEmail)}</strong>. You'll sign in with the new address from now on, and we'll send account emails there instead of here.</p>
<p>If that was you, there's nothing to do. If it wasn't, someone knows your password. Within ${undoDays} days you can put this address back, sign everyone out and choose a new password.</p>
<p><a href="${escapeHtml(undoLink)}" style="display:inline-block;background:#2f5d62;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">This wasn't me</a></p>
<p style="font-size:14px">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${escapeHtml(undoLink)}</span></p>`),
  }
}
