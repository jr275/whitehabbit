# Extraction service

Wraps [`j0k3r/graby`](https://github.com/j0k3r/graby) and its
~1,960-rule site-config corpus behind one HTTP endpoint. This is the
Wallabag extraction quality Phase 1 identified as worth keeping,
isolated behind a contract our domain does not depend on the internals
of.

## Contract

```
POST /extract   { url, html }  → 200 { title, html, excerpt, authors[],
                                       date, language, image, siteName,
                                       siteConfigMatched, extractorVersion }
                               → 422 { error: extraction_empty|extraction_error, meta? }
                               → 413 { error: too_large }
GET  /healthz                  → 200 { ok, extractorVersion, siteConfigs }
```

## It never fetches

`html` is always supplied by the caller. Node performs the fetch behind
the SSRF guard with a pinned IP; graby is handed the bytes with
`setContentAsPrefetched()` and makes no outbound request. Deny egress on
this container: it needs none, and denying it means a compromise cannot
turn the service into an SSRF proxy.

## Local development

```
composer install
php -S 127.0.0.1:9123 -t public
EXTRACTOR_URL=http://127.0.0.1:9123 pnpm dev
```

Without `EXTRACTOR_URL` the application falls back to its built-in Node
extractor at reduced quality and logs that it is doing so.

## tidy

`ext-tidy` is a hard requirement of graby (HTML repair). The Dockerfile
installs it. Graby will run without it in a pinch, but output is
noticeably less clean on malformed documents.
