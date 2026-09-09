# tldts

Vendored browser bundle of `tldts` 7.4.10, used locally by the extension service
worker to evaluate registrable domains and Public Suffix List boundaries during
WebAuthn RP ID validation.

- Source: https://github.com/remusao/tldts/tree/v7.4.10
- Package: `tldts@7.4.10`
- Package SHA-256: `4a399c007960c8fc4d4f69c72dabf85745395c83d853e029cec542def592520a`
- Runtime network access: none
- License: MIT; see `LICENSE`

`index.umd.min.js` is copied from the package's `dist` directory. The source-map
reference was removed because source maps are not shipped with the extension.
