/**
 * What owners and members can do in a profile, in words, written once so every place that talks about it (the
 * confirmation before changing someone's role, the invitation form) says the same thing. When a rule changes in
 * the API, change it here too.
 */
export const OWNER_ABILITIES = [
  'change the profile’s name, website and picture',
  'invite people and remove members',
  'make members owners, or remove owners (you included)',
  'move a draft to another editor when its editor is away',
  'end the review of any draft',
  'delete the profile',
]

export const MEMBER_ABILITIES = [
  'read and comment on every draft',
  'add ideas and notes',
  'edit the drafts they are the editor of',
]

const sentence = (items: string[]) => new Intl.ListFormat('en').format(items)

/** The abilities above as a phrase ("a, b and c"), so every place that shows them reads the same. */
export const MEMBER_ABILITIES_TEXT = sentence(MEMBER_ABILITIES)
export const OWNER_ABILITIES_TEXT = sentence(OWNER_ABILITIES)
