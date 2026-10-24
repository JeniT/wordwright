# wordwright.io

The public site: a landing page and a blog, built by GitHub Pages with Jekyll. The spec, with the words for every section, is
[docs/landing-page.md](https://github.com/JeniT/wordwright/blob/main/docs/landing-page.md) on `main`.

- Preview: `bundle install`, then `bundle exec jekyll serve`, and open http://localhost:4000.
- A post is `_posts/YYYY-MM-DD-slug.md`; its address is `/blog/<slug>/`. A post dated in the future is not published.
- The first post's date is set to launch day when `gh-pages-next` is merged into `gh-pages`.
- Colours are the Ember palette copied from `apps/web/src/theme/palette-ember.css` on `main`; change them there first.
