import { expect, test, type Page } from '@playwright/test'

async function createC2Candidate(page: Page, name = 'E2E考生') {
  await page.goto('./')
  await expect(page).toHaveTitle(/Subject2/)

  await page.getByLabel('姓名').fill(name)
  await page.getByLabel('准驾车型').selectOption('C2')
  await page.getByRole('button', { name: '进入训练中心' }).click()

  await expect(page.getByRole('heading', { name: `${name}，选择训练任务` })).toBeVisible()
  await expect(page.getByText('科目二 · 场地驾驶技能')).toBeVisible()
  await expect(page.getByText('科目三 · 道路驾驶技能')).toBeVisible()
}

function captureRuntimeErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return
  const finish = page.getByRole('button', { name: '结束并查看结果' })
  if (await finish.count() === 0) return
  try {
    await finish.first().click({ timeout: 3_000 })
    await page.locator('canvas').waitFor({ state: 'detached', timeout: 3_000 })
  } catch {
    // Preserve the original test failure; cleanup is best-effort only.
  }
})

async function expectHealthyDrivingScene(page: Page) {
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /M · 第一人称/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '结束并查看结果' })).toBeVisible()
}

test('C2 reverse-parking scene renders, accepts controls, and cycles all four cameras', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page)

  await page.locator('.task-card').filter({ hasText: '倒车入库' }).click()
  await expectHealthyDrivingScene(page)
  await expect(page.getByText(/C2 自动挡/)).toBeVisible()

  const view = page.getByRole('button', { name: /M · 第一人称/ })
  await view.click()
  await expect(page.getByRole('button', { name: /M · 第二人称/ })).toBeVisible()
  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: /M · 第三人称/ })).toBeVisible()
  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: /M · 垂直俯视/ })).toBeVisible()
  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: /M · 第一人称/ })).toBeVisible()

  // Return focus to the driving surface: Space on a focused button must not be mistaken for the handbrake key.
  await page.locator('canvas').click({ position: { x: 80, y: 80 } })

  await page.keyboard.press('i')
  await expect(page.getByText('发动机运行')).toBeVisible()

  await page.keyboard.press('t')
  await expect(page.getByText('安全带已系')).toBeVisible()

  await page.keyboard.press('g')
  await expect(page.getByText('前进', { exact: true })).toBeVisible()

  await page.keyboard.press('Space')
  await expect(page.getByText('手刹放下')).toBeVisible()

  const speed = page.locator('.speed strong')
  await page.keyboard.down('w')
  try {
    await expect.poll(
      async () => Number(await speed.textContent()),
      { timeout: 12_000 },
    ).toBeGreaterThan(0)
  } finally {
    await page.keyboard.up('w')
  }

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})

test('Subject 3 night scene opens directly into the live road without renderer failure', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page, '科三E2E')

  await page.getByRole('button', { name: '夜间', exact: true }).click()
  await page.getByRole('button', { name: /综合道路驾驶/ }).click()

  await expectHealthyDrivingScene(page)
  await expect(page.getByText(/夜间/).first()).toBeVisible()
  await expect(page.locator('.project-status')).toContainText(/上车准备|起步/)
  await page.locator('canvas').click({ position: { x: 80, y: 80 } })

  await page.keyboard.press('t')
  await page.keyboard.press('i')
  await page.keyboard.press('q')
  await expect(page.getByText('安全带已系')).toBeVisible()
  await expect(page.getByText('发动机运行')).toBeVisible()

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})

