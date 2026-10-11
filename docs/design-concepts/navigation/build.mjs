// Generates the navigation mock-ups: the same nine pages, in three navigation approaches.
//   A  "The menu follows you": the left menu changes with where you are and lists the steps.
//   B  "Steady menu, steps on the page": the left menu never changes; numbered steps sit in a strip under the title.
//   C  "The menu is a map": one tree shows every level at once, with the ideas nested under the profile.
// The page bodies are identical in all three (only the navigation differs), so they compare fairly.
// Usage: node docs/design-concepts/navigation/build.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ———————————————————————————————————————————————— the shape of the app

const USER = 'Maya Okafor'
const PROFILE = 'Notes from the Allotment'
const IDEA = 'What the allotment taught me about editing'
const PROFILES = [
  {
    name: PROFILE,
    letter: 'N',
    tint: 1,
    host: 'notesfromtheallotment.example',
    note: 'Shared with 1 person',
  },
  { name: 'Slow Systems', letter: 'S', tint: 3, host: 'slowsystems.example', note: '' },
  { name: 'Maya on Mondays', letter: 'M', tint: 2, host: 'mayaonmondays.example', note: '' },
]
const IDEAS = [
  { name: IDEA, notes: 9, sources: 6, drafts: 1, when: 'Worked on 2 hours ago', current: true },
  {
    name: 'Seed catalogues as a genre',
    notes: 4,
    sources: 3,
    drafts: 0,
    when: 'Worked on yesterday',
  },
  {
    name: 'The case for slow revision',
    notes: 12,
    sources: 8,
    drafts: 2,
    when: 'Worked on last week',
  },
  {
    name: 'A short history of the compost heap',
    notes: 1,
    sources: 0,
    drafts: 0,
    when: 'Worked on last month',
  },
]

// level -> its numbered steps. `file` is the mock page for that step; `meta` is the quiet line under it.
const STEPS = {
  profile: [
    { key: 'inspiration', label: 'Inspiration', file: 'profile-inspiration', meta: '12 new posts' },
    { key: 'notes', label: 'Notes', file: 'profile-notes', meta: '23 notes' },
    { key: 'ideas', label: 'Ideas', file: 'profile-ideas', meta: '4 ideas' },
  ],
  idea: [
    { key: 'research', label: 'Research', file: 'idea-research', meta: '6 sources' },
    { key: 'notes', label: 'Notes', file: 'idea-notes', meta: '9 notes' },
    { key: 'refine', label: 'Refine', file: 'idea-refine', meta: 'Brainstorm' },
    { key: 'draft', label: 'Draft', file: 'idea-draft', meta: '1 draft' },
    { key: 'publish', label: 'Publish', file: 'idea-publish', meta: '' },
  ],
}
const n1 = (n, one, many) => `${n} ${n === 1 ? one : many}`
const num = (i) => String(i + 1).padStart(2, '0')

// ———————————————————————————————————————————————— small parts

const tile = (p, size = 'mark-md') =>
  `<span class="source-letter ${size} tint-${p.tint}" aria-hidden="true">${p.letter}</span>`

/** The numbered badge. `current` fills it. */
const badge = (i, current = false, big = false) =>
  `<span class="step-num ${current ? 'step-num-current' : ''} ${big ? '!h-9 !min-w-10 !text-base' : ''}">${num(i)}</span>`

const crumbs = (items) =>
  `<nav aria-label="Breadcrumb" class="meta mb-3"><ol class="flex flex-wrap items-center gap-x-2">${items
    .map(([label, href], i) =>
      i === items.length - 1
        ? `<li aria-current="page" class="truncate">${label}</li>`
        : `<li><a class="link" href="${href}">${label}</a><span aria-hidden="true" class="ml-2">/</span></li>`,
    )
    .join('')}</ol></nav>`

/** The title of a step page. The numeral ties the page to the menu without saying "you must do this first". */
function heading(ctx) {
  if (ctx.level === 'home') return `<h1 class="h1">${ctx.title}</h1>`
  const steps = STEPS[ctx.level]
  const i = steps.findIndex((s) => s.key === ctx.step)
  return `<h1 class="h1 flex items-center gap-3">${badge(i, true, true)}${ctx.title}</h1>`
}

