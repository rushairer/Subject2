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
  const finish = page.getByRole('button', {
    name: /结束(?:并查看结果|示范并查看复盘)/,
  })
  if (await finish.count() === 0) return
  try {
    await finish.first().click({ timeout: 3_000 })
    await page.locator('canvas').waitFor({ state: 'detached', timeout: 3_000 })
  } catch {
    // Preserve the original test failure; cleanup is best-effort only.
  }
})

async function expectHealthyDrivingScene(
  page: Page,
  options: { requireProjectStatus?: boolean } = {},
) {
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.driving-shell')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /M · 第一人称/ })).toBeVisible()
  await expect(page.getByRole('button', {
    name: /结束(?:并查看结果|示范并查看复盘)/,
  })).toBeVisible()
  if (options.requireProjectStatus !== false) {
    await expect(page.locator('.project-status')).toBeVisible()
  }
}

async function expectProgressiveKeyboardPedals(page: Page) {
  const throttle = page.getByRole('meter', { name: '油门开度' })
  const brake = page.getByRole('meter', { name: '刹车开度' })
  const throttleOpening = async () => Number(await throttle.getAttribute('value'))
  const brakeOpening = async () => Number(await brake.getAttribute('value'))
  await expect(throttle).toHaveAttribute('value', '0')
  await expect(brake).toHaveAttribute('value', '0')

  // Exercise the real keyboard while parked so waiting for software WebGL
  // cannot accidentally drive the candidate out of the project boundaries.
  await page.keyboard.down('w')
  try {
    await expect.poll(throttleOpening, { intervals: [20, 50, 100] }).toBeGreaterThan(0)
    const lightThrottle = await throttleOpening()
    expect(lightThrottle).toBeLessThan(50)
  } finally {
    await page.keyboard.up('w')
  }
  // Exact release timing is covered in simulation tests; allow software-WebGL frames here.
  await expect(throttle).toHaveAttribute('value', '0', { timeout: 5_000 })

  await page.keyboard.down('4')
  try {
    await expect(throttle).toHaveAttribute('value', '40', { timeout: 5_000 })
  } finally {
    await page.keyboard.up('4')
  }
  await expect(throttle).toHaveAttribute('value', '0', { timeout: 5_000 })

  await page.keyboard.down('w')
  try {
    await expect.poll(throttleOpening).toBeGreaterThan(0)
    await page.keyboard.down('s')
    await expect.poll(brakeOpening).toBeGreaterThan(0)
    await expect(throttle).toHaveAttribute('value', '0', { timeout: 5_000 })
  } finally {
    await page.keyboard.up('w')
    await page.keyboard.up('s')
  }
  await expect(brake).toHaveAttribute('value', '0', { timeout: 5_000 })

  await page.keyboard.down('w')
  try {
    await expect.poll(throttleOpening).toBeGreaterThan(0)
    // Headless Chromium keeps each tab focused, even after bringToFront().
    // Send the browser's blur event through the production input listener.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    // W is still held: only the focus-loss cleanup can clear this input.
    await expect(throttle).toHaveAttribute('value', '0', { timeout: 5_000 })
    await expect(brake).toHaveAttribute('value', '0')
  } finally {
    await page.keyboard.up('w')
  }
}

