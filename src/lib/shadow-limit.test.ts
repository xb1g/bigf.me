import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@libsql/client'
import type { Client } from '@libsql/client'
import { GLOBAL_RULE, IP_RULE, clearShadowTries, countShadowTry, resetShadowLimitForTests, waitAfterTry } from './shadow-limit.ts'

const T0 = 1_800_000_000_000
let client: Client

beforeEach(() => {
  resetShadowLimitForTests()
  client = createClient({ url: ':memory:' })
})

test('waitAfterTry: allowed up to the limit, then waits until the window ends', () => {
  assert.equal(waitAfterTry(IP_RULE.maxTries, T0, IP_RULE, T0 + 1000), 0)
  assert.equal(waitAfterTry(IP_RULE.maxTries + 1, T0, IP_RULE, T0 + 1000), IP_RULE.windowMs - 1000)
  assert.equal(waitAfterTry(IP_RULE.maxTries + 1, T0, IP_RULE, T0 + IP_RULE.windowMs + 1), 0)
})

test('one IP gets 5 tries, the 6th waits', async () => {
  for (let i = 0; i < IP_RULE.maxTries; i++) assert.equal(await countShadowTry(client, '1.1.1.1', T0 + i), 0)
  assert.ok((await countShadowTry(client, '1.1.1.1', T0 + 10)) > 0)
  // Another IP is not affected by the first one's limit.
  assert.equal(await countShadowTry(client, '2.2.2.2', T0 + 11), 0)
})

test('the IP window resets after 15 minutes', async () => {
  for (let i = 0; i <= IP_RULE.maxTries; i++) await countShadowTry(client, '1.1.1.1', T0)
  assert.ok((await countShadowTry(client, '1.1.1.1', T0 + 1000)) > 0)
  assert.equal(await countShadowTry(client, '1.1.1.1', T0 + IP_RULE.windowMs), 0)
})

test('a correct PIN clears the IP count', async () => {
  for (let i = 0; i <= IP_RULE.maxTries; i++) await countShadowTry(client, '1.1.1.1', T0)
  await clearShadowTries(client, '1.1.1.1')
  assert.equal(await countShadowTry(client, '1.1.1.1', T0 + 1), 0)
})

test('tries spread over many IPs hit the global limit', async () => {
  for (let i = 0; i < GLOBAL_RULE.maxTries; i++) assert.equal(await countShadowTry(client, `10.0.0.${i}`, T0), 0)
  assert.ok((await countShadowTry(client, '10.0.1.1', T0)) > 0)
})

test('parallel tries from one IP are all counted', async () => {
  const waits = await Promise.all(Array.from({ length: 20 }, () => countShadowTry(client, '3.3.3.3', T0)))
  assert.equal(waits.filter((w) => w === 0).length, IP_RULE.maxTries)
})

test('one IP hammering the PIN does not use up everyone\'s tries', async () => {
  for (let i = 0; i < 200; i++) await countShadowTry(client, '6.6.6.6', T0)
  // Only its 5 allowed tries reached the global count, so the owner's IP still gets in.
  assert.equal(await countShadowTry(client, '7.7.7.7', T0 + 1), 0)
})