function nextStep(ctx) {
  if (ctx.level === 'home') return ''
  const steps = STEPS[ctx.level]
  const i = steps.findIndex((s) => s.key === ctx.step)
  const next = steps[i + 1]
  const what = ctx.nextHint
  if (!next)
    return `<nav aria-label="Next" class="mt-12 border-t border-line pt-6"><p class="meta">${ctx.endHint}</p></nav>`
  return `<nav aria-label="Next step" class="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
    <p class="meta max-w-md">${what}</p>
    <a href="${next.file}.html" class="btn btn-outline">Next: ${num(i + 1)} ${next.label} <span aria-hidden="true">→</span></a></nav>`
}

// ———————————————————————————————————————————————— page bodies (identical in every approach)

const post = (
  title,
  src,
  when,
  added = false,
) => `<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
  <div class="min-w-[14rem] flex-1"><a href="#" class="link font-medium">${title}</a><p class="meta">${src} · ${when}</p></div>
  ${added ? '<span class="chip chip-ok">On your reading list</span>' : '<button class="btn btn-neutral btn-sm">Add to reading list</button>'}</li>`

const reading = (
  title,
  src,
  read,
) => `<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
  <input type="checkbox" ${read ? 'checked' : ''} aria-label="Mark “${esc(title)}” as read" />
  <div class="min-w-[14rem] flex-1"><a href="#" class="link font-medium">${title}</a><p class="meta">${src}</p></div>
  <a href="#" class="btn btn-neutral btn-sm">Read and take notes</a></li>`

const note = (text, tags = [], selected = false, quote = '') => `<li class="flex gap-3 px-4 py-3">
  <input type="checkbox" class="mt-1" ${selected ? 'checked' : ''} aria-label="Select note" />
  <div class="min-w-0 flex-1"><p>${text}</p>${quote ? `<p class="meta mt-1">Quote · ${quote}</p>` : ''}
  <p class="mt-1 flex flex-wrap gap-1.5">${tags.map((t) => `<span class="chip">${t}</span>`).join('')}</p></div>
  <button class="btn btn-quiet btn-sm self-start" aria-label="Edit note">Edit</button></li>`

