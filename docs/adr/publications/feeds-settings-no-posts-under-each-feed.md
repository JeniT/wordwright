# Feeds settings: no posts under each feed (#258)

The settings list is just the feeds. A feed's posts are on Search, in one list with the feed's name, so showing them again under each feed was a second, slower way to the same thing. The failed-feed line now says to check the address or remove the feed, since the error detail was shown only in that preview. `GET …/sources/:sourceId/items` stays in the API for now, unused by the app; remove it if nothing needs it.
