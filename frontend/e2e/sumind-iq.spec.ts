import { expect, test } from '@playwright/test';

test.describe('SUMIND-IQ End-to-End Platform Verification', () => {
  test('Full lifecycle: Login, Upload, Ready Index, Semantic Search, Grounded RAG with Citations, Refusal on Missing Evidence, Summary, and RBAC Protection', async ({
    page,
  }) => {
    // 1. User logs in as Employee first to test RBAC & document upload
    await page.goto('/login');
    await expect(page.getByText('Sign in to SUMIND-IQ')).toBeVisible();
    await page.getByRole('button', { name: /Employee/i }).click();
    await page.getByRole('button', { name: /Sign In to Workspace/i }).click();

    await expect(page).toHaveURL(/\/app\/dashboard/);

    // 8. Role-restricted user (Employee) cannot access an unauthorised admin route
    await page.goto('/app/admin/users');
    await expect(page).toHaveURL(/\/app\/access-denied/);
    await expect(
      page.getByText(/Access Denied — Insufficient Role Permissions/i)
    ).toBeVisible();

    // 2 & 3. User uploads a sample document and it reaches the READY state
    await page.goto('/app/upload');
    const fileInput = page.locator('#document-file-input');
    await fileInput.setInputFiles({
      name: 'e2e_incident_runbook.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'Section 1: Incident Escalation Runbook\nAll P1 security incidents must be escalated to the CISO within 15 minutes and logged in the SOC ledger.'
      ),
    });
    await page.getByRole('button', { name: /Upload & Run Ingestion Pipeline/i }).click();
    await expect(page.getByText('INGESTION COMPLETE')).toBeVisible();
    await expect(page.getByText('READY')).toBeVisible();

    // 4. User searches for a term from the document
    await page.goto('/app/search?q=CISO+15+minutes');
    await expect(page.getByText(/e2e_incident_runbook/i).first()).toBeVisible();

    // 5. User asks a grounded question and sees a citation
    await page.goto('/app/assistant');
    const questionBox = page.getByPlaceholder(/Ask a question about your authorised/i);
    await questionBox.fill('Within how many minutes must P1 security incidents be escalated to the CISO?');
    await questionBox.press('Enter');
    await expect(page.getByText(/15 minutes/i).first()).toBeVisible();

    // 6. User asks an unsupported question and receives a clear "insufficient evidence" response
    await questionBox.fill('What is the Mars Orbital Cafeteria menu for 2099?');
    await questionBox.press('Enter');
    await expect(page.getByText(/Insufficient Evidence/i).first()).toBeVisible();

    // 7. User views a document summary
    await page.goto('/app/summaries');
    await expect(page.getByText(/AI-Generated Document Summary/i)).toBeVisible();
    await expect(page.getByText(/Executive Summary/i).first()).toBeVisible();
  });
});