const bodies = {
  home: {
    level: 'home',
    title: 'Your profiles',
    body: () => `
<p class="mb-8 max-w-prose">A profile is a place you publish. Choose one to carry on where you left off.</p>
<ul class="grid gap-4 sm:grid-cols-2">${PROFILES.map(
      (
        p,
        i,
      ) => `<li><a href="profile-ideas.html" class="card flex h-full items-center gap-4 p-4">${tile(p)}
        <span class="min-w-0"><span class="block truncate text-lg font-semibold">${p.name}</span>
        <span class="meta block truncate">${p.host}</span>${p.note ? `<span class="meta block">${p.note}</span>` : ''}
        <span class="meta block">${['4 ideas · 12 new posts', '2 ideas', '1 idea'][i]}</span></span></a></li>`,
    ).join('')}</ul>
<a href="#" class="btn btn-primary mt-6">New profile</a>
<section class="mt-12" aria-labelledby="recent"><h2 id="recent" class="h2 mb-3">Recent activity</h2>
  <div class="panel-sunken border-dashed p-5"><p class="meta">Later: what changed since you were last here, such as new posts in your feeds or a collaborator’s notes.</p></div></section>`,
  },

  'profile-inspiration': {
    level: 'profile',
    step: 'inspiration',
    title: 'Inspiration',
    eyebrow: PROFILE,
    nextHint:
      'Read what you’ve gathered and take notes from it. Then the notes can be clustered into ideas.',
    body: () => `
<p class="mb-8 max-w-prose">Posts from the feeds you follow. Add the ones worth reading to your reading list, then read them and take notes.</p>
<div class="grid gap-8 lg:grid-cols-2">
  <section aria-labelledby="posts"><div class="mb-3 flex items-baseline justify-between"><h2 id="posts" class="h2">Latest posts</h2><a href="#" class="link meta">Manage feeds (6)</a></div>
    <ul class="panel divide-y divide-line">
      ${post('The case for slow revision', 'Harbour Quarterly', 'today')}
      ${post('How working editors actually cut', 'The Dispatch', 'yesterday', true)}
      ${post('Notes on pruning fruit trees', 'Open Methods', '3 days ago')}
      ${post('Against “kill your darlings”', 'Kestrel Press', 'last week')}
    </ul></section>
  <section aria-labelledby="rl"><div class="mb-3 flex items-baseline justify-between"><h2 id="rl" class="h2">Reading list</h2><span class="meta">4 items · 1 read</span></div>
    <ul class="panel divide-y divide-line">
      ${reading('How working editors actually cut', 'The Dispatch', true)}
      ${reading('Why seed catalogues sell a dream', 'Kestrel Press', false)}
      ${reading('The compost heap, explained', 'Lumen Journal', false)}
      ${reading('Pruning as an editing metaphor', 'Harbour Quarterly', false)}
    </ul></section>
</div>`,
  },

  'profile-notes': {
    level: 'profile',
    step: 'notes',
    title: 'Notes',
    eyebrow: PROFILE,
    nextHint:
      'When a cluster of notes feels like something you’d write about, turn it into an idea.',
    body: () => `
<p class="mb-8 max-w-prose">Everything you’ve noted from your reading, across all your sources. Group notes that belong together; a good group is an idea.</p>
<div class="space-y-8">
  <section aria-labelledby="c1"><div class="mb-3 flex flex-wrap items-baseline justify-between gap-3"><h2 id="c1" class="h2">Pruning and trust <span class="meta font-normal">(5 notes)</span></h2><a href="#" class="btn btn-outline btn-sm">Make an idea from this group</a></div>
    <ul class="panel divide-y divide-line">${note('A cut is a question you ask the plant.', ['pruning'])}${note('Take out a third, and take it from the middle.', ['pruning'], false, 'The Dispatch')}${note('Fear of cutting is fear of losing the credit for having grown it.', ['trust'])}</ul></section>
  <section aria-labelledby="c2"><div class="mb-3 flex flex-wrap items-baseline justify-between gap-3"><h2 id="c2" class="h2">Not yet grouped <span class="meta font-normal">(18 notes)</span></h2><button class="btn btn-neutral btn-sm">Group 2 selected</button></div>
    <ul class="panel divide-y divide-line">${note('Seed catalogues sell a better version of next year.', [], true)}${note('Every compost heap is a slow edit of last season.', [], true)}${note('Revision is a conversation with a text that cannot answer back.', [], false, 'Harbour Quarterly')}</ul></section>
</div>`,
  },

  'profile-ideas': {
    level: 'profile',
    step: 'ideas',
    title: 'Ideas',
    eyebrow: PROFILE,
    endHint: 'Choose an idea to carry on with, or start a new one.',
    body: () => `
<div class="mb-8 flex flex-wrap items-end justify-between gap-4"><p class="max-w-prose">Choose what to work on next.</p><a href="#" class="btn btn-primary">New idea</a></div>
<ul class="space-y-3">${IDEAS.map(
      (
        idea,
      ) => `<li><a href="idea-notes.html" class="card flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4 ${idea.current ? '!border-accent' : ''}">
        <span class="min-w-[16rem] flex-1"><span class="block text-lg font-semibold">${idea.name}</span><span class="meta block">${idea.when}</span></span>
        <span class="flex flex-wrap gap-1.5"><span class="chip">${n1(idea.sources, 'source', 'sources')}</span><span class="chip">${n1(idea.notes, 'note', 'notes')}</span><span class="chip">${n1(idea.drafts, 'draft', 'drafts')}</span></span>
        ${idea.current ? '<span class="btn btn-outline btn-sm">Continue</span>' : ''}</a></li>`,
    ).join('')}</ul>
${nextStep({ level: 'profile', step: 'ideas', endHint: 'Choose an idea to carry on with, or start a new one.' })}`,
  },

  'idea-research': {
    level: 'idea',
    step: 'research',
    title: 'Research',
    eyebrow: IDEA,
    nextHint: 'Read your sources and take notes from them, then tidy the notes.',
    body: () => `
<p class="mb-8 max-w-prose">Gather what this idea builds on. Add links yourself, pick from your profile’s reading list, or ask the assistant to find pages worth reading.</p>
<div class="space-y-10">
  <section aria-labelledby="rl"><div class="mb-3 flex items-baseline justify-between"><h2 id="rl" class="h2">Reading list</h2><span class="meta">6 items · 2 read</span></div>
    <ul class="panel divide-y divide-line">${reading('The case for slow revision', 'Harbour Quarterly', true)}${reading('How working editors actually cut', 'The Dispatch', true)}${reading('Against “kill your darlings”', 'Kestrel Press', false)}${reading('Notes on pruning fruit trees', 'Open Methods', false)}</ul>
    <form class="mt-4 flex max-w-xl flex-wrap gap-3"><label class="sr-only" for="addlink">Web address</label><input id="addlink" class="field min-w-[12rem] flex-1" placeholder="Add a link: example.org/an-article" /><button class="btn btn-neutral">Add link</button><a href="#" class="btn btn-neutral">Choose from the profile’s list</a></form></section>
  <section aria-labelledby="ai"><h2 id="ai" class="h2 mb-2">Find more with research</h2><p class="mb-3 max-w-prose">Describe what you want to look into. Your assistant searches the web; you choose what goes on the list.</p><a href="#" class="btn btn-outline">Start research</a></section>
</div>`,
  },

  'idea-notes': {
    level: 'idea',
    step: 'notes',
    title: 'Notes',
    eyebrow: IDEA,
    nextHint:
      'Happy with the notes? Talk the idea through with the assistant, which asks questions and records the points you make.',
    body: () => `
<p class="mb-6 max-w-prose">One thought to a note. Tag them by section, merge ones that belong together, and put them in order.</p>
<div class="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by tag"><span class="meta mr-1">Show</span><button class="btn btn-primary btn-sm" aria-pressed="true">All 9</button><button class="btn btn-neutral btn-sm">intro 3</button><button class="btn btn-neutral btn-sm">pruning 4</button><button class="btn btn-neutral btn-sm">ending 2</button></div>
<ul class="panel divide-y divide-line">
  ${note('The first thing my neighbour told me was that I had been too gentle.', ['intro'])}
  ${note('A cut is a question you ask the plant. It answers by growing.', ['pruning'], true)}
  ${note('Take out a third, and take it from the middle.', ['pruning'], true, 'The Dispatch')}
  ${note('Which shoot is doing the work, and which is only taking the light?', ['ending'])}
</ul>
<div class="mt-3 flex flex-wrap gap-2"><button class="btn btn-neutral btn-sm">Merge 2 selected</button><button class="btn btn-neutral btn-sm">Tag selected</button></div>
<form class="mt-8 max-w-xl"><label class="label" for="nn">Add a note</label><textarea id="nn" rows="3" class="field !min-h-0"></textarea><button class="btn btn-primary mt-3">Add note</button></form>`,
  },

  'idea-refine': {
    level: 'idea',
    step: 'refine',
    title: 'Refine',
    eyebrow: IDEA,
    nextHint: 'When you know what you want to say, start a draft.',
    body: () => `
<p class="mb-8 max-w-prose">Talk the idea through. The assistant asks questions and records the points you make as notes; it never writes for you.</p>
<section class="panel p-5"><h2 class="h2 mb-1">Your last conversation</h2><p class="meta mb-4">3 of 8 questions used · 2 notes recorded</p>
  <blockquote class="mb-4 border-l-[3px] border-accent pl-3">What did “wrong” feel like in the moment, and does that match how it feels to cut a paragraph you like?</blockquote>
  <div class="flex flex-wrap gap-3"><a href="#" class="btn btn-primary">Continue brainstorming</a><a href="#" class="btn btn-neutral">Start again</a></div></section>`,
  },

  'idea-draft': {
    level: 'idea',
    step: 'draft',
    title: 'Draft',
    eyebrow: IDEA,
    nextHint: 'When the draft is ready, prepare it to go out.',
    body: () => `
<p class="mb-8 max-w-prose">One draft for a single post, or several, in order, for a linked set. Open one to write; your notes sit beside it.</p>
<ul class="panel divide-y divide-line">
  <li><a href="#" class="flex flex-wrap items-center justify-between gap-3 px-4 py-4 no-underline"><span><span class="link font-semibold">Draft 1</span><span class="meta block">642 words · edited 4 minutes ago</span></span><span class="btn btn-outline btn-sm">Open in the editor</span></a></li>
</ul>
<button class="btn btn-neutral mt-4">New draft</button>`,
  },

  'idea-publish': {
    level: 'idea',
    step: 'publish',
    title: 'Publish',
    eyebrow: IDEA,
    endHint: 'Published? Your idea stays here with its notes, sources and drafts.',
    body: () => `
<p class="mb-8 max-w-prose">Get the finished piece ready to send out. You write the words; the assistant can offer alternatives to titles and openings you wrote.</p>
<div class="space-y-8">
  <section aria-labelledby="ch"><h2 id="ch" class="h2 mb-3">Before you publish</h2>
    <ul class="panel divide-y divide-line">${['Every link goes where it says', 'Quotes are marked and credited', 'A title you’re happy with', 'Read it aloud once'].map((t, i) => `<li class="flex items-center gap-3 px-4 py-3"><input type="checkbox" id="c${i}" ${i < 2 ? 'checked' : ''} /><label for="c${i}">${t}</label></li>`).join('')}</ul></section>
  <section aria-labelledby="alt"><h2 id="alt" class="h2 mb-1">Alternatives to what you wrote</h2><p class="meta mb-3">Titles and openings drawn from your draft. Choose, change or ignore.</p><a href="#" class="btn btn-outline">Suggest alternative titles</a></section>
</div>
${nextStep({ level: 'idea', step: 'publish', endHint: 'Published? Your idea stays here with its notes, sources and drafts.' })}`,
  },
}

