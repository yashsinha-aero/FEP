# NERVE remediation: first batch

This batch addresses the browser response-header findings from the NERVE scan
of `iriitk.com` dated 30 June 2026. The report predates these changes; it is not
evidence of the current deployment's state.

## Findings addressed in code

| Severity | Report finding | Protection |
| --- | --- | --- |
| High | Missing Content-Security-Policy | An enforcing CSP restricts scripts, resources, embedding, base URLs and form submissions. |
| High | Missing X-Content-Type-Options | `nosniff` prevents browsers from guessing a different content type. |
| High | Missing X-Frame-Options | `SAMEORIGIN` limits embedding to the same origin. |
| High | Clickjacking Protection Missing | Both `X-Frame-Options` and CSP `frame-ancestors 'self'` protect against cross-origin embedding. |
| Medium | Missing Referrer-Policy | `strict-origin-when-cross-origin` omits paths and query strings from cross-origin referrers and omits referrers on HTTPS-to-HTTP requests. |

`firebase.json` already declared these headers before this batch. The Express
backend and Cloud Function did not send them. Both now use the shared middleware
in `functions/securityHeaders.js`, installed before CORS and body parsing so early
responses also receive the headers. The module lives inside `functions/` so that
Firebase includes it in function deployments. The Hosting and middleware CSPs
also gain `base-uri 'self'` and `form-action 'self'`.
See the [Firebase Hosting header configuration](https://firebase.google.com/docs/hosting/full-config#headers)
and [CSP directive reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
for the platform behavior and policy directives.

Existing Tailwind CDN scripts, Google Fonts, React inline styles, image previews,
Firebase endpoints and localhost development connections remain allowed. Inline
scripts and `eval` remain blocked. This CSP reduces exposure but does not replace
input validation or prevent every form of XSS.

## Validation

With Node.js 22.13 or newer and the backend dependencies installed:

```bash
npm --prefix server install
npm run test:security
```

The tests start the actual local backend with a disposable database and static
build fixtures. They check headers on HTML, JavaScript, HEAD requests, JSON API
responses, authentication errors, unknown API routes, malformed JSON and CORS
preflights. They also exercise the shared middleware using the Cloud Function's
CORS settings and check parity with Firebase Hosting. They do not contact Firebase
or a production database, and do not invoke the complete Cloud Function.

Validation in this checkout: all 11 security tests passed on Node.js 22.22.2.
The new middleware also passes the standalone Functions ESLint configuration.
The complete `functions` lint command is blocked: it inherits the root
`react-app` configuration, whose frontend dependencies were not installed for
these backend checks. Bypassing that inheritance exposes an existing parse error
on optional chaining in `functions/index.js`, because the Functions ESLint config
uses `ecmaVersion: 2018`. Those existing lint configuration issues need resolution
before the configured Functions predeploy lint can pass. The declared production
Functions runtime is Node.js 24; that runtime was not available for these checks.

## Deployment and verification

Repository changes take effect only after deploying the component serving each
response. Restart/redeploy the local Express service for its headers. For Firebase
Hosting, deploy the existing Hosting configuration with `firebase deploy --only
hosting`; deploy the API middleware with `firebase deploy --only functions:api`
after installing function dependencies and passing the configured predeploy lint.
No deployment is performed as part of this patch.

Check the final public response after deployment, including both the scanned
domain root and the FEP routes:

```bash
curl -sS -L -D - -o /dev/null https://iriitk.com/
curl -sS -L -D - -o /dev/null https://iriitk.com/fep/
curl -sS -L -D - -o /dev/null https://iriitk.com/fep/login
```

Also inspect a real built JavaScript or CSS URL and the deployed API URL. Confirm
the four headers in the table are present on the final responses; CSP must be
`Content-Security-Policy`, not just `Content-Security-Policy-Report-Only`. Smoke-test
login, forms, fonts and file previews in a browser for CSP violations. If a proxy
or CDN serves a different root application or replaces headers, its configuration
needs a corresponding update. Re-run NERVE against the deployed domain before
marking the public findings resolved.

## Deferred findings

The remaining high Email Security Score finding and medium DMARC, DKIM, CAA,
DNSSEC, certificate renewal and WAF findings require domain, mail-provider or
hosting changes and are deferred. Use the mail provider's actual DKIM values and
validate legitimate senders before changing DMARC enforcement. The certificate
expiry in the June report is historical and needs a fresh check.

The critical HSTS and low severity findings are outside this batch. The existing
Firebase HSTS and Permissions-Policy declarations are unchanged; this patch does
not establish whether the public domain is serving them.
