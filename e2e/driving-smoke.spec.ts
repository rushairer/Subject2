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

async function expectHealthyDrivingScene(page: Page) {
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /M · 第一人称/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '结束并查看结果' })).toBeVisible()
}

test('C2 reverse-parking scene renders, accepts controls, and cycles all four cameras', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page)

  await page.getByRole('button', { name: /倒车入库/ }).click()
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

  await page.keyboard.down('w')
  await page.waitForTimeout(700)
  await page.keyboard.up('w')

  const speed = page.locator('.speed strong')
  await expect.poll(async () => Number(await speed.textContent())).toBeGreaterThan(0)

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})

test('Subject 3 night scene opens directly into the live road without renderer failure', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page, '科三E2E')

  await page.getByRole('button', { name: '夜间' }).click()
  await page.getByRole('button', { name: /综合道路驾驶/ }).click()

  await expectHealthyDrivingScene(page)
  await expect(page.getByText(/科目三道路驾驶/).first()).toBeVisible()
  await expect(page.getByText(/夜间/).first()).toBeVisible()
  await expect(page.getByText(/上车准备|安全起步/)).toBeVisible()

  await page.keyboard.press('t')
  await page.keyboard.press('i')
  await page.keyboard.press('q')
  await expect(page.getByText('安全带已系')).toBeVisible()
  await expect(page.getByText('发动机运行')).toBeVisible()

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})

test('ending a training session reaches the incomplete result and replay surface', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)
  await createC2Candidate(page, '复盘E2E')

  await page.getByRole('button', { name: /侧方停车/ }).click()
  await expectHealthyDrivingScene(page)

  await page.getByRole('button', { name: '结束并查看结果' }).click()

  await expect(page.getByText('模拟考试成绩单')).toBeVisible()
  await expect(page.getByText('未完成', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '驾驶轨迹复盘' })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回训练中心' })).toBeVisible()

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([])
})