// ———————————————————————————————————————————————— the three approaches

const skip = `<a href="#main" class="sr-only z-50 bg-surface px-4 py-2 font-semibold focus:not-sr-only focus:absolute focus:top-2 focus:left-2">Skip to content</a>`
const brand = `<a href="home.html" class="flex items-center gap-3 font-semibold no-underline"><span class="grid size-9 place-items-center rounded-ctl bg-accent text-sm text-on-accent" aria-hidden="true">W</span><span class="text-lg">Wordwright</span></a>`
const account = `<div class="border-t border-line p-4 md:mt-auto"><p class="meta">Signed in as</p><a href="#" class="link font-semibold">${USER}</a>
  <div class="mt-2 flex items-center justify-between gap-2"><button type="button" class="link">Sign out</button><button type="button" class="btn btn-quiet btn-sm" aria-pressed="false">Light</button></div></div>`

const switcher = `<div class="px-4 pb-3"><label class="meta mb-1 block" for="ps">Profile</label><select id="ps" class="field"><option>${PROFILE} (shared)</option><option>Slow Systems</option><option>Maya on Mondays</option></select></div>`

/** The mobile bar, shared: brand and a Menu button; the menu itself is the element with id side-menu. */
const mobileBar = (
  summary,
) => `<div class="flex items-center justify-between gap-3 px-5 py-4 md:py-5">${brand}
  <button type="button" class="btn btn-neutral btn-sm md:hidden" aria-controls="side-menu" aria-expanded="false" data-menu>Menu</button></div>
  ${summary ? `<p class="px-5 pb-3 md:hidden" data-summary>${summary}</p>` : ''}`

