import { createHash, randomBytes } from 'node:crypto'

/** 256 bits of randomness, URL-safe. This is what goes in cookies and emailed links. */
export const generateToken = () => randomBytes(32).toString('base64url')

/** What we store. High-entropy tokens don't need a slow hash. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
