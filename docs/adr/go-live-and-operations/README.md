# Decisions: go live and operations

Read this when you change hosting, production, backups, and the private alpha. One file per decision; the title says what was decided. Open the ones that touch your change.

- [Go live: hosting, domain and email (#22, #20)](go-live-hosting-domain-and-email.md): one UpCloud VM in London, SQLite, Caddy, Gandi, Scaleway
- [Off-site backups: Scaleway Object Storage, encrypted before upload (#17)](off-site-backups-scaleway-object-storage-encrypted-before-upload.md)
- [Private alpha: approval by the owner, and a small admin area (#315, #328)](private-alpha-approval-by-the-owner-and-a-small.md): sign-up needs the owner's approval via a small admin area
- [Production runs as two containers on one machine (#17)](production-runs-as-two-containers-on-one-machine.md): api and Caddy containers; exactly one api
