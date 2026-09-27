import { expect, test, type Page } from '@playwright/test'

async function createC2Candidate(page: Page, name = 'E2E考生') {
  await page.goto('./')
  await expect(page).toHaveTitle(/科目二/)

  await page.getByLabel('姓名').fill(name)
  await page.getByLabel('准驾车型').selectOption('C2')
  await page.getByRole('button', { name: '进入训练中心' }).click()

  await expect(page.getByRole('heading', { name: `${name}，选择训练任务` })).toBeVisible()
  await expect(page.getByText('科目二 · 场地驾驶技能')).toBeVisible()
  await expect(page.getByText('科目三 · 道路驾驶技能')).toBeVisible()
}

async function createC1Candidate(page: Page, name = 'C1 E2E考生') {
  await page.goto('./')
  await expect(page).toHaveTitle(/科目二/)

  await page.getByLabel('姓名').fill(name)
  await page.getByLabel('准驾车型').selectOption('C1')
  await page.getByRole('button', { name: '进入训练中心' }).click()

  await expect(page.getByRole('heading', { name: `${name}，选择训练任务` })).toBeVisible()
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
  await expect(page.locator('.driving-shell')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /M · 第一人称/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '结束并查看结果' })).toBeVisible()
  await expect(page.locator('.project-status')).toBeVisible()
}

