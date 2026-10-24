# Sessions: opaque cookie, hashed in the database

`HttpOnly`, `SameSite=Lax`, 30 days; only the SHA-256 is stored; revoked on password change/deletion. Writes are also
checked against `Origin`. Chosen over JWTs so sessions can be revoked.
