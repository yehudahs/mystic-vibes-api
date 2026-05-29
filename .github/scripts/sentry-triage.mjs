#!/usr/bin/env node
// Daily Sentry → GitHub Issue triage.
// Fetches unresolved issues from one Sentry project, filters out known-noise
// patterns, dedupes against already-open triage issues, and opens new GH issues
// for the rest. No code changes, no PRs — just gives a human (or Claude in a
// session) a clear queue to work from.
//
// Required env:
//   SENTRY_AUTH_TOKEN  — user auth token (event:read, project:read, org:read)
//   GITHUB_TOKEN       — GH Actions default token (issues:write on this repo)
//   GH_REPO            — owner/repo (the repo issues are opened in)
//   SENTRY_ORG         — Sentry org slug (e.g. mystic-vibes)
//   SENTRY_PROJECT     — Sentry project slug (e.g. mystic-vibes-frontend)

const {
  SENTRY_AUTH_TOKEN,
  GITHUB_TOKEN,
  GH_REPO,
  SENTRY_ORG,
  SENTRY_PROJECT,
} = process.env

for (const [k, v] of Object.entries({ SENTRY_AUTH_TOKEN, GITHUB_TOKEN, GH_REPO, SENTRY_ORG, SENTRY_PROJECT })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1) }
}

// Skip noisy / unactionable categories that flood the queue with non-bugs.
// Reviewed inventory on 2026-05-26: these patterns covered ~70% of open issues
// across both projects and were all dev-setup / env-config / expected-behavior.
const SKIP_TITLE_PATTERNS = [
  /EADDRINUSE/i,                       // local port collision, dev-only
  /does not exist/i,                   // DB schema not initialized
  /role .* does not exist/i,           // DB role not created
  /JWT_SECRET/i,                       // env config (already required at boot)
  /API_KEY.*not set/i,                 // env config
  /Pass it to the constructor/i,       // env config (Resend missing key)
  /AxiosError: Request failed with status code 401/i, // expected (token expiry)
]

const sentry = async (path) => {
  const r = await fetch(`https://sentry.io/api/0${path}`, {
    headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
  })
  if (!r.ok) throw new Error(`Sentry ${r.status} ${path}: ${await r.text()}`)
  return r.json()
}

const gh = async (method, path, body) => {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sentry-triage',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!r.ok) throw new Error(`GH ${r.status} ${method} ${path}: ${await r.text()}`)
  return r.json()
}

const issuesPath = `/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/`
  + `?query=is%3Aunresolved+age%3A-14d&limit=50`

const all = await sentry(issuesPath)
console.log(`Fetched ${all.length} unresolved Sentry issues (age:-14d)`)

const fixable = all.filter((i) => {
  if (SKIP_TITLE_PATTERNS.some((p) => p.test(i.title || ''))) return false
  // Sentry doesn't always populate `environment` at the issue level; we keep
  // this filter loose and rely on title-based skips above for most noise.
  return true
})
console.log(`${fixable.length} survive the conservative filter`)

// Dedupe: don't reopen the same Sentry issue if we already have an open GH
// issue for it. We tag every triage GH issue with the Sentry shortId in
// brackets at the start of the title, e.g. "[MYSTIC-VIBES-FRONTEND-6] ...".
const existing = await gh('GET', `/repos/${GH_REPO}/issues?state=open&labels=sentry-triage&per_page=100`)
const seen = new Set(
  existing
    .map((iss) => (iss.title.match(/^\[([A-Z0-9-]+)\]/) || [])[1])
    .filter(Boolean),
)
console.log(`${seen.size} existing open triage issues on GH`)

let opened = 0
for (const issue of fixable) {
  if (seen.has(issue.shortId)) {
    console.log(`  skip ${issue.shortId} (already has open GH issue)`)
    continue
  }

  // Pull latest event for the top in-app stack frame.
  let topFrame = null
  try {
    const event = await sentry(`/issues/${issue.id}/events/latest/`)
    for (const entry of event.entries || []) {
      if (entry.type !== 'exception') continue
      for (const exc of entry.data?.values || []) {
        const frames = (exc.stacktrace?.frames || []).slice().reverse()
        topFrame = frames.find((f) => f.inApp) || topFrame
      }
    }
  } catch (e) {
    console.log(`  warn: couldn't fetch event for ${issue.shortId}: ${e.message}`)
  }

  const body = [
    `**Sentry:** ${issue.permalink}`,
    `**Short ID:** \`${issue.shortId}\``,
    `**Level:** ${issue.level}  ·  **Count:** ${issue.count} events / ${issue.userCount} users`,
    `**First seen:** ${issue.firstSeen}  ·  **Last seen:** ${issue.lastSeen}`,
    '',
    '### Title',
    issue.title,
    '',
    topFrame
      ? `### Top in-app frame\n\`${topFrame.filename}:${topFrame.lineno}\` — \`${topFrame.function || '?'}\``
      : `### Stack trace\n_(no in-app frames — likely a third-party dep; investigate the Sentry link before fixing)_`,
    '',
    '---',
    `_Auto-opened by [\`.github/workflows/sentry-triage.yml\`](.github/workflows/sentry-triage.yml). To fix: in a Claude session, say "work on issue #N"._`,
  ].join('\n')

  const created = await gh('POST', `/repos/${GH_REPO}/issues`, {
    title: `[${issue.shortId}] ${(issue.title || '').slice(0, 100)}`,
    body,
    labels: ['sentry-triage', 'from-sentry'],
  })
  console.log(`  opened #${created.number}: ${issue.shortId}`)
  opened++
}

console.log(`\nDone. Opened ${opened} new triage issue(s).`)
