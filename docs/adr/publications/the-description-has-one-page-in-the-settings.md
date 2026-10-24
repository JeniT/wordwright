# The description has one page, in the settings (#241)

`/p/:id/describe` and the Description section of the settings had two save forms for the same text. There is now one:
`/p/:id/settings/description`, `h1` "Description", with the wording from the content crit (#235). `/describe` redirects to it,
and the publication page's "Describe this publication" step links straight there. Since it is a settings page, **saving
stays on the page** with "Saved", and "Skip for now" / "Cancel" are gone: the menu is the way out, and nothing needs a
description to carry on. It can also be cleared (the old page could only replace it). Its route has `meta.tutorial`, so
the one tutorial line (what the page is for) shows in tutorial mode.
