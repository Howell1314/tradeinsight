#!/usr/bin/env node
// Bans bare `await supabase.from(...).{upsert,insert,update,delete}(...)` calls
// that do not destructure { error }. Supabase-js does not throw on server errors —
// silent failures caused the 2026-04-11 → 2026-04-24 data-loss incident. See
// .learnings/schema-drift-silent-postgrest-errors.md.
//
// Good shape (left-hand `const { error } = await ...`):
//   const { error } = await supabase.from('trades').upsert({...})
//   if (error) throw error
//
// Bad shape (line starts with `await supabase.from`):
//   await supabase.from('trades').upsert({...})

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC_ROOT = 'src'
const BAD_LINE = /^\s*await\s+supabase\s*\.from\b/

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const problems = []
for (const file of walk(SRC_ROOT)) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (BAD_LINE.test(line)) {
      // Also ensure it's actually a mutation (upsert/insert/update/delete) — read
      // paths usually destructure `{ data, error }`, but a bare select that
      // ignores error is also suspect, so flag them too.
      problems.push({ file, line: i + 1, text: line.trim() })
    }
  })
}

if (problems.length) {
  console.error('✗ Found bare `await supabase.from(...)` calls that ignore { error }:')
  console.error('')
  for (const p of problems) console.error(`  ${p.file}:${p.line}  ${p.text}`)
  console.error('')
  console.error('supabase-js does NOT throw on server errors. Destructure { error } and throw:')
  console.error('  const { error } = await supabase.from(...).upsert(...)')
  console.error('  if (error) throw error')
  console.error('')
  console.error('See .learnings/schema-drift-silent-postgrest-errors.md for the full incident.')
  process.exit(1)
}

console.log('✓ All supabase mutations destructure { error } (scanned ' + walk(SRC_ROOT).length + ' files)')
