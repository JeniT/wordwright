/** What is selected in the text: where, its words, and whether all of it is inside one paragraph (or list item, heading). */
export interface TextSelection {
  from: number
  to: number
  text: string
  sameBlock: boolean
}
