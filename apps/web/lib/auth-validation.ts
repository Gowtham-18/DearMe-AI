/**
 * Input rules for sign-up, log-in, password reset and the account page.
 *
 * These checks are for a clear, early message in the form. The real guards sit behind them:
 * Supabase Auth validates emails and passwords and stores passwords as bcrypt hashes; the database
 * enforces the username format and uniqueness; every query is parameterised by supabase-js
 * (PostgREST) or typed RPC arguments, so input is never spliced into SQL; and React escapes all
 * text it renders.
 */
import { z } from "zod";

// Control characters and zero-width/bidi marks can hide or reorder text; strip them from names.
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤﻿]/g;

export function cleanText(value: string): string {
  return value.normalize("NFKC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "support", "help", "dearme", "dearme_ai", "system", "moderator",
  "staff", "official", "security", "privacy", "null", "undefined",
]);

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
  "iloveyou", "11111111", "abc12345", "letmein1", "welcome1", "admin123", "passw0rd", "dearme123",
]);

export const PASSWORD_MIN = 8;
// bcrypt only reads the first 72 bytes, and Supabase rejects longer passwords.
export const PASSWORD_MAX_BYTES = 72;

export const emailSchema = z
  .string()
  .transform((value) => cleanText(value).toLowerCase())
  .pipe(
    z
      .string()
      .min(1, "Enter your email.")
      .max(254, "That email is too long.")
      .email("Enter a valid email, like name@example.com.")
  );

export const usernameSchema = z
  .string()
  .transform((value) => cleanText(value).toLowerCase())
  .pipe(
    z
      .string()
      .min(3, "Usernames need at least 3 characters.")
      .max(20, "Usernames can be at most 20 characters.")
      .regex(/^[a-z0-9_]+$/, "Use only letters, numbers and underscores.")
      .refine((value) => !RESERVED_USERNAMES.has(value), "That username is reserved. Try another.")
  );

export const nameSchema = z
  .string()
  .transform(cleanText)
  .pipe(z.string().min(2, "Name must be at least 2 characters.").max(30, "Name must be 30 characters or less."));

export const otpSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6,10}$/, "Enter the code from the email (numbers only)."));

export type PasswordCheck = { id: string; label: string; ok: boolean };

/** The rules shown under the password field, ticked as they are met. */
export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { id: "length", label: `At least ${PASSWORD_MIN} characters`, ok: password.length >= PASSWORD_MIN },
    { id: "letter", label: "A letter", ok: /[A-Za-z]/.test(password) },
    { id: "number", label: "A number", ok: /\d/.test(password) },
    { id: "mixed", label: "Upper and lower case, or a symbol (recommended)", ok: /[a-z]/.test(password) && /[A-Z]/.test(password) || /[^A-Za-z0-9]/.test(password) },
  ];
}

/** 0-4, for the strength bar. */
export function passwordStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= PASSWORD_MIN) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) score = 0;
  return Math.min(score, 4);
}

/** Returns a message, or null when the password is acceptable. */
export function passwordProblem(password: string, context: { email?: string; username?: string } = {}): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "That password is too long (72 bytes max).";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
  if (/^\s|\s$/.test(password)) return "Remove spaces at the start or end.";
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "That password is too common. Pick something harder to guess.";
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Don't use your email in your password.";
  const user = context.username?.toLowerCase();
  if (user && user.length >= 4 && lower.includes(user)) return "Don't use your username in your password.";
  return null;
}

export type FieldErrors = Partial<Record<string, string>>;

export type SignUpInput = { email: string; username: string; password: string; confirm: string };
export type SignUpValues = { email: string; username: string; password: string };

export function validateSignUp(input: SignUpInput): { values?: SignUpValues; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const email = emailSchema.safeParse(input.email);
  const username = usernameSchema.safeParse(input.username);
  if (!email.success) errors.email = email.error.issues[0]?.message;
  if (!username.success) errors.username = username.error.issues[0]?.message;
  const problem = passwordProblem(input.password, {
    email: email.success ? email.data : undefined,
    username: username.success ? username.data : undefined,
  });
  if (problem) errors.password = problem;
  if (!input.confirm) errors.confirm = "Confirm your password.";
  else if (input.confirm !== input.password) errors.confirm = "The passwords don't match.";
  if (Object.keys(errors).length > 0 || !email.success || !username.success) return { errors };
  return { values: { email: email.data, username: username.data, password: input.password }, errors };
}

export function validateNewPassword(password: string, confirm: string, context: { email?: string; username?: string } = {}): FieldErrors {
  const errors: FieldErrors = {};
  const problem = passwordProblem(password, context);
  if (problem) errors.password = problem;
  if (!confirm) errors.confirm = "Confirm your password.";
  else if (confirm !== password) errors.confirm = "The passwords don't match.";
  return errors;
}

/** Friendly text for Supabase Auth errors. Log-in failures never reveal whether an email exists. */
export function authErrorMessage(error: { message?: string; status?: number; code?: string } | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (error.status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || message.includes("rate limit")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "Please verify your email first. We can send a new code.";
  if (code === "otp_expired" || message.includes("expired") || message.includes("invalid otp") || message.includes("token has expired")) {
    return "That code is wrong or has expired. Check the latest email or send a new code.";
  }
  if (code === "weak_password" || message.includes("password should")) return "That password is too weak. Use at least 8 characters with letters and numbers.";
  if (code === "same_password") return "Your new password must be different from the current one.";
  if (code === "email_exists" || code === "user_already_exists" || message.includes("already registered")) {
    return "An account with this email already exists. Log in instead.";
  }
  if (code === "identity_already_exists" || message.includes("identity is already linked")) {
    return "That Google account already belongs to another DearMe account. Log in with it instead.";
  }
  if (code === "manual_linking_disabled" || message.includes("manual linking")) {
    return "Connecting Google to an existing journal isn't switched on yet. Please try again later.";
  }
  if (code === "reauthentication_needed") return "For your security, confirm it's you first. We've emailed you a code.";
  if (code === "signup_disabled") return "New sign-ups are paused right now.";
  if (message.includes("network") || message.includes("fetch")) return "We couldn't reach the server. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}
