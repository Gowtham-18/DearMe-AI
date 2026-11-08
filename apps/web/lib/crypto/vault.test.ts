import { test } from "node:test";
import assert from "node:assert/strict";

import {
  __test,
  changePassphrase,
  checkPassphrase,
  enableVault,
  factKey,
  initVault,
  isSealed,
  lockDevice,
  newRecoveryCode,
  normalizeRecoveryCode,
  openJson,
  openText,
  openTextStrict,
  removeVault,
  sealJson,
  sealText,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  vault,
  VaultLockedError,
  type KeyRecord,
} from "./vault";

/** An in-memory journal_keys table: everything the server would hold. */
function memoryStore() {
  const rows = new Map<string, KeyRecord>();
  return {
    rows,
    async load(userId: string) {
      return rows.get(userId) ?? null;
    },
    async insert(record: KeyRecord) {
      if (rows.has(record.user_id)) return false;
      rows.set(record.user_id, { ...record });
      return true;
    },
    async update(userId: string, patch: Partial<KeyRecord>) {
      const row = rows.get(userId);
      if (!row) return false;
      rows.set(userId, { ...row, ...patch });
      return true;
    },
    async remove(userId: string) {
      return rows.delete(userId);
    },
  };
}

const USER = "a0000000-0000-4000-8000-000000000001";

test("without journal lock, text is stored as written", async () => {
  __test.useStore(memoryStore());
  assert.equal(await initVault(USER), "off");
  assert.equal(await sealText("hello"), "hello");
  assert.deepEqual(await sealJson(["a"]), ["a"]);
});

test("before the lock status is known, nothing is written as plain text", async () => {
  __test.useStore(memoryStore());
  await assert.rejects(sealText("too early"), VaultLockedError);
});

test("full lifecycle: enable, lock, unlock, recover, change passphrase, turn off", async () => {
  const store = memoryStore();
  __test.useStore(store);
  await initVault(USER);

  const enabled = await enableVault(USER, "lamp river orbit tea");
  assert.ok("recoveryCode" in enabled);
  const { recoveryCode } = enabled as { recoveryCode: string };
  assert.equal(vault.status(), "unlocked");

  // What the server holds reveals nothing: no passphrase, no recovery code, no plain key.
  const row = store.rows.get(USER)!;
  const serverCopy = JSON.stringify(row);
  assert.ok(!serverCopy.includes("lamp river"));
  assert.ok(!serverCopy.includes(normalizeRecoveryCode(recoveryCode)));
  assert.equal(row.kdf_iterations, 600_000);

  const entry = "I felt heavy today because I performed badly in the interview.";
  const sealed = await sealText(entry);
  assert.ok(isSealed(sealed));
  assert.ok(!sealed.includes("interview"));
  assert.notEqual(await sealText(entry), sealed, "a fresh IV each time");
  assert.equal(await openText(sealed), entry);
  assert.equal(await sealText(sealed), sealed, "sealing twice is a no-op");
  assert.deepEqual(await openJson(await sealJson({ crisis: false }), {}), { crisis: false });
  assert.equal(await openText("older plain text"), "older plain text");

  // Fact keys: stable, unreadable, and the same fact still merges.
  const key = await factKey("person:priya");
  assert.match(key, /^h:[0-9a-f]{48}$/);
  assert.equal(await factKey("Person:Priya"), key);
  assert.notEqual(await factKey("person:ben"), key);

  // Tampering is detected instead of returning garbage.
  const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.equal(await openText(tampered), "[This text couldn't be decrypted.]");
  await assert.rejects(openTextStrict(tampered));

  // Locking this device forgets the key: reading and writing need the passphrase again.
  await lockDevice();
  assert.equal(vault.status(), "locked");
  await assert.rejects(openText(sealed), VaultLockedError);
  await assert.rejects(sealText("new entry"), VaultLockedError);
  assert.equal(await unlockWithPassphrase("wrong passphrase!"), false);
  assert.equal(await unlockWithPassphrase("lamp river orbit tea"), true);
  assert.equal(await openText(sealed), entry);

  // The recovery code opens it too, typed loosely (lower case, spaces instead of dashes).
  await lockDevice();
  assert.equal(await unlockWithRecoveryCode(recoveryCode.toLowerCase().replace(/-/g, " ")), true);
  assert.equal(await openText(sealed), entry);

  // Change the passphrase with the recovery code: the old one stops working, data stays readable.
  assert.equal(await changePassphrase({ recoveryCode }, "new pass phrase 42"), true);
  await lockDevice();
  assert.equal(await unlockWithPassphrase("lamp river orbit tea"), false);
  assert.equal(await unlockWithPassphrase("new pass phrase 42"), true);
  assert.equal(await openText(sealed), entry);
  assert.equal(await checkPassphrase("new pass phrase 42"), true);
  assert.equal(await checkPassphrase("nope nope nope"), false);

  // Another device (fresh state, same server row) starts locked.
  __test.useStore(store);
  assert.equal(await initVault(USER), "locked");
  assert.equal(await unlockWithPassphrase("new pass phrase 42"), true);
  assert.equal(await openText(sealed), entry);

  assert.equal(await removeVault(), true);
  assert.equal(vault.status(), "off");
  assert.equal(store.rows.size, 0);
});

test("recovery codes are long, unambiguous and forgiving to type", () => {
  const code = newRecoveryCode();
  assert.match(code, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/);
  assert.ok(!/[01OILU]/.test(code.replace(/-/g, "")));
  assert.notEqual(newRecoveryCode(), code);
  assert.equal(normalizeRecoveryCode(" abcd-efgh "), "ABCDEFGH");
});
