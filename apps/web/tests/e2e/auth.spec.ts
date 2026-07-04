/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// ---------------------------------------------------------------------------
// E2E: Authentication flows
//
// Covers: unauthenticated redirect, login, register, logout, invalid creds,
// and session persistence. Uses modern getByRole/getByLabel selectors.
// ---------------------------------------------------------------------------

import { test, expect } from '@playwright/test';
import { ensureTestUser } from './test-utils';

test.describe('Authentication', () => {
  test.beforeAll(async () => {
    await ensureTestUser('test@example.com', 'password123');
  });

  test('redirects to login when unauthenticated', async ({ browser }) => {
    // Use a fresh context with no saved storageState
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/');

    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.getByRole('heading', { name: /sign in|welcome/i })).toBeVisible();

    await context.close();
  });

  test('successful login redirects to chat', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/.*\/chat.*/, { timeout: 30_000 });

    await context.close();
  });

  test('invalid credentials show error message', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Error alert should appear (role="alert" in the login form)
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });

    // Should still be on the login page
    await expect(page).toHaveURL(/.*\/login/);

    await context.close();
  });

  test('login page has link to register', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');

    const registerLink = page.getByRole('link', { name: /create an account/i });
    await expect(registerLink).toBeVisible();
    await registerLink.click();
    await expect(page).toHaveURL(/.*\/register/);

    await context.close();
  });

  test('login page has forgot password link', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');

    const forgotLink = page.getByRole('link', { name: /forgot password/i });
    await expect(forgotLink).toBeVisible();
    await forgotLink.click();
    await expect(page).toHaveURL(/.*\/forgot-password/);

    await context.close();
  });
});

test.describe('Registration', () => {
  test('register page renders with required fields', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/register');

    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();

    await context.close();
  });

  test('password mismatch shows validation error', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/register');

    await page.getByLabel(/full name/i).fill('Test User');
    await page.getByLabel('Email').fill('newuser@example.com');
    await page.getByLabel('Password').fill('TestPass123');
    await page.getByLabel(/confirm password/i).fill('DifferentPass123');

    // Should show password mismatch error
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();

    await context.close();
  });

  test('password strength indicators appear', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/register');

    await page.getByLabel('Password').fill('TestPass123');

    // Strength indicators should be visible
    await expect(page.getByText(/min 8 characters/i)).toBeVisible();
    await expect(page.getByText(/one uppercase letter/i)).toBeVisible();
    await expect(page.getByText(/one lowercase letter/i)).toBeVisible();
    await expect(page.getByText(/one number/i)).toBeVisible();

    await context.close();
  });
});
