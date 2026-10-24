# Publication pictures live in SQLite, are raster-only, and are sniffed

A picture is up to 1 MB, in its own table (so listing publications never reads image bytes), served by an authenticated
route with `nosniff`. The type comes from the file's leading bytes, not the declared Content-Type, and SVG is not
accepted (script, same origin). No object-storage port yet: nothing else needs one, and moving it behind a port is
easy when it does (hosting is D3). The per-user cap on owned publications (25) bounds storage.
