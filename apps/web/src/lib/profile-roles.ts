/**
 * What owners and members can do in a profile, in words, written once so every place that talks about it (the
 * confirmation before changing someone's role, the invitation form) says the same thing. When a rule changes in
 * the API, change it here too.
 */
export const OWNER_ABILITIES = [
  'change the profile’s name, website and picture',
  'invite people and remove them',
  'make other members owners, or remove other owners',
  'move a draft to another editor when its editor is away',
  'end the review of any draft',
  'delete the profile',
]

export const MEMBER_ABILITIES = [
  'read and comment on every draft',
  'add ideas and notes',
  'edit the drafts they are the editor of',
]