async function expectPedalReadoutClearOfHelp(page: Page) {
  const viewport = page.viewportSize()!
  const help = (await page.getByRole('region', { name: '键盘操作说明' }).boundingBox())!
  const cluster = (await page.locator('.cluster').boundingBox())!
  expect(help.x + help.width).toBeLessThanOrEqual(viewport.width)
  expect(help.y + help.height).toBeLessThanOrEqual(cluster.y)
  expect(cluster.x).toBeGreaterThanOrEqual(0)
  expect(cluster.x + cluster.width).toBeLessThanOrEqual(viewport.width)
  expect(cluster.y + cluster.height).toBeLessThanOrEqual(viewport.height)
  for (const meter of await page.getByRole('meter').all()) {
    const bounds = (await meter.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(cluster.x)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(cluster.x + cluster.width)
  }
}

test('C2 reverse-parking scene renders, accepts progressive pedals, and cycles all four cameras', async ({ page }) => {
  test.setTimeout(90_000) // Includes two viewport captures and pedal checks with software WebGL.
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page)

  await page.locator('.task-card').filter({ hasText: '倒车入库' }).click()
  await expectHealthyDrivingScene(page)
  await expect(page.getByText(/C2 自动挡/)).toBeVisible()
  await expect(page.getByRole('meter', { name: '油门开度' })).toBeVisible()
  await expect(page.getByRole('meter', { name: '刹车开度' })).toBeVisible()
  await expect(page.getByRole('meter', { name: '离合开度' })).toHaveCount(0)

  await page.locator('canvas').click({ position: { x: 80, y: 80 } })
  await expectProgressiveKeyboardPedals(page)
  const help = page.getByRole('button', { name: /H 展开说明/ })
  await expect(help).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.down('h')
  await expect(page.getByRole('button', { name: /H 收起说明/ })).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.down('h')
  await expect(page.getByText('行驶与转向', { exact: true })).toBeVisible()
  await page.keyboard.up('h')
  await expectPedalReadoutClearOfHelp(page)
  await page.screenshot({ path: '/tmp/subject2-keyboard-help-desktop.png' })
  await page.setViewportSize({ width: 800, height: 700 })
  await expect(page.getByText('行驶与转向', { exact: true })).toBeVisible()
  await expectPedalReadoutClearOfHelp(page)
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

test('Subject 3 night scene records lighting state and exposes replay coaching', async ({ page }) => {
  test.setTimeout(90_000)
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page, '科三E2E')

  await page.getByRole('button', { name: '夜间', exact: true }).click()
  await page.getByRole('button', { name: /综合道路驾驶/ }).click()

  await expectHealthyDrivingScene(page)
  await expect(page.getByText(/夜间/).first()).toBeVisible()
  await expect(page.locator('.project-status')).toContainText(/上车准备|起步/)
  await page.locator('canvas').click({ position: { x: 80, y: 80 } })

  await page.keyboard.press('t')
  await page.keyboard.press('l')
  await page.keyboard.press('i')
  await page.keyboard.press('q')
  await page.keyboard.press('g')
  await page.keyboard.press('Space')
  await expect(page.getByText('安全带已系')).toBeVisible()
  await expect(page.getByText('发动机运行')).toBeVisible()

  const speed = page.locator('.speed strong')
  await page.keyboard.down('w')
  try {
    await expect.poll(
      async () => Number(await speed.textContent()),
      { timeout: 30_000 },
    ).toBeGreaterThan(1)
    await page.waitForTimeout(900)
  } finally {
    await page.keyboard.up('w')
  }

  await page.getByRole('button', { name: '结束并查看结果' }).click()

  const lighting = page.getByRole('region', { name: '夜间灯光训练观察' })
  await expect(lighting).toBeVisible()
  await expect(lighting).toContainText('未发现持续的不当远光交通上下文')
  await expect(lighting).toContainText('不额外改变考试成绩')
  await expect(page.locator('.replay-live-readout').first()).toContainText('近光')

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})

test('C1 Subject 3 replay surfaces non-scoring gear-speed observation from live driving', async ({ page }) => {
  test.setTimeout(90_000)
  const runtimeErrors = captureRuntimeErrors(page)
  await createC1Candidate(page, '挡速复盘E2E')

  const drill = page.locator('.subject3-practice-card').filter({ hasText: '变更车道' })
  await drill.click()
  await expectHealthyDrivingScene(page)
  await page.locator('canvas').click({ position: { x: 80, y: 80 } })

  await page.keyboard.press('t')
  await page.keyboard.press('i')
  await page.keyboard.down('c')
  await page.keyboard.press(']')
  await page.keyboard.press('Space')
  // New keyboard model: make every clutch phase observable. Holding Shift
  // while C is still down is not enough on a slow renderer because no frame may
  // see the bite-point request before both events have passed.
  const speed = page.locator('.speed strong')
  const throttle = page.getByRole('meter', { name: '油门开度' })
  const clutch = page.getByRole('meter', { name: '离合开度' })
  const throttleOpening = async () => Number(await throttle.getAttribute('value'))

  await page.keyboard.down('w')
  try {
    await expect.poll(throttleOpening, { timeout: 5_000 }).toBeGreaterThan(0)

    await page.keyboard.down('Shift')
    await page.keyboard.up('c')
    await expect(clutch).toHaveAttribute('value', '52', { timeout: 5_000 })
    await page.keyboard.up('Shift')

    // C cancels the latched half-linkage; releasing it now leaves the clutch
    // fully engaged while W is already supplying enough anti-stall throttle.
    await page.keyboard.down('c')
    await expect(clutch).toHaveAttribute('value', '100', { timeout: 5_000 })
    await page.keyboard.up('c')
    await expect(clutch).toHaveAttribute('value', '0', { timeout: 5_000 })

    // Browser integration only needs real C1 trajectory evidence. Exact speed
    // thresholds/classification are deterministic unit-test responsibilities.
    await page.waitForTimeout(1_200)

    await page.keyboard.up('w')
    await expect(throttle).toHaveAttribute('value', '0', { timeout: 5_000 })
    // Coast briefly to record engaged-clutch samples for the replay analyzer.
    await page.waitForTimeout(2_200)
    await expect(page.getByText('发动机运行')).toBeVisible()
  } finally {
    await page.keyboard.up('w')
    await page.keyboard.up('Shift')
    await page.keyboard.up('c')
  }

  await page.getByRole('button', { name: '结束并查看结果' }).click()

  const coaching = page.getByRole('region', { name: '挡位—车速训练观察' })
  await expect(coaching).toBeVisible()
  await expect(coaching).toContainText('这是训练提示，不是考试扣分项')
  await expect(page.locator('.replay-timeline')).not.toContainText('挡位—车速训练观察')

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})

test('standalone Subject 3 lane-change drill starts at the targeted slice', async ({ page }) => {
  test.setTimeout(60_000)
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

  const coach = page.getByRole('button', { name: '教练接管' })
  await expect(coach).toBeVisible()
  await coach.click()
  await expect(page.getByRole('complementary', { name: '教练实时讲解' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: '我来接管' })).toBeVisible()
  await page.getByRole('button', { name: '我来接管' }).click()

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

  const dynamics = page.getByRole('region', { name: '速度 / 挡位时间轴' })
  await expect(dynamics).toBeVisible()
  await expect(dynamics).toContainText('危险事件 0 个')
  await expect(
    dynamics.getByRole('img', { name: '整场训练速度曲线、挡位变化与危险交通事件图' }),
  ).toBeVisible()
  await expect(dynamics.getByRole('slider', { name: '速度和挡位时间轴游标' })).toHaveValue('0')

  const projectScrubber = page.getByRole('slider', { name: '侧方停车复盘时间轴' })
  const projectMax = await projectScrubber.getAttribute('max')
  if (projectMax == null) throw new Error('missing project replay max index')
  await expect(projectScrubber).toHaveValue(projectMax)

  await dynamics.getByRole('button', { name: '定位到这段轨迹' }).click()
  await expect(projectScrubber).toHaveValue('0')

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

test('C1 sequential keys shift once per press, pedals show clutch, and help preserves held steering', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = captureRuntimeErrors(page)
  await page.goto('./')
  await page.getByLabel('姓名').fill('键盘C1')
  await page.getByLabel('准驾车型').selectOption('C1')
  await page.getByRole('button', { name: '进入训练中心' }).click()
  await page.locator('.task-card').filter({ hasText: '倒车入库' }).click()
  await expectHealthyDrivingScene(page)
  await expect(page.getByRole('meter', { name: '油门开度' })).toBeVisible()
  await expect(page.getByRole('meter', { name: '刹车开度' })).toBeVisible()
  const clutch = page.getByRole('meter', { name: '离合开度' })
  await expect(clutch).toBeVisible()
  await expect(clutch).toHaveAttribute('value', '0')
  await page.locator('canvas').click({ position: { x: 80, y: 80 } })
  await page.keyboard.down('c')
  await expect(clutch).toHaveAttribute('value', '100')
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
  await expect(clutch).toHaveAttribute('value', '0', { timeout: 5_000 })
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


test('coach takeover shows structured live teaching and returns control cleanly', async ({ page }) => {
  test.setTimeout(60_000)
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page, '教练讲解 E2E')

  await page.locator('.task-card').filter({ hasText: '倒车入库' }).click()
  await expectHealthyDrivingScene(page)

  const takeover = page.getByRole('button', { name: '教练接管' })
  await expect(takeover).toBeVisible()
  await takeover.click()

  const teaching = page.getByRole('complementary', { name: '教练实时讲解' })
  await expect(teaching).toBeVisible({ timeout: 10_000 })
  await expect(teaching).toContainText('教练驾驶中')
  await expect(teaching).toContainText('为什么这样做')
  await expect(teaching).toContainText('观察重点')
  await expect(page.getByRole('button', { name: '我来接管' })).toBeVisible()

  await page.getByRole('button', { name: '我来接管' }).click()
  await expect(teaching).toHaveCount(0)
  await expect(page.getByRole('button', { name: '教练接管' })).toBeVisible()
  expect(runtimeErrors).toEqual([])
})


test('Subject 3 coach completes the daytime light preflight through the real judge before road takeover', async ({ page }) => {
  test.setTimeout(90_000)
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page, '灯光教练 E2E')

  await page.getByRole('button', { name: /综合道路驾驶/ }).click()
  await expectHealthyDrivingScene(page)

  const lightTest = page.locator('.light-test')
  await expect(lightTest).toBeVisible()
  await expect(lightTest).toContainText('模拟夜间灯光考试')

  const takeover = page.getByRole('button', { name: '教练接管' })
  await expect(takeover).toBeVisible()
  await takeover.click()

  await expect(lightTest).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: '我来接管' })).toBeVisible()
  await expect(page.locator('.penalty-toast')).toHaveCount(0)

  const teaching = page.getByRole('complementary', { name: '教练实时讲解' })
  await expect(teaching).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: '我来接管' }).click()
  await expect(page.getByRole('button', { name: '教练接管' })).toBeVisible()
  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})


