import { firstAvailable, slugify, type Draft, type IdeaLink, type IdeaNote } from '@wordwright/core'
import type { Store } from '../db/store'
import { zip, type ZipFile } from '../export/zip'

export interface ExportResult {
  filename: string
  bytes: Uint8Array
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

/** Text that continues a bullet on the lines below it. */
const indent = (text: string) => text.trim().replace(/\r?\n/g, '\n  ')
/** A name or title on one line, so it can't start a new heading or bullet. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()
const tagsOf = (tags: string[]) => (tags.length ? ` — tags: ${tags.map(oneLine).join(', ')}` : '')

const noteLine = (n: IdeaNote) =>
  `- ${n.quote ? 'Quote: ' : ''}${indent(n.text)} (${oneLine(n.authorName ?? 'a former member')}, ${longDate(n.createdAt)})${tagsOf(n.tags)}`

/** Articles record when they were added but not by whom, so that is all the credit there is to give. */
const readingLine = (l: IdeaLink) => {
  const address = l.url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')
  const parts = [`[${linkText(l.title || l.url)}](${address})`]
  if (l.authors.length) parts.push(`by ${l.authors.map(oneLine).join(', ')}`)
  if (l.readAt) parts.push(`read ${longDate(l.readAt)}`)
  if (l.addedAt) parts.push(`added ${longDate(l.addedAt)}`)
  return `- ${parts.join(', ')}${tagsOf(l.tags)}`
}

/** Text inside a link's brackets: a name with brackets in it must not end the link early. */
const linkText = (text: string) => oneLine(text).replace(/[[\]]/g, '')

const section = (heading: string, lines: string[]) =>
  lines.length ? `## ${heading}\n\n${lines.join('\n')}\n` : ''

/** Names a file after its title: lower-case letters, digits and hyphens only, so no title can name a path. */
function fileNamer() {
  const taken = new Set<string>()
  return (title: string) => {
    const name = firstAvailable(slugify(title) || 'untitled', (c) => taken.has(c), '-')
    taken.add(name)
    return name
  }
}

/**
 * Builds the zip of a person's own writing, as Markdown only (#167). What goes in depends on their role in each
 * publication: an owner gets every draft, a member the drafts they edit or started; notes and articles are everyone's
 * and are credited. Comments, snapshots and reviews, critiques, brainstorm chats, API keys and email addresses never
 * go in. Callers have checked that the person belongs to each publication.
 */
export class ExportService {
  constructor(
    private readonly store: Store,
    private readonly now: () => Date = () => new Date(),
  ) {}

  publication(publicationId: string, user: { id: string; name: string }): ExportResult {
    const day = this.day()
    return this.build(`wordwright-${publicationId}-${day}.zip`, [publicationId], user)
  }

  account(user: { id: string; name: string }): ExportResult {
    const ids = this.store.publications.listIdsForUser(user.id)
    return this.build(`wordwright-export-${this.day()}.zip`, ids, user)
  }

  private day() {
    return this.now().toISOString().slice(0, 10)
  }

  private build(filename: string, publicationIds: string[], user: { id: string; name: string }) {
    const root = `wordwright-export-${this.day()}`
    const files: ZipFile[] = []
    const publications: { name: string; role: 'owner' | 'member' }[] = []
    for (const id of publicationIds) {
      const role = this.store.publications.roleOf(id, user.id)
      if (!role) continue
      publications.push({ name: this.store.publications.get(id, user.id)!.name, role })
      files.push(...this.publicationFiles(`${root}/${id}`, id, user.id, role))
    }
    files.unshift({ path: `${root}/README.md`, content: this.readme(user.name, publications) })
    return { filename, bytes: zip(files, this.now()) }
  }

