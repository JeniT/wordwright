import { loadConfig } from './config'
import { openStore } from './db/store'
import { setAdminByEmail } from './services/admin'

const [command, email] = process.argv.slice(2).filter((a) => a !== '--')
if ((command !== 'grant' && command !== 'revoke') || !email) {
  console.error('Usage: pnpm --filter @wordwright/api admin grant|revoke <email>')
  process.exit(1)
}

const store = openStore(loadConfig().DATABASE_PATH)
const result = setAdminByEmail(store, email, command === 'grant')
const messages = {
  done: command === 'grant' ? `${email} is now an admin.` : `${email} is no longer an admin.`,
  'no-account': `There is no account for ${email}. They need to sign up first.`,
  unconfirmed: `${email} has not confirmed their email address yet. They need to before they can be an admin.`,
}
console.log(messages[result])
process.exit(result === 'done' ? 0 : 1)
