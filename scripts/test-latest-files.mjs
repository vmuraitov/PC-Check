import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, utimes, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { findLatestFiles as scanFiles } from '../src/main/services/latest-files.ts'

const referenceDate = new Date(2026, 8, 20, 12)
const dayStart = new Date(2026, 8, 20).getTime() / 1000
const findLatestFiles = folder => scanFiles(folder, referenceDate)

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'custos-latest-files-test-'))
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()))
    assert.ok(root.includes('custos-latest-files-test-'))
    await rm(root, { recursive: true, force: true })
  })
  return root
}

async function file(root, name, seconds) {
  const path = join(root, name)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, 'fixture')
  await utimes(path, dayStart + seconds, dayStart + seconds)
  return path
}

test('selects two newest files independently in every folder, including deep and root files', async t => {
  const root = await fixture(t)
  await file(root, 'root.txt', 100)
  await file(root, 'Maps/old.txt', 100)
  await file(root, 'Maps/new.txt', 300)
  await file(root, 'Maps/middle.txt', 200)
  await file(root, 'Maps/Deep/deep.txt', 500)
  await file(root, 'Logs/only.txt', 400)
  const result = await findLatestFiles(root)
  assert.equal(result.scannedFiles, 6)
  assert.equal(result.scannedFolders, 4)
  assert.equal(result.skippedEntries, 0)
  const groups = new Map(result.groups.map(g => [g.relativePath, g.files.map(f => f.name)]))
  assert.deepEqual(groups.get(''), ['root.txt'])
  assert.deepEqual(groups.get('Maps'), ['new.txt', 'middle.txt'])
  assert.deepEqual(groups.get(join('Maps', 'Deep')), ['deep.txt'])
  assert.deepEqual(groups.get('Logs'), ['only.txt'])
  const latest = result.groups.find(g => g.relativePath === 'Maps').files[0]
  assert.equal(latest.modifiedAt, (dayStart + 300) * 1000)
  assert.equal(latest.size, 7)
  assert.equal(latest.path, join(result.folder, 'Maps', 'new.txt'))
})

test('handles empty folders, one file, and refreshed modification times', async t => {
  const root = await fixture(t)
  await mkdir(join(root, 'empty'))
  assert.deepEqual((await findLatestFiles(root)).groups, [])
  const a = await file(root, 'a.txt', 100)
  assert.equal((await findLatestFiles(root)).groups[0].files.length, 1)
  await file(root, 'b.txt', 200)
  await file(root, 'c.txt', 300)
  await utimes(a, dayStart + 400, dayStart + 400)
  assert.deepEqual((await findLatestFiles(root)).groups[0].files.map(f => f.name), ['a.txt', 'c.txt'])
})

test('breaks equal modification-time ties consistently by path', async t => {
  const root = await fixture(t)
  for (const name of ['c.txt', 'a.txt', 'b.txt']) await file(root, name, 100)
  assert.deepEqual((await findLatestFiles(root)).groups[0].files.map(f => f.name), ['a.txt', 'b.txt'])
})

test('skips a junction loop instead of recursively following it', async t => {
  const root = await fixture(t)
  await file(root, 'one.txt', 100)
  await symlink(root, join(root, 'loop'), process.platform === 'win32' ? 'junction' : 'dir')
  const result = await findLatestFiles(root)
  assert.equal(result.scannedFiles, 1)
  assert.equal(result.scannedFolders, 1)
  assert.equal(result.skippedEntries, 1)
})

test('rejects missing roots and ordinary files', async t => {
  const root = await fixture(t)
  await assert.rejects(findLatestFiles(join(root, 'missing')))
  const path = await file(root, 'file.txt', 100)
  await assert.rejects(findLatestFiles(path), /not a folder/)
})

test('includes both edges of the local day and excludes yesterday, tomorrow and the same day of another month', async t => {
  const root = await fixture(t)
  const nextDay = new Date(2026, 8, 21).getTime() / 1000 - dayStart
  await file(root, 'yesterday.txt', -1)
  await file(root, 'midnight.txt', 0)
  await file(root, 'last-second.txt', nextDay - 1)
  await file(root, 'tomorrow.txt', nextDay)
  await file(root, 'old-month/file.txt', new Date(2026, 7, 20, 12).getTime() / 1000 - dayStart)
  const result = await findLatestFiles(root)
  assert.equal(result.scanDate, dayStart * 1000)
  assert.equal(result.scannedFiles, 5)
  assert.equal(result.groups.length, 1)
  assert.deepEqual(result.groups[0].files.map(f => f.name), ['last-second.txt', 'midnight.txt'])
})

test('refresh uses the new calendar date, including month and year rollover', async t => {
  const root = await fixture(t)
  const oldDate = new Date(2026, 11, 31, 23, 59)
  const newDate = new Date(2027, 0, 1, 0, 1)
  await file(root, 'old.txt', oldDate.getTime() / 1000 - dayStart)
  await file(root, 'new.txt', newDate.getTime() / 1000 - dayStart)
  assert.deepEqual((await scanFiles(root, oldDate)).groups[0].files.map(f => f.name), ['old.txt'])
  assert.deepEqual((await scanFiles(root, newDate)).groups[0].files.map(f => f.name), ['new.txt'])
})

test('defaults to the actual current date without a date argument', async t => {
  const root = await fixture(t)
  await writeFile(join(root, 'now.txt'), 'today')
  const result = await scanFiles(root)
  assert.deepEqual(result.groups[0].files.map(f => f.name), ['now.txt'])
})

test('applies limits 2, 7 and 30 independently per folder, keeping only today in descending order', async t => {
  const root = await fixture(t)
  for (const directory of ['Maps', 'Logs']) {
    for (let i = 1; i <= 35; i++) await file(root, `${directory}/${i}.txt`, i * 60)
    await file(root, `${directory}/yesterday.txt`, -1)
    await file(root, `${directory}/tomorrow.txt`, 90000)
  }
  for (const limit of [2, 7, 30]) {
    const result = await scanFiles(root, referenceDate, limit)
    assert.equal(result.limit, limit)
    assert.equal(result.groups.length, 2)
    for (const group of result.groups) {
      assert.deepEqual(group.files.map(f => f.name), Array.from({ length: limit }, (_, i) => `${35 - i}.txt`))
    }
  }
})

test('rejects invalid file limits', async t => {
  const root = await fixture(t)
  for (const limit of [0, 1, 31, -2, 2.5, NaN, Infinity, '10', null]) {
    await assert.rejects(scanFiles(root, referenceDate, limit), /from 2 to 30/)
  }
})