const stepItem = (
  s,
  i,
  active,
  cls = '',
) => `<li><a href="${s.file}.html" ${active ? 'aria-current="page"' : ''} class="group flex min-h-12 items-center gap-3 rounded-ctl px-3 py-1.5 no-underline hover:bg-sunken aria-[current=page]:bg-accent-wash aria-[current=page]:shadow-[inset_3px_0_0_var(--color-accent)] ${cls}">
  <span class="step-num group-aria-[current=page]:step-num-current">${num(i)}</span>
  <span class="min-w-0"><span class="block leading-tight font-medium group-aria-[current=page]:font-semibold">${s.label}</span>${s.meta ? `<span class="meta block">${s.meta}</span>` : ''}</span></a></li>`

const plainItem = (label, href, active, meta = '') =>
  `<li><a href="${href}" ${active ? 'aria-current="page"' : ''} class="flex min-h-11 items-center justify-between gap-3 rounded-ctl px-3 py-1.5 no-underline hover:bg-sunken aria-[current=page]:bg-accent-wash aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_3px_0_0_var(--color-accent)]">${label}${meta ? `<span class="meta">${meta}</span>` : ''}</a></li>`

const sidebarFrame = (
  inner,
  summary,
) => `<header class="border-b border-line bg-surface md:border-r md:border-b-0">
  <div class="md:sticky md:top-0 md:flex md:h-screen md:flex-col md:overflow-y-auto">
    ${mobileBar(summary)}
    <div id="side-menu" class="hidden flex-col md:flex md:flex-1">${inner}${account}</div>
  </div></header>`

