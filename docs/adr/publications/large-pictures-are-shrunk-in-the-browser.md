# Large pictures are shrunk in the browser (#185)

A phone photo is several MB, and the limit is 1 MB, so the writer used to be told to resize it themselves. `ImageField` now redraws a
PNG, JPEG or WebP that is over 1 MB or over 512px on its longest side onto a canvas, in the same format (quality 0.9 for JPEG and
WebP), before it is uploaded. **In the browser, not the server**: no native image library to build and ship (`sharp` would tie the
Docker image and the host to a binary, which waits on D3, #22), and the bytes that reach the API are already small. **GIFs are
left alone**, because redrawing keeps one frame, so a big GIF is still refused with the old message. The server keeps every check
(size limit, sniffed type); the browser is a convenience, never trusted. A file the browser cannot decode now gets "could not be read
as a picture" at once, rather than the server's "not a PNG, JPEG, WebP or GIF" after an upload. While a picture is being read the field says so, and if another is chosen meanwhile the last one chosen wins. The storage port is separate (#9).
