import { randomUUID } from 'node:crypto'
import { linkKey, MAX_IDEA_LINKS, MAX_IDEA_NOTES, MAX_NOTE_TAGS, type MoveResult } from '@lfwa/core'
import type { Owner } from '../db/owner'
import type { Store } from '../db/store'
import { fail } from '../errors'

/**
 * Moving reading items and notes between a profile's own lists and its ideas (and between ideas). Each move is
 * one transaction: it happens in full or not at all, refuses anything outside the profile, and is written to the
 * log of moves. What "move" keeps is written out in docs/decisions.md; in short:
 *
 * - A **reading item** moves with its read date, authors, tags, address, title, why and origin, and the notes taken
 *   from it go with it. If the destination already has an item with the same address, the two become one: the
 *   one already there stays, takes the moved item's tags too, and the moved item's notes now point at it.
 * - A **note** moves with its text, tags, author, origin and quotation mark, to the end of the destination's
 *   notes. The reading item it was taken from is *copied* to the destination (or the copy already there is used),
 *   so the note keeps its source without taking it away from other notes that came from it. It is no longer
 *   "added to a draft", since it has not been put into any of the new owner's drafts.
 */
export class MoveService {
  constructor(private readonly store: Store) {}

  /** `toIdeaId` null moves them to the profile's own reading list. */
  moveReading(
    profileId: string,
    userId: string,
    ids: string[],
    toIdeaId: string | null,
  ): MoveResult {
    const { reading, notes, ideas, moves } = this.store
    return this.store.transaction(() => {
      this.checkDestination(profileId, toIdeaId)
      const batchId = randomUUID()
      const toOwner = ownerFor(profileId, toIdeaId)
      const wanted = [...new Set(ids)].map((id) => {
        const found = reading.locate(profileId, id)
        if (!found) throw fail(404, 'Not found')
        return { id, ...found }
      })
      const going = wanted.filter((w) => w.ideaId !== toIdeaId)
      if (!going.length) throw fail(400, 'Those items are already there.')

      // Plan first. Who is at the destination already, by address: the item that stays when a moved one has the
      // same address (an item already there, else the first moved with that address); the rest are carried over.
      const dest = new Map<string, string>(
        reading.list(toOwner).map((l) => [linkKey(l.url), l.id] as const),
      )
      const plan = going.map((w) => {
        const key = linkKey(w.link.url)
        const keeper = dest.get(key)
        if (keeper) return { ...w, target: keeper, merges: true }
        dest.set(key, w.id)
        return { ...w, target: w.id, merges: false }
      })
      const carried = plan.reduce(
        (n, p) =>
          n +
          notes
            .byReadingItem(profileId, p.id)
            .filter((id) => notes.get(ownerFor(profileId, p.ideaId), id)).length,
        0,
      )
      if (
        toIdeaId &&
        reading.count(toOwner) + plan.filter((p) => !p.merges).length > MAX_IDEA_LINKS
      ) {
        throw fail(
          409,
          `${subject(toIdeaId)} can have up to ${MAX_IDEA_LINKS} links. Remove some you no longer need to make room.`,
        )
      }
      if (notes.count(toOwner) + carried > MAX_IDEA_NOTES) {
        throw fail(
          409,
          `${subject(toIdeaId)} can have up to ${MAX_IDEA_NOTES} notes, and moving these would pass that. Merge or delete some to make room.`,
        )
      }

      let merged = 0
      let noteCount = 0
      const touched = new Set<string>(toIdeaId ? [toIdeaId] : [])
      for (const p of plan) {
        const fromOwner = ownerFor(profileId, p.ideaId)
        if (p.ideaId) touched.add(p.ideaId)
        // The notes taken from the item go with it, and now point at whichever item stays.
        for (const noteId of notes.byReadingItem(profileId, p.id)) {
          if (!notes.get(fromOwner, noteId)) continue
          notes.moveTo(profileId, noteId, toIdeaId, p.target)
          moves.record(profileId, userId, batchId, {
            kind: 'note',
            itemId: noteId,
            fromIdeaId: p.ideaId,
            toIdeaId,
            merged: false,
          })
          noteCount++
        }
        if (p.merges) {
          // It joins the item already there, which counts as read if this one was.
          if (p.link.readAt && !reading.get(toOwner, p.target)?.readAt) {
            reading.setRead(toOwner, p.target, true)
          }
          // Its tags join the ones already there (each once, ignoring case; the most an item can hold).
          const have = reading.get(toOwner, p.target)?.tags ?? []
          const seen = new Set(have.map((t) => t.toLowerCase()))
          const joined = [...have, ...p.link.tags.filter((t) => !seen.has(t.toLowerCase()))]
          if (joined.length > have.length) {
            reading.setTags(toOwner, p.target, joined.slice(0, MAX_NOTE_TAGS))
          }
          reading.remove(fromOwner, p.id)
          merged++
        } else {
          reading.setOwner(profileId, p.id, toIdeaId)
        }
        moves.record(profileId, userId, batchId, {
          kind: 'reading',
          itemId: p.id,
          fromIdeaId: p.ideaId,
          toIdeaId,
          merged: p.merges,
        })
      }
      for (const id of touched) ideas.touch(id)
      return { batchId, readingItems: going.length, merged, copied: 0, notes: noteCount }
    })
  }

