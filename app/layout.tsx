import type { Metadata, Viewport } from "next";
import { FormProvider } from "@/components/FormProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "내 카드 찾기",
  description: "신분과 한 달 지출로 내가 실제로 받을 카드 혜택을 계산해 추천하고, 지금 카드와 비교해 드려요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <FormProvider>{children}</FormProvider>
      </body>
    </html>
  );
}
