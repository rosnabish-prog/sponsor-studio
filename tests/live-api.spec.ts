import { test, expect } from '@playwright/test';

test('live sign-in has no outbound email recovery flow',async({page})=>{
  await page.goto('http://127.0.0.1:4173',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'SIGN IN.'})).toBeVisible();
  await expect(page.locator('#loginemail')).toBeVisible();
  await expect(page.locator('#loginpass')).toBeVisible();
  await expect(page.getByRole('link',{name:'Forgot password?'})).toHaveCount(0);
  await expect(page.getByText('Ask your administrator to reset it.')).toBeVisible();
  await page.goto('http://127.0.0.1:4173/#reset=test-token-for-ui-only');
  await expect(page.getByRole('heading',{name:'SIGN IN.'})).toBeVisible();
  await expect(page.locator('#loginemail')).toBeVisible();
});

test('live React mode signs in, creates a workspace task and persists sponsor tags', async ({ page }) => {
  const id=Math.random().toString(36).slice(2,10);
  const apiFailures:string[]=[];
  page.on('response',async response=>{
    if(response.url().includes('/api/')&&response.status()>=400){
      apiFailures.push(`${response.request().method()} ${response.url()} ${response.status()} ${await response.text().catch(()=>'?')}`);
    }
  });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button',{name:'NEW ORGANIZATION? CREATE ACCOUNT'}).click();
  await page.locator('#regname').fill('P0 Reviewer');
  await page.locator('#regorg').fill('P0 Test Workspace '+id);
  await page.locator('#loginemail').fill(`reviewer-${id}@example.org`);
  await page.locator('#loginpass').fill('integration-password-123');
  await page.getByRole('button',{name:'CREATE ACCOUNT'}).click();
  await expect(page.locator('.ops-nav')).toBeVisible({timeout:20_000});

  const getWorkspace=async()=>page.evaluate(async()=>{
    const list=await fetch('/api/workspaces',{credentials:'include'}).then(r=>r.json());
    return list[0].workspace.id as string;
  });
  const workspaceId=await getWorkspace();
  // Registration creates the initial versioned workspace catalog. Exercise
  // the same saved list that a freshly registered workspace loads.

  await page.getByRole('button',{name:'Matches'}).first().click();
  await page.getByRole('button',{name:'New task'}).click();
  await page.locator('#taskname').fill('P0 E2E Match '+id);
  await page.locator('#tasknumber').fill('P0-'+id);
  await page.locator('#taskduration').fill('90');
  await page.locator('#studioModalForm').getByRole('button',{name:'Create task'}).click();

  try {
    await expect.poll(async()=>page.evaluate(async w=>{
      const tasks=await fetch(`/api/workspaces/${w}/tasks`,{credentials:'include'}).then(r=>r.json());
      return tasks.length as number;
    },workspaceId)).toBe(1);
  } catch(error) {
    const toast=await page.locator('#toast').textContent().catch(()=>null);
    throw new Error(`Task creation failed: ${String(error)}; API errors: ${apiFailures.join(' | ')}; last toast: ${toast}`);
  }

  await page.reload();
  await expect(page.locator('.ops-nav')).toBeVisible({timeout:15_000});
  await page.getByRole('button',{name:'Matches'}).first().click();
  await expect(page.getByRole('button',{name:`Open P0 E2E Match ${id}`})).toBeVisible();

  const taskId=await page.evaluate(async w=>{
    const tasks=await fetch(`/api/workspaces/${w}/tasks`,{credentials:'include'}).then(r=>r.json());
    return tasks[0].id as string;
  },workspaceId);
  await page.evaluate(id=>window.openTask?.(id),taskId);
  await expect(page.locator('.studio-grid')).toBeVisible();
  await page.evaluate(()=>window.seekVideo?.(10));
  await page.getByRole('button',{name:/Adidas x Messi.*OFF/}).first().click();
  await page.evaluate(()=>window.seekVideo?.(20));
  await page.getByRole('button',{name:/Adidas x Messi.*LIVE/}).first().click();
  await expect.poll(async()=>page.evaluate(async ({w,t})=>{
    const anns=await fetch(`/api/workspaces/${w}/tasks/${t}/annotations`,{credentials:'include'}).then(r=>r.json());
    return anns.filter((a:{kind:string;start:number;end:number|null})=>a.kind==='SPONSOR'&&a.start===10&&a.end===20).length as number;
  },{w:workspaceId,t:taskId})).toBe(1);

  await page.reload();
  await expect(page.locator('.ops-nav')).toBeVisible({timeout:15_000});
  await page.evaluate(id=>window.openTask?.(id),taskId);
  await expect(page.locator('.logtable')).toContainText('Adidas x Messi');

  // Workers are provisioned by the admin; the platform sends no credentials.
  await page.getByRole('button',{name:'Go to Sponsor Studio dashboard'}).click();
  await page.getByRole('button',{name:'Team'}).click();
  await page.getByRole('button',{name:'Add analyst'}).click();
  await page.locator('#uname').fill('Managed E2E Worker');
  const workerEmail=`managed-${id}@example.org`;
  await page.locator('#uemail').fill(workerEmail);
  await page.getByRole('button',{name:'Save analyst'}).click();
  await expect(page.getByRole('heading',{name:'Worker account ready'})).toBeVisible();
  const temporaryPassword=await page.locator('#temporaryPassword').innerText();
  expect(temporaryPassword.length).toBeGreaterThan(20);
  await page.getByRole('button',{name:'Done'}).click();
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/auth/logout') && response.request().method() === 'POST'),
    page.evaluate(()=>window.logout?.()),
  ]);
  await page.locator('#loginemail').fill(workerEmail);
  await page.locator('#loginpass').fill(temporaryPassword);
  await page.getByRole('button',{name:'SIGN IN'}).click();
  await expect(page.getByRole('heading',{name:'SET YOUR PASSWORD.'})).toBeVisible();
  await expect(page.locator('.ops-nav')).toHaveCount(0);
  await page.locator('#currentpwd').fill(temporaryPassword);
  await page.locator('#newpwd').fill('worker-new-password-123');
  await page.locator('#confirmnewpwd').fill('worker-new-password-123');
  await page.getByRole('button',{name:'SET PASSWORD'}).click();
  await expect(page.getByRole('heading',{name:'SIGN IN.'})).toBeVisible();
  await page.locator('#loginemail').fill(workerEmail);
  await page.locator('#loginpass').fill('worker-new-password-123');
  await page.getByRole('button',{name:'SIGN IN'}).click();
  await expect(page.locator('.ops-nav')).toBeVisible();
});
