import fs from "node:fs"
import path from "node:path"
import type { Locator, Page } from "@playwright/test"

/**
 * 카메라 입력만 e2e/fixtures의 녹화 영상으로 바꾼다. 앱 코드는 그대로이고 영상 분석·판정·저장은 실제로 동작한다.
 * 첫 화면을 연 뒤, '카메라 켜기'를 누르기 전에 부른다. 화면 글자나 앱 상태는 건드리지 않는다.
 */
const CLIPS = {
  good: "front-good.webm",
  turtle: "front-turtle.webm",
  away: "front-away.webm",
} as const
export type Clip = keyof typeof CLIPS

export async function useRecordedCamera(page: Page, first: Clip) {
  const data = Object.fromEntries(
    Object.entries(CLIPS).map(([name, file]) => [
      name,
      fs.readFileSync(path.join(__dirname, "fixtures", file)).toString("base64"),
    ]),
  )
  await page.evaluate(
    ({ data, first }) => {
      const urls: Record<string, string> = {}
      for (const [name, b64] of Object.entries(data)) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        urls[name] = URL.createObjectURL(new Blob([bytes], { type: "video/webm" }))
      }
      const video = document.createElement("video")
      video.muted = true
      video.playsInline = true
      const canvas = document.createElement("canvas")
      canvas.width = 640
      canvas.height = 480
      const ctx = canvas.getContext("2d")!
      const stream = canvas.captureStream(30)
      let current = first
      const play = (name: string) => {
        current = name
        video.src = urls[name]
        return video.play()
      }
      // 영상이 끝나면 같은 영상을 처음부터 다시 보여 준다.
      video.addEventListener("ended", () => void play(current))
      setInterval(() => {
        if (video.readyState >= 2) ctx.drawImage(video, 0, 0, 640, 480)
      }, 33)
      ;(window as any).__recordedCamera = { play }
      navigator.mediaDevices.getUserMedia = async () => stream.clone()
      return play(first)
    },
    { data, first: first as string },
  )
}

/** 카메라 앞의 자세를 바꾼다(녹화 영상 전환). */
export async function showClip(page: Page, clip: Clip) {
  await page.evaluate((name) => (window as any).__recordedCamera.play(name), clip)
}

/** 화면 값의 숫자 부분 (예: '14초' → 14, '63%' → 63) */
export async function numberIn(locator: Locator): Promise<number> {
  const text = (await locator.textContent()) ?? ""
  return Number(text.match(/-?\d+(\.\d+)?/)?.[0] ?? NaN)
}

/** 리포트·상세 화면의 항목 값 (예: '확정 이탈' → '1회') */
export function fact(scope: Locator, label: string): Locator {
  const dt = scope.page().locator("dt", { hasText: new RegExp(`^${label}$`) })
  return scope.locator(".facts > div").filter({ has: dt }).locator("dd")
}