  private readme(name: string, publications: { name: string; role: 'owner' | 'member' }[]) {
    const owner = publications.some((p) => p.role === 'owner')
    const member = publications.some((p) => p.role === 'member')
    const rules = [
      owner &&
        '- As an owner of a publication, this includes every draft in it, including drafts other members edit.',
      member &&
        '- As a member of a publication, this includes the drafts you edit or started. Drafts other members edit or started are not included: they are theirs to export.',
      '- Notes and reading-list items from everyone in a publication are included. Notes name who wrote them; reading-list items show only when they were added, because that is all we record.',
    ].filter(Boolean)
    return `# Your writing from Wordwright

Exported on ${longDate(this.now().toISOString())} for ${name}. Everything here is plain Markdown: open it in any text editor or notes app. Links between the files are relative, so keep the folders together.

## What is in this export

${publications.map((p) => `- ${p.name} (you are ${p.role === 'owner' ? 'an owner' : 'a member'})`).join('\n')}

Each publication has a folder with a file about the publication, one file per idea (its notes, articles and drafts) and one file per draft.

## Who gets what

${rules.join('\n')}

## What is not in it

- Comments, from people or from the AI, and the critiques the AI wrote.
- Copies sent for review, and the people who reviewed them.
- Brainstorming conversations. Anything worth keeping from them should already be in your notes.
- API keys, and anyone's email address.
`
  }

  private publicationFiles(
    dir: string,
    publicationId: string,
    userId: string,
    role: 'owner' | 'member',
  ) {
    const { store } = this
    const publication = store.publications.get(publicationId, userId)!
    const started = new Set(store.drafts.startedBy(publicationId, userId))
    const all = new Map(store.drafts.list(publicationId).map((d) => [d.id, d]))
    const included = (d: Draft) => role === 'owner' || d.editorId === userId || started.has(d.id)

    const files: ZipFile[] = []
    const draftName = fileNamer()
    const draftFile = new Map<string, string>()
    for (const d of [...all.values()].filter(included)) {
      const name = draftName(d.title)
      draftFile.set(d.id, name)
      files.push({
        path: `${dir}/drafts/${name}.md`,
        content: `# ${oneLine(d.title) || 'Untitled'}\n\n${d.body.trimEnd()}\n`,
      })
    }

    const ideaName = fileNamer()
    const ideaLines: string[] = []
    for (const summary of store.ideas.list(publicationId)) {
      const idea = store.ideas.get(publicationId, summary.id)!
      const name = ideaName(idea.name)
      ideaLines.push(`- [${linkText(idea.name)}](ideas/${name}.md)`)
      const draftLines = idea.drafts.flatMap((d) => {
        const file = draftFile.get(d.id)
        if (!file) return []
        const full = all.get(d.id)!
        const handed = role === 'member' && full.editorId !== userId
        return `- [${linkText(d.title || 'Untitled')}](../drafts/${file}.md)${handed ? ' (now edited by someone else)' : ''}`
      })
      const left = idea.drafts.length - draftLines.length
      if (left > 0) {
        draftLines.push(
          `\n${left} draft${left === 1 ? '' : 's'} by other members ${left === 1 ? 'isn’t' : 'aren’t'} included.`,
        )
      }
      files.push({
        path: `${dir}/ideas/${name}.md`,
        content: [
          `# ${oneLine(idea.name)}\n\n[← ${linkText(publication.name)}](../${publicationId}.md)\n`,
          section('Drafts', draftLines),
          section('Notes', store.notes.list(idea.id).map(noteLine)),
          section('Articles', idea.links.map(readingLine)),
        ]
          .filter(Boolean)
          .join('\n'),
      })
    }

    const about = publication.description
      ? `## About this publication\n\n${publication.description.trim()}\n`
      : ''
    const site = publication.siteUrl ? `${publication.siteUrl}\n` : ''
    files.push({
      path: `${dir}/${publicationId}.md`,
      content: [
        `# ${oneLine(publication.name)}\n${site ? `\n${site}` : ''}`,
        about,
        section('Ideas', ideaLines),
        section('Notes not yet in an idea', store.notes.list({ publicationId }).map(noteLine)),
        section(
          'Articles not yet in an idea',
          store.reading.list({ publicationId }).map(readingLine),
        ),
      ]
        .filter(Boolean)
        .join('\n'),
    })
    return files
  }
}
