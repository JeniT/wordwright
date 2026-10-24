# Users bring their own LLM key; no server-wide key

Why: the service shouldn't carry users' LLM costs. OpenAI offers "Sign in with ChatGPT" (partner-led); Anthropic's
terms (Feb 2026) disallow subscription OAuth in third-party apps and point to API keys, so API keys are the common
baseline. Keys are AES-256-GCM encrypted, bound to the user id, write-only in the UI. Losing `KEY_ENCRYPTION_SECRET`
loses all stored keys. In a shared publication, each request spends the requester's own key.