test('C2 reverse-parking scene renders, accepts controls, and cycles all four cameras', async ({ page }) => {
  test.setTimeout(60_000)
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page)

  await page.locator('.task-card').filter({ hasText: '倒车入库' }).click()
  await expectHealthyDrivingScene(page)
  await expect(page.getByText(/C2 自动挡/)).toBeVisible()

  await page.locator('canvas').click({ position: { x: 80, y: 80 } })
  const help = page.getByRole('button', { name: /H 展开说明/ })
  await expect(help).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.down('h')
  await expect(page.getByRole('button', { name: /H 收起说明/ })).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.down('h')
  await expect(page.getByText('行驶与转向', { exact: true })).toBeVisible()
  await page.keyboard.up('h')
  await page.screenshot({ path: '/tmp/subject2-keyboard-help-desktop.png' })
  await page.setViewportSize({ width: 800, height: 700 })
  await expect(page.getByText('行驶与转向', { exact: true })).toBeVisible()
  const helpBounds = await page.getByRole('region', { name: '键盘操作说明' }).boundingBox()
  expect(helpBounds!.x + helpBounds!.width).toBeLessThanOrEqual(800)
  await page.screenshot({ path: '/tmp/subject2-keyboard-help-small.png' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.keyboard.press('h')
  await expect(help).toHaveAttribute('aria-expanded', 'false')
  await help.click()
  await expect(page.getByText('行驶与转向', { exact: true })).toBeVisible()
  await page.keyboard.press('h')

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

  await page.keyboard.down('d')
  await expect.poll(async () => await page.locator('.steering-hud > b').textContent()).toMatch(/右/)
  await page.keyboard.up('d')
  await page.keyboard.down('j')
  await expect(page.locator('.steering-hud > b')).toContainText('方向盘正')
  await page.keyboard.up('j')

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

test('C1 Subject 3 replay surfaces sustained gear-speed coaching without changing score', async ({ page }) => {
  test.setTimeout(75_000)
  const runtimeErrors = captureRuntimeErrors(page)
  await createC1Candidate(page, '挡速复盘E2E')

  const drill = page.locator('.subject3-practice-card').filter({ hasText: '变更车道' })
  await drill.click()
  await expectHealthyDrivingScene(page)
  await page.locator('canvas').click({ position: { x: 80, y: 80 } })

  await page.keyboard.press('t')
  await page.keyboard.press('i')
  await page.keyboard.press('1')
  await page.keyboard.press('Space')

  const speed = page.locator('.speed strong')
  await page.keyboard.down('w')
  try {
    await expect.poll(
      async () => Number(await speed.textContent()),
      { timeout: 15_000 },
    ).toBeGreaterThan(22)
    await page.waitForTimeout(2_200)
  } finally {
    await page.keyboard.up('w')
  }

  await page.getByRole('button', { name: '结束并查看结果' }).click()

  const coaching = page.getByRole('region', { name: '挡位—车速训练观察' })
  await expect(coaching).toBeVisible()
  await expect(coaching).toContainText('这是训练提示，不是考试扣分项')
  await expect(coaching).toContainText('转速持续偏高')
  await expect(coaching.getByRole('button', { name: '查看这段轨迹证据' }).first()).toBeEnabled()
  await expect(page.locator('.replay-timeline')).not.toContainText('转速持续偏高')

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})

test('standalone Subject 3 lane-change drill starts at the targeted slice', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page, '科三专项E2E')

  const drill = page.locator('.subject3-practice-card').filter({ hasText: '变更车道' })
  await expect(drill).toBeVisible()
  await drill.click()

  await expectHealthyDrivingScene(page)
  await expect(page.locator('.status-chip')).toContainText('科目三专项 · 变更车道')
  await expect(page.locator('.status-chip')).toContainText('白天')
  await expect(page.locator('.project-status')).toContainText(/科目三专项 · 变更车道|下一项目：变更车道/)
  await expect(page.locator('.light-test')).toHaveCount(0)

  await page.getByRole('button', { name: '结束并查看结果' }).click()
  await expect(page.locator('.result-meta')).toContainText('科目三专项 · 变更车道')
  await expect(page.getByText('未完成', { exact: true })).toBeVisible()

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})

test('personalized plan routes through four targeted observation-signal stages', async ({ page }) => {
  // The pack now mounts four real driving scenes, including three targeted
  // Subject 3 slices. State-machine tests cover automatic event completion;
  // this browser path verifies routing, labels, persistence and renderer cleanup.
  test.setTimeout(180_000)
  const runtimeErrors = captureRuntimeErrors(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('subject2.trainingPackHistory.v1', JSON.stringify([{
      id: 'seed-observation-round',
      createdAt: Date.now() - 86_400_000,
      candidateName: '训练包E2E',
      licenseType: 'C2',
      packId: 'observation-signal',
      recordedStages: 4,
      totalStages: 4,
      completedStages: 0,
      passedStages: 0,
      habitInfractions: 4,
      totalFatalInfractions: 1,
      totalInfractions: 4,
      stages: [],
    }]))
  })
  await createC2Candidate(page, '训练包E2E')

  const plan = page.getByRole('region', { name: '个性化训练建议' })
  await expect(plan).toContainText('长期训练建议')
  await expect(plan).toContainText('当前最值得练')
  await expect(plan).toContainText('观察与信号')
  await expect(plan).toContainText('优先巩固')
  await expect(plan).toContainText('不合格 1')

  const today = page.getByRole('region', { name: '今日训练计划' })
  await expect(today).toContainText('0/2')
  await expect(today).toContainText('下一项 · 观察与信号')
  await expect(today.getByRole('article', { name: '今日训练第 1 项：观察与信号' })).toContainText('待完成')
  await today.getByRole('button', { name: '开始今日下一项 · 观察与信号' }).click()

  // Stage 1: Subject 2 right-angle turn.
  await expectHealthyDrivingScene(page)
  await expect(page.locator('.status-chip')).toContainText('专项训练 · 观察与信号 1/4 · 直角转弯')
  await expect(page.locator('.project-status')).toContainText(/直角|转向灯|靠右/)
  await page.getByRole('button', { name: '结束并查看结果' }).click()

  let progress = page.getByRole('region', { name: '专项训练进度' })
  await expect(progress).toContainText('1 / 4')
  await expect(progress).toContainText('路口左右转弯')
  let nextStage = page.getByRole('button', { name: '继续下一项 · 路口左右转弯' })
  await nextStage.click()

  // Stage 2: Subject 3 intersection-turn slice. Daytime slices intentionally
  // skip the unrelated simulated-light-test preflight.
  await expectHealthyDrivingScene(page)
  await expect(page.locator('.status-chip')).toContainText('专项训练 · 观察与信号 2/4 · 路口左右转弯')
  await expect(page.locator('.project-status')).toContainText(/科目三专项 · 路口左右转弯|下一项目：路口左转弯/)
  await expect(page.locator('.light-test')).toHaveCount(0)
  await page.getByRole('button', { name: '结束并查看结果' }).click()

  progress = page.getByRole('region', { name: '专项训练进度' })
  await expect(progress).toContainText('2 / 4')
  nextStage = page.getByRole('button', { name: '继续下一项 · 变更车道' })
  await nextStage.click()

  // Stage 3: lane-change slice.
  await expectHealthyDrivingScene(page)
  await expect(page.locator('.status-chip')).toContainText('专项训练 · 观察与信号 3/4 · 变更车道')
  await expect(page.locator('.project-status')).toContainText(/科目三专项 · 变更车道|下一项目：变更车道/)
  await expect(page.locator('.light-test')).toHaveCount(0)
  await page.getByRole('button', { name: '结束并查看结果' }).click()

  progress = page.getByRole('region', { name: '专项训练进度' })
  await expect(progress).toContainText('3 / 4')
  nextStage = page.getByRole('button', { name: '继续下一项 · 靠边停车' })
  await nextStage.click()

  // Stage 4: pull-over slice.
  await expectHealthyDrivingScene(page)
  await expect(page.locator('.status-chip')).toContainText('专项训练 · 观察与信号 4/4 · 靠边停车')
  await expect(page.locator('.project-status')).toContainText(/科目三专项 · 靠边停车|下一项目：靠边停车/)
  await expect(page.locator('.light-test')).toHaveCount(0)
  await page.getByRole('button', { name: '结束并查看结果' }).click()

  await expect(page.getByRole('heading', { name: '训练包总复盘' })).toBeVisible()
  const report = page.getByRole('region', { name: '训练包总复盘' })
  await expect(report).toContainText('4/4')
  await expect(report).toContainText('直角转弯')
  await expect(report).toContainText('路口左右转弯')
  await expect(report).toContainText('变更车道')
  await expect(report).toContainText('靠边停车')
  await expect(report).toContainText('目标习惯错误')
  await expect(report.getByRole('button', { name: '再练一轮 · 观察与信号' })).toBeEnabled()

  const history = page.getByRole('region', { name: '连续训练趋势' })
  await expect(history).toContainText('最近 2 轮')
  await expect(history).toContainText('较之前改善')
  await expect(history).toContainText('4 → 0')
  await expect(history).toContainText('1 → 0')

  const persisted = await page.evaluate(() => {
    const raw = window.localStorage.getItem('subject2.trainingPackHistory.v1')
    return raw ? JSON.parse(raw) : []
  })
  expect(persisted).toHaveLength(2)
  expect(persisted[0]).toMatchObject({
    candidateName: '训练包E2E',
    licenseType: 'C2',
    packId: 'observation-signal',
    recordedStages: 4,
    totalStages: 4,
  })

  const returnToCenter = page.getByRole('button', { name: '训练包完成 · 返回训练中心' })
  await returnToCenter.click()

  const refreshedToday = page.getByRole('region', { name: '今日训练计划' })
  await expect(refreshedToday).toContainText('1/2')
  await expect(refreshedToday).toContainText('下一项 · 车身边线控制')
  await expect(refreshedToday.getByRole('article', { name: '今日训练第 1 项：观察与信号' })).toContainText('今日已完成')
  await expect(refreshedToday.getByRole('button', { name: '开始今日下一项 · 车身边线控制' })).toBeEnabled()

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

  const targetedTraining = focus.getByRole('button', { name: '专项训练 · 倒库' })
  await expect(targetedTraining).toBeEnabled()
  await targetedTraining.click()

  await expectHealthyDrivingScene(page)
  await expect(page.locator('.status-chip')).toContainText('诊断E2E · 训练 · 白天')
  await expect(page.locator('.project-status')).toContainText(/倒库|控制线|起始端/)
  await expect(page.getByText('模拟考试成绩单')).toHaveCount(0)

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})


