# Validation errors answer `{ error: "message" }`

The `zValidator` default returns a raw zod object, which the UI showed as "[object Object]" (found by an e2e test;
the component tests mocked the server and missed it). `validateJson` (`apps/api/src/validate.ts`) returns the first
problem as a plain message. Every route that reads a JSON body uses it (T17), so a schema's messages are what people
see: give each rule you add a message written for them.
