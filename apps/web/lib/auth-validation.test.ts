import { test } from "node:test";
import assert from "node:assert/strict";

import {
  authErrorMessage,
  cleanText,
  emailSchema,
  nameSchema,
  otpSchema,
  passwordChecks,
  passwordProblem,
  passwordStrength,
  usernameSchema,
  validateNewPassword,
  validateSignUp,
} from "./auth-validation";

test("emails are trimmed, lower-cased and checked", () => {
  assert.equal(emailSchema.parse("  Gowtham@Example.COM "), "gowtham@example.com");
  assert.equal(emailSchema.safeParse("not-an-email").success, false);
  assert.equal(emailSchema.safeParse("a@b").success, false);
  assert.equal(emailSchema.safeParse("x".repeat(250) + "@a.io").success, false);
  // Injection-looking input is just an invalid email; it never reaches SQL as text.
  assert.equal(emailSchema.safeParse("a@b.com' OR '1'='1").success, false);
});

test("usernames: lower-case letters, numbers, underscores, 3-20, not reserved", () => {
  assert.equal(usernameSchema.parse("  Gowtham_18 "), "gowtham_18");
  assert.equal(usernameSchema.safeParse("ab").success, false);
  assert.equal(usernameSchema.safeParse("a".repeat(21)).success, false);
  assert.equal(usernameSchema.safeParse("bad name").success, false);
  assert.equal(usernameSchema.safeParse("robert'); drop table--").success, false);
  assert.equal(usernameSchema.safeParse("<script>").success, false);
  assert.equal(usernameSchema.safeParse("admin").success, false);
});

test("names lose invisible characters and extra spaces", () => {
  assert.equal(cleanText(" Go​tham ‮  G "), "Gotham G");
  assert.equal(nameSchema.parse("  Gowtham   G  "), "Gowtham G");
  assert.equal(nameSchema.safeParse("A").success, false);
});

test("password rules", () => {
  assert.equal(passwordProblem("short1"), "Use at least 8 characters.");
  assert.equal(passwordProblem("onlyletters"), "Include at least one letter and one number.");
  assert.equal(passwordProblem("password123"), "That password is too common. Pick something harder to guess.");
  assert.equal(passwordProblem("gowtham2024!", { email: "gowtham@example.com" }), "Don't use your email in your password.");
  assert.equal(passwordProblem("journal_k9_2024", { username: "journal_k9" }), "Don't use your username in your password.");
  assert.equal(passwordProblem("é".repeat(37) + "1"), "That password is too long (72 bytes max).");
  assert.equal(passwordProblem("Quiet-River-82"), null);
  assert.equal(passwordStrength(""), 0);
  assert.equal(passwordStrength("password123"), 0);
  assert.equal(passwordStrength("Quiet-River-82"), 4);
  assert.deepEqual(passwordChecks("abc").map((c) => c.ok), [false, true, false, false]);
});

test("sign-up validation returns cleaned values or per-field errors", () => {
  const ok = validateSignUp({ email: " Me@Example.com", username: "Me_Writes", password: "Quiet-River-82", confirm: "Quiet-River-82" });
  assert.deepEqual(ok.values, { email: "me@example.com", username: "me_writes", password: "Quiet-River-82" });
  const bad = validateSignUp({ email: "nope", username: "x", password: "abc", confirm: "abd" });
  assert.equal(bad.values, undefined);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["confirm", "email", "password", "username"]);
  assert.equal(validateNewPassword("Quiet-River-82", "Quiet-River-83").confirm, "The passwords don't match.");
});

test("one-time codes are digits only", () => {
  assert.equal(otpSchema.parse(" 123 456 "), "123456");
  assert.equal(otpSchema.safeParse("12a456").success, false);
  assert.equal(otpSchema.safeParse("12345").success, false);
});

test("auth errors are friendly and never confirm whether an email exists", () => {
  assert.equal(authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }), "Email or password is incorrect.");
  assert.equal(authErrorMessage({ status: 429, message: "x" }), "Too many attempts. Please wait a minute and try again.");
  assert.match(authErrorMessage({ code: "otp_expired" }), /expired/);
  assert.equal(authErrorMessage(null), "Something went wrong. Please try again.");
});