test('C1 sequential keys shift once per press and help preserves held steering', async ({ page }) => {
  const errors = captureRuntimeErrors(page)
  await page.goto('./')
  await page.getByLabel('姓名').fill('键盘C1')
  await page.getByLabel('准驾车型').selectOption('C1')
  await page.getByRole('button', { name: '进入训练中心' }).click()
  await page.locator('.task-card').filter({ hasText: '倒车入库' }).click()
  await expectHealthyDrivingScene(page)
  await page.locator('canvas').click({ position: { x: 80, y: 80 } })
  await page.keyboard.down('c')
  await page.keyboard.down(']')
  await expect(page.locator('.gear')).toHaveText('1 挡')
  await page.keyboard.down(']')
  await expect(page.locator('.gear')).toHaveText('1 挡')
  await page.keyboard.up(']')
  await page.keyboard.press(']')
  await expect(page.locator('.gear')).toHaveText('2 挡')
  await page.keyboard.press('[')
  await expect(page.locator('.gear')).toHaveText('1 挡')
  await page.keyboard.up('c')
  await page.keyboard.down('d')
  await page.keyboard.press('h')
  await expect(page.getByText('逐级降 / 升挡', { exact: false })).toBeVisible()
  await expect.poll(async () => await page.locator('.steering-hud > b').textContent()).toMatch(/右/)
  await page.keyboard.press('h')
  await page.keyboard.up('d')
  await page.keyboard.down('j')
  await expect(page.locator('.steering-hud > b')).toHaveText('方向盘正')
  await page.keyboard.up('j')
  expect(errors).toEqual([])
})
