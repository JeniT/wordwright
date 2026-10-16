import { Hono } from 'hono'
import { deleteCookie, getCookie } from 'hono/cookie'
import {
  BrainstormPromptInputSchema,
  CRITIQUE_ROUNDS_DEFAULT,
  CritiqueSettingsSchema,
  ChangeHandleInputSchema,
  ChangeNameInputSchema,
  ChangeEmailInputSchema,
  ChangePasswordInputSchema,
  DeleteAccountInputSchema,
  TutorialSeenInputSchema,
  TutorialUpdateSchema,
} from '@wordwright/core'
import { requireUser, SESSION_COOKIE, type AppEnv } from '../auth/middleware'
import type { RateLimiter } from '../auth/rate-limit'
import type { AccountService } from '../services/accounts'
import type { EmailChangeService } from '../services/email-change'
import type { BrainstormPromptService } from '../services/brainstorm-prompt'
import type { UserSettingsStore } from '../db/user-settings'
import { validateJson } from '../validate'
import { toHttpError } from './auth'
import { fail } from '../errors'
import { param } from './params'
import type { ExportService } from '../services/export'
import { throttleExport, zipResponse } from './zip-response'

export function accountRoutes(
  accounts: AccountService,
  emailChanges: EmailChangeService,
  limiter: RateLimiter,
  brainstormPrompts: BrainstormPromptService,
  handleChangeLimiter: RateLimiter,
  userSettings: UserSettingsStore,
  exports: ExportService,
  exportLimiter: RateLimiter,
) {
  return (
    new Hono<AppEnv>()
      .use(requireUser(accounts))
      // All their publications, as Markdown (#167). A reviewer-only account gets 404 from `requireUser`, as for every
      // route outside its reviews.
      .get('/export', (c) => {
        const user = c.get('user')
        throttleExport(exportLimiter, user.id)
        return zipResponse(c, exports.account(user))
      })
      // Where they are signed in, and ending those sessions (#165). Ids are the page's own names for sessions, never
      // the cookie, and every one is checked against the signed-in person, so another person's id is a 404.
      .get('/sessions', (c) =>
        c.json(accounts.listDevices(c.get('user'), getCookie(c, SESSION_COOKIE)!)),
      )
      .delete('/sessions', (c) =>
        c.json({
          count: accounts.signOutOtherDevices(c.get('user'), getCookie(c, SESSION_COOKIE)!),
        }),
      )
      .delete('/sessions/:id', (c) => {
        accounts.signOutDevice(c.get('user'), getCookie(c, SESSION_COOKIE)!, param(c, 'id'))
        return c.body(null, 204)
      })
      // Guessing the current password is the attack here, so attempts are throttled per person.
      .post('/password', validateJson(ChangePasswordInputSchema), async (c) => {
        const user = c.get('user')
        if (!limiter.allow(user.id)) throw fail(429, 'Too many attempts')
        const { currentPassword, newPassword } = c.req.valid('json')
        const sessionToken = getCookie(c, SESSION_COOKIE)!
        await accounts
          .changePassword(user, sessionToken, currentPassword, newPassword)
          .catch(toHttpError)
        return c.json({ ok: true })
      })
      // Guessing the password is the attack here too; and each request emails a stranger.
      .post('/email', validateJson(ChangeEmailInputSchema), async (c) => {
        const user = c.get('user')
        if (!limiter.allow(user.id)) throw fail(429, 'Too many attempts')
        const { newEmail, password } = c.req.valid('json')
        await emailChanges.request(user, newEmail, password).catch(toHttpError)
        return c.json({ ok: true })
      })
      // Costs nothing and guesses nothing, so it only gets the light per-person throttle.
      .put('/name', validateJson(ChangeNameInputSchema), (c) => {
        const user = c.get('user')
        if (!limiter.allow(user.id)) throw fail(429, 'Too many attempts')
        return c.json(accounts.toPublic(accounts.changeName(user, c.req.valid('json').name)))
      })
      // Each change retires a username for good, so changes are capped per person.
      .put('/handle', validateJson(ChangeHandleInputSchema), (c) => {
        const user = c.get('user')
        const { handle } = c.req.valid('json')
        // Saying "keep this one" isn't a change, so it doesn't use up the allowance.
        if (handle !== user.handle && !handleChangeLimiter.allow(user.id)) {
          throw fail(429, 'You have changed your username several times today. Try again tomorrow.')
        }
        try {
          return c.json(accounts.toPublic(accounts.changeHandle(user, handle)))
        } catch (err) {
          return toHttpError(err)
        }
      })
      .post('/password/setup-email', (c) => {
        const user = c.get('user')
        if (!limiter.allow(user.id)) throw fail(429, 'Too many attempts')
        try {
          accounts.requestPasswordSetup(user)
        } catch (err) {
          toHttpError(err)
        }
        return c.json({ ok: true })
      })
      // The person's own version of the brainstorming prompt (or the default, until they change it).
      .get('/brainstorm-prompt', (c) => c.json(brainstormPrompts.get(c.get('user').id)))
      .put('/brainstorm-prompt', validateJson(BrainstormPromptInputSchema), (c) =>
        c.json(brainstormPrompts.save(c.get('user').id, c.req.valid('json').prompt)),
      )
      // How many critiques a draft may have (the default until the person chooses).
      .get('/critique-settings', (c) =>
        c.json({
          rounds: userSettings.getCritiqueRounds(c.get('user').id) ?? CRITIQUE_ROUNDS_DEFAULT,
        }),
      )
      .put('/critique-settings', validateJson(CritiqueSettingsSchema), (c) => {
        userSettings.setCritiqueRounds(c.get('user').id, c.req.valid('json').rounds)
        return c.json(c.req.valid('json'))
      })
      // Tutorial mode (#198). `requireUser` keeps reviewer-only accounts out, and they never have it.
      .get('/tutorial', (c) => c.json(userSettings.getTutorial(c.get('user').id)))
      .put('/tutorial', validateJson(TutorialUpdateSchema), (c) => {
        const user = c.get('user')
        const { on, answered } = c.req.valid('json')
        if (on !== undefined) userSettings.setTutorialMode(user.id, on)
        if (answered !== undefined) userSettings.setTutorialAnswered(user.id, answered)
        return c.json(userSettings.getTutorial(user.id))
      })
      .post('/tutorial/seen', validateJson(TutorialSeenInputSchema), (c) => {
        const user = c.get('user')
        userSettings.addTutorialSeen(user.id, c.req.valid('json').kind)
        return c.json(userSettings.getTutorial(user.id))
      })
      .delete('/brainstorm-prompt', (c) => c.json(brainstormPrompts.reset(c.get('user').id)))
      .delete('/', validateJson(DeleteAccountInputSchema), async (c) => {
        const user = c.get('user')
        if (!limiter.allow(user.id)) throw fail(429, 'Too many attempts')
        const { confirmEmail, password, keepName } = c.req.valid('json')
        await accounts.deleteAccount(user, confirmEmail, password, keepName).catch(toHttpError)
        deleteCookie(c, SESSION_COOKIE, { path: '/' })
        return c.body(null, 204)
      })
  )
}
