import { mailerContract } from '../testing/contracts'
import { MemoryMailer } from './mail'

mailerContract('memory', async () => {
  const mailer = new MemoryMailer()
  return { mailer, delivered: async () => mailer.outbox }
})
