import { identityProviderContract } from '../testing/contracts'
import { FakeIdentityProvider } from './identity'

identityProviderContract('fake', async ({ identity }) => ({
  provider: new FakeIdentityProvider(identity),
  goodCode: 'good-code',
  badCode: 'bad-code',
  secrets: [],
}))
