# Dependencies, licences and updates

Read this when you add or upgrade a dependency, change how updates arrive, or are asked what we ship and under
what terms.

## Versions in production

| What    | Version                            | Where it is pinned                                                                                 |
| ------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Node    | 24.22.1 (the 24 line, Active LTS)  | `.nvmrc` (CI) and `FROM node:24.22.1-slim` twice in `Dockerfile` (the api image)                   |
| pnpm    | 12.10.1                            | `packageManager` in `package.json`; CI (`pnpm/action-setup`) and the Dockerfile (Corepack) read it |
| Caddy   | the 2 line (`caddy:2-alpine`)      | `Dockerfile`, `web` target; serves static files only                                               |
| Package | exact versions in `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` everywhere, so a build never picks a newer release                |

`engines.node` stays `>=24`, a floor for developers. When you change Node, change `.nvmrc` and both `FROM` lines
together; Dependabot's Docker updates raise the `FROM` change and you complete the `.nvmrc` half in the same pull request.

## Direct dependencies

Reviewed 2026-10-25. Each one earns its place; the ones with a heavier footprint say why.

| Where  | Dependency                                                 | Why                                                                             |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `core` | `zod`                                                      | Validation at every boundary                                                    |
| `core` | `@anthropic-ai/sdk`                                        | The Anthropic adapter, behind a port                                            |
| `api`  | `hono`, `@hono/node-server`, `@hono/zod-validator`         | HTTP server                                                                     |
| `api`  | `jose`                                                     | Verifying Google sign-in (OpenID Connect) tokens                                |
| `api`  | `nodemailer`                                               | Sending sign-in email over SMTP                                                 |
| `api`  | `sharp`                                                    | Checking the shape of uploaded icons (native; Apache-2.0, bundles LGPL libvips) |
| `api`  | `fast-xml-parser`                                          | Reading RSS and Atom idea sources                                               |
| `api`  | `tsx`                                                      | Runs the TypeScript workspace at run time (see the Dockerfile header)           |
| `web`  | `vue`, `vue-router`, `pinia`, `@tanstack/vue-query`        | The app                                                                         |
| `web`  | `@tiptap/*`                                                | The draft editor                                                                |
| `web`  | `markdown-it`                                              | Rendering Markdown with raw HTML off                                            |
| `web`  | `tailwindcss`, `@tailwindcss/vite`, `@phosphor-icons/core` | Styling and icons for the Ember design system                                   |

Everything else in `devDependencies` is build, test or lint tooling and does not reach the images. `mailparser` and
`smtp-server` are test helpers for the email tests.

Not taken up on purpose: the major upgrades `typescript` 7, `msw` 3 and `@anthropic-ai/sdk` 1. Each needs its own
issue, because each can change behaviour.

## Vulnerabilities

`pnpm audit` found no known vulnerabilities on 2026-10-25, after the update pass that fixed these (all from the
security review, #317):

| Severity | Package       | Fixed by moving to |
| -------- | ------------- | ------------------ |
| High     | `zod`         | 4.6.7              |
| High     | `markdown-it` | 15.0.3             |
| Moderate | `nodemailer`  | 10.2.1             |

The same pass moved `undici` (a dependency of the evals' test tooling), `mailparser` and `smtp-server` past advisories.
Run `pnpm audit` before a release. A new high or critical advisory blocks the release until the dependency is updated or
removed.

## Licences

`scripts/check-licences.mjs` is the source of truth for this list. `pnpm check` runs it, and it fails when anything shipped (`pnpm licenses list --prod`)
has a licence outside the list below. Reading a new licence and adding it here and in the script is the review.

| Licence      | Packages (snapshot, 2026-10-25)                                             | Obligation                        |
| ------------ | --------------------------------------------------------------------------- | --------------------------------- |
| MIT          | 150, including vue, hono, tiptap, zod, jose, markdown-it, the Anthropic SDK | Keep the copyright notice         |
| MIT-0        | `nodemailer`                                                                | None                              |
| ISC          | `graceful-fs`, `picocolors`, `semver`                                       | Keep the copyright notice         |
| BSD-2-Clause | `entities`                                                                  | Keep the notice                   |
| BSD-3-Clause | `source-map-js`                                                             | Keep the notice                   |
| Apache-2.0   | `sharp`, `detect-libc`                                                      | Keep the licence and NOTICE files |
| PSF-2.0      | `argparse`                                                                  | Keep the notice                   |
| Unlicense    | `fast-sha256`                                                               | None                              |
| MPL-2.0      | `lightningcss` (a build tool; none of its code is in what we serve)         | Share changes to its own files    |

No copyleft licence applies to code we ship. `sharp` is Apache-2.0 but loads libvips (LGPL-3.0) as a separate
prebuilt library, which we use unmodified. The npm packages keep their licence files in `node_modules`, and the
images are built from them, so the notices travel with the code.

## Update automation

- **Version updates:** `.github/dependabot.yml` raises a weekly pull request for npm minor and patch releases, and
  separate pull requests for GitHub Actions, the Docker base images and npm major releases. CI must be green before one
  is merged, like any other change.
- **Release age:** pnpm's supply-chain policy refuses to install a release that is only hours old
  (`minimumReleaseAge`; the one exception is listed in `pnpm-workspace.yaml` with its reason). When an urgent
  security fix is younger than that, add it to `minimumReleaseAgeExclude`, and remove it once it has aged.
- **Security alerts and security updates:** repository settings, not files. They are switched on under Settings →
  Code security (Dependabot alerts, Dependabot security updates), or with:

  ```bash
  gh api -X PUT repos/JeniT/wordwright/vulnerability-alerts
  gh api -X PUT repos/JeniT/wordwright/automated-security-fixes
  ```

  Check with `gh api repos/JeniT/wordwright --jq .security_and_analysis`.