const approaches = {
  // A — the menu follows you
  a: {
    name: 'The menu follows you',
    shell(ctx, inner) {
      const { level } = ctx
      let context = ''
      let nav
      let summary
      if (level === 'home') {
        nav = `<nav aria-label="Main" class="px-3 pb-3"><ul>${plainItem('Profiles', 'home.html', true)}${plainItem('Account settings', '#', false)}</ul></nav>`
        summary = ''
      } else if (level === 'profile') {
        const steps = STEPS.profile
        const i = steps.findIndex((s) => s.key === ctx.step)
        context = `<div class="px-5 pb-4"><a href="home.html" class="link text-sm">← All profiles</a>
          <div class="mt-3 flex items-center gap-3">${tile(PROFILES[0], 'mark-sm')}<div class="min-w-0"><p class="font-semibold leading-tight">${PROFILE}</p><p class="meta">Shared with 1 person</p></div></div></div>`
        nav = `<nav aria-label="Profile" class="px-3 pb-3"><ul>${steps.map((s, n) => stepItem(s, n, s.key === ctx.step)).join('')}</ul>
          <ul class="mt-3 border-t border-line pt-3">${plainItem('Profile settings', '#', false)}</ul></nav>`
        summary = `${esc(PROFILE)} · <strong>${num(i)} ${steps[i].label}</strong>`
      } else {
        const steps = STEPS.idea
        const i = steps.findIndex((s) => s.key === ctx.step)
        context = `<div class="px-5 pb-4"><a href="profile-ideas.html" class="link text-sm">← ${PROFILE}</a>
          <p class="meta mt-3">Idea</p><p class="font-semibold leading-snug">${IDEA}</p></div>`
        nav = `<nav aria-label="Idea" class="px-3 pb-3"><ul>${steps.map((s, n) => stepItem(s, n, s.key === ctx.step)).join('')}</ul>
          <ul class="mt-3 border-t border-line pt-3">${plainItem('Idea settings', '#', false)}</ul></nav>`
        summary = `${esc(IDEA)} · <strong>${num(i)} ${steps[i].label}</strong>`
      }
      return `${skip}<div class="min-h-screen md:grid md:grid-cols-[17rem_minmax(0,1fr)]">${sidebarFrame(context + nav, summary)}
        <main id="main" class="mx-auto w-full max-w-4xl min-w-0 px-4 py-8 sm:px-8 md:py-12">${ctx.eyebrow ? `<p class="meta mb-1">${esc(ctx.eyebrow)}</p>` : ''}${heading(ctx)}<div class="mt-6">${inner}</div>${ctx.level !== 'home' && ctx.step !== 'ideas' && ctx.step !== 'publish' ? nextStep(ctx) : ''}</main></div>`
    },
  },

  // B — a steady menu, steps on the page
  b: {
    name: 'Steady menu, steps on the page',
    shell(ctx, inner) {
      const { level } = ctx
      const nav = `<nav aria-label="Main" class="px-3 pb-3"><ul>${plainItem('Your profiles', 'home.html', level === 'home')}${plainItem('Account settings', '#', false)}</ul></nav>`
      let top = ''
      if (level !== 'home') {
        const steps = STEPS[level]
        const trail =
          level === 'profile'
            ? [['Your profiles', 'home.html'], [PROFILE]]
            : [['Your profiles', 'home.html'], [PROFILE, 'profile-ideas.html'], [IDEA]]
        const entity = level === 'profile' ? PROFILE : IDEA
        top = `${crumbs(trail.map(([l, h], i) => (i === trail.length - 1 ? [l] : [l, h])))}
          <p class="mb-3 text-lg font-semibold">${esc(entity)}</p>
          <nav aria-label="${level === 'profile' ? 'Profile steps' : 'Idea steps'}" class="mb-8 flex items-end justify-between gap-4 border-b border-line">
            <ol class="-mb-px flex min-w-0 gap-1 overflow-x-auto">${steps
              .map(
                (s, i) =>
                  `<li class="shrink-0"><a href="${s.file}.html" ${s.key === ctx.step ? 'aria-current="page"' : ''} class="group flex min-h-12 items-center gap-2 border-b-[3px] border-transparent px-3 no-underline hover:bg-sunken aria-[current=page]:border-accent aria-[current=page]:font-semibold"><span class="step-num group-aria-[current=page]:step-num-current">${num(i)}</span>${s.label}</a></li>`,
              )
              .join('')}</ol>
            <a href="#" class="link shrink-0 pb-3 text-sm">${level === 'profile' ? 'Profile' : 'Idea'} settings</a></nav>`
      }
      const summary = level === 'home' ? '' : ''
      return `${skip}<div class="min-h-screen md:grid md:grid-cols-[16rem_minmax(0,1fr)]">${sidebarFrame(switcher + nav, summary)}
        <main id="main" class="mx-auto w-full max-w-4xl min-w-0 px-4 py-8 sm:px-8 md:py-12">${top}${heading(ctx)}<div class="mt-6">${inner}</div>${ctx.level !== 'home' && ctx.step !== 'ideas' && ctx.step !== 'publish' ? nextStep(ctx) : ''}</main></div>`
    },
  },

  // C — the menu is a map
  c: {
    name: 'The menu is a map',
    shell(ctx, inner) {
      const { level } = ctx
      const onProfile = level !== 'home'
      const profileSteps = STEPS.profile
      const ideaSteps = STEPS.idea
      const sub = (label, href, current, depth, meta = '', n = null) =>
        `<li><a href="${href}" ${current ? 'aria-current="page"' : ''} class="group flex min-h-10 items-center gap-2 rounded-ctl py-1 pr-3 no-underline hover:bg-sunken aria-[current=page]:bg-accent-wash aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_3px_0_0_var(--color-accent)] ${depth === 1 ? 'pl-5' : depth === 2 ? 'pl-9' : depth === 3 ? 'pl-12' : 'pl-3'}">${n !== null ? `<span class="step-num !h-6 !min-w-7 !text-xs group-aria-[current=page]:step-num-current">${num(n)}</span>` : ''}<span class="min-w-0 flex-1 truncate">${label}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</a></li>`
      const group = (title) =>
        `<p class="px-3 pt-3 pb-1 text-xs font-semibold text-ink-soft">${title}</p>`
      const tree = `<nav aria-label="Main" class="px-3 pb-3">
        <ul>${sub('Your profiles', 'home.html', level === 'home', 0)}</ul>
        ${
          onProfile
            ? `<div class="mt-1 ml-3 border-l border-line pl-1">${group(PROFILE)}<ul>
          ${profileSteps.map((s, n) => sub(s.label, s.file + '.html', level === 'profile' && ctx.step === s.key, 0, s.key === 'ideas' ? '' : '', n)).join('')}
          ${level === 'idea' || ctx.step === 'ideas' ? `<li><ul class="ml-2 border-l border-line pl-1">${IDEAS.map((idea, k) => (k === 0 ? `<li>${group('')}<p class="px-3 py-1 text-sm font-semibold leading-snug">${esc(idea.name)}</p><ul class="mb-1">${ideaSteps.map((s, n) => sub(s.label, s.file + '.html', level === 'idea' && ctx.step === s.key, 0, '', n)).join('')}</ul></li>` : `<li><a href="#" class="block rounded-ctl px-3 py-2 text-sm no-underline hover:bg-sunken">${esc(idea.name)}</a></li>`)).join('')}</ul></li>` : ''}
          <li class="mt-1 border-t border-line pt-1"><ul>${sub('Profile settings', '#', false, 0)}</ul></li></ul></div>`
            : `<ul class="mt-1 ml-3 border-l border-line pl-1">${PROFILES.slice(0)
                .map(
                  (p) =>
                    `<li><a href="profile-ideas.html" class="block rounded-ctl px-3 py-2 no-underline hover:bg-sunken">${esc(p.name)}</a></li>`,
                )
                .join('')}</ul>`
        }
        <ul class="mt-3 border-t border-line pt-2">${sub('Account settings', '#', false, 0)}</ul></nav>`
      const summary = level === 'home' ? '' : level === 'profile' ? esc(PROFILE) : esc(IDEA)
      const trail =
        level === 'home'
          ? ''
          : level === 'profile'
            ? crumbs([['Your profiles', 'home.html'], [PROFILE]])
            : crumbs([['Your profiles', 'home.html'], [PROFILE, 'profile-ideas.html'], [IDEA]])
      return `${skip}<div class="min-h-screen md:grid md:grid-cols-[18rem_minmax(0,1fr)]">${sidebarFrame(tree, summary)}
        <main id="main" class="mx-auto w-full max-w-4xl min-w-0 px-4 py-8 sm:px-8 md:py-12">${trail}${heading(ctx)}<div class="mt-6">${inner}</div>${ctx.level !== 'home' && ctx.step !== 'ideas' && ctx.step !== 'publish' ? nextStep(ctx) : ''}</main></div>`
    },
  },
}