test('training center coach demo auto-takes over without polluting personal history', async ({ page }) => {
  test.setTimeout(90_000)
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page, '演示入口 E2E')

  const demo = page.getByRole('region', { name: '教练示范' })
  await expect(demo).toBeVisible()
  await expect(demo).toContainText('示范成绩不会写入个人训练记录')
  await demo.getByRole('button', { name: /科目二完整示范/ }).click()

  await expectHealthyDrivingScene(page, { requireProjectStatus: false })
  const demoStatus = page.locator('.status-chip')
  await expect(demoStatus).toContainText(/教练示范 · 科目二 \d+\/\d+ ·/)
  await expect(demoStatus).not.toContainText('演示入口 E2E')
  await expect(demoStatus).not.toContainText('科目二模拟考试')
  await expect(page.getByRole('button', { name: '我来接管' })).toBeVisible()
  await expect(page.getByRole('button', { name: '结束示范并查看复盘' })).toBeVisible()
  const teaching = page.getByRole('complementary', { name: '教练实时讲解' })
  await expect(teaching).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: '我来接管' }).click()
  await expect(teaching).toHaveCount(0)
  await expect(page.getByRole('button', { name: '教练接管' })).toBeVisible()
  await expect(demoStatus).toContainText(/教练示范 · 科目二 \d+\/\d+ ·/)

  await page.getByRole('button', { name: '教练接管' }).click()
  await expect(page.getByRole('button', { name: '我来接管' })).toBeVisible()
  await expect(teaching).toBeVisible({ timeout: 10_000 })
  await expect(demoStatus).toContainText(/教练示范 · 科目二 \d+\/\d+ ·/)

  await page.getByRole('button', { name: '结束示范并查看复盘' }).click()

  await expect(page.getByText('教练示范复盘')).toBeVisible()
  await expect(page.getByRole('heading', { name: '教练标准示范' })).toBeVisible()
  await expect(page.getByText(/不计入你的个人成绩、训练趋势或训练计划/)).toBeVisible()
  await expect(page.getByRole('region', { name: '今日车评' })).toHaveCount(0)

  const personalHistoryCount = await page.evaluate(() => {
    const raw = window.localStorage.getItem('subject2.examHistory.v1')
    if (!raw) return 0
    try {
      const value = JSON.parse(raw)
      return Array.isArray(value) ? value.length : -1
    } catch {
      return -1
    }
  })
  expect(personalHistoryCount).toBe(0)

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})