  /** `toIdeaId` null moves them to the profile's own notes. */
  moveNotes(profileId: string, userId: string, ids: string[], toIdeaId: string | null): MoveResult {
    const { reading, notes, ideas, moves } = this.store
    return this.store.transaction(() => {
      this.checkDestination(profileId, toIdeaId)
      const batchId = randomUUID()
      const toOwner = ownerFor(profileId, toIdeaId)
      const unique = [...new Set(ids)]
      const where = notes.locate(profileId, unique)
      if (where.size !== unique.length) throw fail(404, 'Not found')

      // In the order they are arranged where they are, one place after another.
      const going: { id: string; from: string | null; readingItemId: string | null }[] = []
      const places = [...new Set(unique.map((id) => where.get(id)!))]
      for (const from of places.filter((p) => p !== toIdeaId)) {
        const picked = new Set(unique.filter((id) => where.get(id) === from))
        for (const n of notes.list(ownerFor(profileId, from))) {
          if (picked.has(n.id)) going.push({ id: n.id, from, readingItemId: n.readingItemId })
        }
      }
      if (!going.length) throw fail(400, 'Those notes are already there.')
      if (notes.count(toOwner) + going.length > MAX_IDEA_NOTES) {
        throw fail(
          409,
          `${subject(toIdeaId)} can have up to ${MAX_IDEA_NOTES} notes, and moving these would pass that. Merge or delete some to make room.`,
        )
      }

      // Each source the notes were taken from needs a place at the destination: the item with that address if
      // it has one, else a copy.
      const there = new Map(reading.list(toOwner).map((l) => [linkKey(l.url), l.id]))
      const itemAt = new Map<string, string>() // "from|item id" -> item id at the destination
      let copies = 0
      const needed = new Set(
        going.filter((g) => g.readingItemId).map((g) => `${g.from}|${g.readingItemId}`),
      )
      const missing = [...needed].filter((k) => {
        const [from, itemId] = k.split('|') as [string, string]
        const item = reading.get(ownerFor(profileId, from === 'null' ? null : from), itemId)
        return item && !there.has(linkKey(item.url))
      })
      if (toIdeaId && reading.count(toOwner) + missing.length > MAX_IDEA_LINKS) {
        throw fail(
          409,
          `${subject(toIdeaId)} can have up to ${MAX_IDEA_LINKS} links, and the notes' sources would pass that. Remove some you no longer need to make room.`,
        )
      }
      for (const k of needed) {
        const [from, itemId] = k.split('|') as [string, string]
        const item = reading.get(ownerFor(profileId, from === 'null' ? null : from), itemId)
        if (!item) continue
        const key = linkKey(item.url)
        let target = there.get(key)
        if (!target) {
          target = reading.add(profileId, toIdeaId, item, item.origin).id
          there.set(key, target)
          copies++
        } else if (item.readAt && !reading.get(toOwner, target)?.readAt) {
          reading.setRead(toOwner, target, true)
        }
        itemAt.set(k, target)
      }

      const touched = new Set<string>(toIdeaId ? [toIdeaId] : [])
      for (const g of going) {
        if (g.from) touched.add(g.from)
        const target = g.readingItemId ? (itemAt.get(`${g.from}|${g.readingItemId}`) ?? null) : null
        notes.moveTo(profileId, g.id, toIdeaId, target)
        moves.record(profileId, userId, batchId, {
          kind: 'note',
          itemId: g.id,
          fromIdeaId: g.from,
          toIdeaId,
          merged: false,
        })
      }
      for (const id of touched) ideas.touch(id)
      return { batchId, readingItems: 0, merged: 0, copied: copies, notes: going.length }
    })
  }

  /** The idea must be one of this profile's. */
  private checkDestination(profileId: string, ideaId: string | null) {
    if (ideaId && !this.store.ideas.get(profileId, ideaId)) throw fail(404, 'Not found')
  }
}

const ownerFor = (profileId: string, ideaId: string | null): Owner => ideaId ?? { profileId }
const subject = (ideaId: string | null) => (ideaId ? 'An idea' : 'A profile')