// ———————————————————————————————————————————————— write

const script = `<script>
  (function () {
    var q = new URLSearchParams(location.search).get('theme');
    if (q) document.documentElement.setAttribute('data-theme', q);
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.querySelector('[data-menu]'); if (!b) return;
      var m = document.getElementById('side-menu'), s = document.querySelector('[data-summary]');
      b.addEventListener('click', function () {
        var open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', String(open));
        m.classList.toggle('hidden', !open); m.classList.toggle('flex', open);
        if (s) s.classList.toggle('hidden', open);
      });
      if (new URLSearchParams(location.search).get('menu') === 'open') b.click();
    });
  })();
</script>`

for (const [id, approach] of Object.entries(approaches)) {
  const dir = join(root, id)
  mkdirSync(dir, { recursive: true })
  for (const [file, page] of Object.entries(bodies)) {
    // The ideas page ends with its own "next" note, so the shared footer is skipped for it (see the shells).
    const ctx = { ...page }
    const inner = page.body()
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(page.title)} · ${approach.name}</title>
    <link rel="stylesheet" href="../theme.css" />
    ${script}
  </head>
  <body>
    ${approach.shell(ctx, inner)}
  </body>
</html>
`
    writeFileSync(join(dir, `${file}.html`), html)
  }
}

writeFileSync(
  join(root, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Navigation concepts</title>
<style>body{font:18px/1.6 system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1rem;color:#2a2420;background:#f8f5f1}a{color:#b0440c}li{margin:.2rem 0}</style></head><body>
<h1>Navigation concepts</h1>${Object.entries(approaches)
    .map(
      ([id, a]) =>
        `<h2>${id.toUpperCase()}: ${a.name}</h2><ul>${Object.entries(bodies)
          .map(([f]) => `<li><a href="${id}/${f}.html">${f}</a></li>`)
          .join('')}</ul>`,
    )
    .join('')}</body></html>
`,
)
console.log('built', Object.keys(approaches).join(', '), Object.keys(bodies).length, 'pages each')
