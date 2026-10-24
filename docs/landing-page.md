# The public site: landing page and blog

Read this when you build or change `wordwright.io`, or write words that describe Wordwright to someone outside it. How the product is described in one line is in [CONTEXT.md](../CONTEXT.md#describing-wordwright); this page says where that goes on the public site and what the rest of the page says. Closes #171 and the page half of #348.

## What it is

`wordwright.io` is a static site, apart from the app. It says what Wordwright is and why, and holds the blog. The app is at `app.wordwright.io` and keeps sending a signed-out `/` to sign-in (decided with #22). The site is a Jekyll site on the `gh-pages` branch, which GitHub Pages builds itself. Help and legal pages stay in the app (`/help`, #321), because a feature change must update its help page in the same commit.

**Who it is for:** a writer who has just heard of Wordwright, from the blog, an email or a friend. It also serves a reviewer who got an invitation and wants to know what the tool is.

**What it asks them to do:** create an account (primary) or sign in. It says plainly that the alpha is private and accounts are approved by hand.

**What it does not have:** testimonials, pricing, a feature grid, hype words ("powerful", "smart", "AI-powered"), exclamation marks or emoji. It follows the [style guide](style-guide.md): British English, sentence case, "your AI".

## The page

The header on every page of the site is the mark and the name, then **Blog** and **Sign in**. Sections, in order:

### 1. Top

- Heading: **Wordwright**
- Line: “Wordwright helps people who love writing to do more of it.”
- Below it: “Wordwright helps spark ideas, research different perspectives, work out what to say, and improve your drafts, but it never writes your words for you.”
- Primary button: **Create an account**. Secondary link: **Sign in**. Both go to `app.wordwright.io`.
- Under them: “Wordwright is in private alpha. We approve accounts by hand and email you when yours is ready.”

### 2. What it helps with

One heading, “What it helps with”, then five short items in the app's own words (CONTEXT.md):

- **Scan.** “Look over the recent posts from feeds you choose, for something to respond to.”
- **Research.** “Find articles that back up what you think, and articles that challenge it.”
- **Refine.** “Talk an idea through with your AI. It asks the questions and keeps your answers as notes.”
- **Critique.** “Get comments on the parts of a draft that are hard to follow or could be misread. You decide what to do with them.”
- **Rephrase.** “Stuck on a title or an opening? Say what the wording should do and choose between different options.”

### 3. Your words stay yours

The five principles, close to the blog's wording:

- **No AI when it isn't needed.** “You find things to write about through feeds you subscribe to, not an AI search.”
- **Your AI asks, and you answer.** “To refine your idea, your AI acts as a coach and keeps your words so you have them later.”
- **Purposeful limits.** “A critique can always find something wrong, and writing is never perfect. You get three critiques of a draft by default, and then it's time to publish.”
- **Options, not suggestions.** “When rephrasing, you say what you want a passage to do then choose which option to use, and edit it.”
- **Challenge, not flattery.** “Research looks for articles that disagree with you. A critique says what to strengthen; it doesn't tell you the writing is rubbish or perfect.”

Then one line: “You could do all this with your own prompts. Wordwright makes it the default, so you don't have to hold the line yourself.”

### 4. What you need

- “Bring your own AI key. Wordwright has no AI key of its own, and you pay your provider directly. Today that is Anthropic.” Links to the app's `/help/api-key`.
- “Wordwright is a private alpha. To try it, create an account, or write to jeni@wordwright.io.”

### 5. Why I built it

“Built by Jeni Tennison.” Link: **Read why I built it** → the first blog post.

### Footer

The site name and, once they exist (#321), links to the app's privacy notice, terms and accessibility statement. Until then there are none.

### Page metadata

`<title>`: “Wordwright”. Meta description: the line in section 1. Favicon, touch icon and mark are the ones already on `gh-pages`.

## The blog

- Jekyll with the **`github-pages` gem** (so local builds match what Pages builds; `Gemfile.lock` committed), kramdown for Markdown, and `jekyll-feed` for the Atom feed at `/feed.xml`. No remote theme.
- Our own layouts and one `style.css`: the Ember palette copied from `apps/web/src/theme/palette-ember.css` (light and dark by system setting), IBM Plex Sans self-hosted from `/fonts/`, no third-party requests. Checked at 390px and with axe, once by hand.
- `/blog/` lists posts newest first, by title and date. A post is `_posts/YYYY-MM-DD-slug.md`, so the URL is `/blog/<slug>/`. `.nojekyll` is removed on the new branch only.
- **First post:** Jeni's introductory post, her words unedited. The only change is that “drop me a line” links to `mailto:jeni@wordwright.io`. The site's copy is canonical.
- Preview with `bundle exec jekyll serve`; a short README on the branch says so.

## How it ships

1. All the work is on **`gh-pages-next`**, cut from `gh-pages`, in its own worktree. The live site stays the “Coming soon” page until launch.
2. Before launch the owner reviews it locally.
3. On launch day, merge `gh-pages-next` into `gh-pages`. The first post's filename and `date:` are set to that day in the merge commit. (Jekyll hides a post dated in the future, so a later date would also let a post appear by itself.)
4. Pages builds in legacy mode from `gh-pages`; HTTPS is enforced and the certificate is issued for `wordwright.io`.

## Not in the first version

- **Screenshots** of the app wait until the pre-launch reviews (#325, #326) have settled the screens, then are retaken from the running app and added.
- **Putting the description into `reviewInvitationEmail`** (text and HTML, with tests), and into the README and sign-in pages. Each is its own issue.
- Several pages, a help area on the static site, comments, analytics and a mailing list.