test('cross-project training pack advances from reverse parking to side parking', async ({ page }) => {
  // A pack stage transition mounts a second full software-WebGL scene.
  test.setTimeout(75_000)
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page, '训练包E2E')

  await page.getByRole('button', { name: /车身边线控制/ }).click()
  await expectHealthyDrivingScene(page)
  await expect(page.locator('.status-chip')).toContainText('专项训练 · 车身边线控制 1/4 · 倒车入库')
  await expect(page.locator('.project-status')).toContainText(/倒库|控制线|起始端/)

  await page.getByRole('button', { name: '结束并查看结果' }).click()

  await expect(page.getByText('专项训练阶段结果')).toBeVisible()
  await expect(page.getByRole('region', { name: '专项训练进度' })).toContainText('车身边线控制')
  await expect(page.getByRole('region', { name: '专项训练进度' })).toContainText('1 / 4')
  const nextStage = page.getByRole('button', { name: '继续下一项 · 侧方停车' })
  await expect(nextStage).toBeEnabled()
  await nextStage.click()

  await expectHealthyDrivingScene(page)
  await expect(page.locator('.status-chip')).toContainText('专项训练 · 车身边线控制 2/4 · 侧方停车')
  await expect(page.locator('.project-status')).toContainText(/侧方|库位|右侧边线|准备挂 R 挡/)
  await expect(page.getByText('专项训练阶段结果')).toHaveCount(0)

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})

test('ending a training session reaches the incomplete result and replay surface', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page, '复盘E2E')

  await page.locator('.task-card').filter({ hasText: '侧方停车' }).click()
  await expectHealthyDrivingScene(page)

  await page.getByRole('button', { name: '结束并查看结果' }).click()

  await expect(page.getByText('模拟考试成绩单')).toBeVisible()
  await expect(page.getByText('未完成', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '驾驶轨迹复盘' })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回训练中心' })).toBeVisible()

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})


test('replay coaching explains an infraction with before-after operation context', async ({ page }) => {
  // This path intentionally mounts two full software-WebGL driving scenes:
  // initial evidence generation, then result -> targeted practice.
  test.setTimeout(75_000)
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page, '诊断E2E')

  await page.locator('.task-card').filter({ hasText: '倒车入库' }).click()
  await expectHealthyDrivingScene(page)
  await page.locator('canvas').click({ position: { x: 80, y: 80 } })

  await page.keyboard.press('i')
  await page.keyboard.press('g')
  await page.keyboard.press('Space')

  const speed = page.locator('.speed strong')
  await page.keyboard.down('w')
  try {
    await expect.poll(
      async () => Number(await speed.textContent()),
      { timeout: 12_000 },
    ).toBeGreaterThan(0)
    await expect(page.getByText(/已记录 .* 项/)).toBeVisible()
    await page.waitForTimeout(350)
  } finally {
    await page.keyboard.up('w')
  }

  await page.getByRole('button', { name: '结束并查看结果' }).click()

  await expect(page.getByRole('heading', { name: '本次优先改进' })).toBeVisible()
  const focus = page.getByRole('article', { name: /优先改进 1：安全检查与起停流程/ })
  await expect(focus).toBeVisible()
  await expect(focus).toContainText('1 条相关记录')
  await expect(focus).toContainText('含 1 条不合格')
  await expect(focus).toContainText('训练重点')

  const evidenceButton = focus.getByRole('button', { name: '查看轨迹证据' })
  await expect(evidenceButton).toBeEnabled()
  await evidenceButton.click()

  const event = page.getByRole('button', { name: /起步或行驶时未按规定使用安全带/ })
  await expect(event).toBeVisible()
  await expect(event).toContainText('原因')
  await expect(event).toContainText('建议')
  await expect(event).toContainText('扣分时')
  await expect(event).toContainText(/km\/h/)
  await expect(event.locator('.replay-operation-point.event')).toBeVisible()

  const targetedTraining = focus.getByRole('button', { name: '专项训练 · 倒车入库' })
  await expect(targetedTraining).toBeEnabled()
  await targetedTraining.click()

  await expectHealthyDrivingScene(page)
  await expect(page.locator('.status-chip')).toContainText('诊断E2E · 训练 · 白天')
  await expect(page.locator('.project-status')).toContainText(/倒库|控制线|起始端/)
  await expect(page.getByText('模拟考试成绩单')).toHaveCount(0)

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})
