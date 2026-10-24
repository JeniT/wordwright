# The working name "lfwa" is gone (#178)

The package scope is `@wordwright/*`, the cookies are `wordwright_session` and `wordwright_oauth`, the theme choice is stored
under `wordwright-theme`, notes are dragged as `application/x-wordwright-note`, and the key used to encrypt saved API keys is
derived with the context `wordwright-secret-box`. With nothing live, the cost is that existing sessions, saved API keys
(encrypted under the old context) and theme choices reset; development databases were already being deleted for #174.
