import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/**
 * Authenticated encryption for secrets we must be able to read back (users' API keys).
 * `context` is bound into the ciphertext (as AES-GCM additional data), so a value copied
 * between rows, e.g. to another user's, fails to decrypt.
 */
export interface SecretBox {
  encrypt(plaintext: string, context: string): string
  decrypt(payload: string, context: string): string
}

/**
 * AES-256-GCM with a key derived from `secret`. Payloads are `v1.<iv>.<tag>.<ciphertext>`; the
 * version prefix leaves room for key rotation.
 */
export function createSecretBox(secret: string): SecretBox {
  const key = Buffer.from(hkdfSync('sha256', secret, 'wordwright-secret-box', 'v1', 32))
  return {
    encrypt(plaintext, context) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(Buffer.from(context))
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      return ['v1', iv, cipher.getAuthTag(), ciphertext]
        .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
        .join('.')
    },
    decrypt(payload, context) {
      const [version, iv, tag, ciphertext] = payload.split('.')
      if (version !== 'v1' || !iv || !tag || ciphertext === undefined)
        throw new Error('Unrecognised secret format')
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
      decipher.setAAD(Buffer.from(context))
      decipher.setAuthTag(Buffer.from(tag, 'base64url'))
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    },
  }
}
