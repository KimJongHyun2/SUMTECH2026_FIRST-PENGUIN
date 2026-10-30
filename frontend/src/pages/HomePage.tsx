import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { useSession } from "../app/SessionProvider";
export function HomePage() {
  const navigate = useNavigate(),
    { controller } = useSession();
  return (
    <>
      <section className="grid gap-10 pt-14 lg:grid-cols-[560fr_1007fr] lg:gap-[5.4vw] lg:pt-[104px] lg:pr-[6.25vw]">
        <div className="flex min-w-0 flex-col items-start gap-7">
          {/* 노트북 폭에서도 두 줄을 유지하도록 글자 크기를 화면 폭에 맞추고, 단어 중간에서 줄을 바꾸지 않는다. */}
          <h1 className="text-[30px] leading-[1.35] font-bold tracking-tight break-keep lg:text-[clamp(30px,2.6vw,48px)]">
            공부에 집중하는 동안,
            <br />
            <span className="text-primary-strong">자세는 AI가 살펴볼게요.</span>
          </h1>
          <p className="text-muted leading-relaxed">
            웹캠으로 개인 기준 대비 자세 변화를 확인하고,
            <br />
            작업 중 놓치기 쉬운 변화를 알려드려요.
          </p>
          <Button
            variant="primary"
            size="large"
            onClick={() => {
              controller.newSession("basic");
              navigate("/setup");
            }}
          >
            자세 등록하고 시작 →
          </Button>
          <p className="text-sm text-muted">
            로그인 없이 이 PC 브라우저에 기록을 저장해요
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              controller.newSession("deep");
              navigate("/connect");
            }}
          >
            딥 모드 사용하기
          </Button>
        </div>
        <img
          src="/images/home-hero.png"
          alt="책상에서 노트북으로 공부하는 학생"
          className="w-full min-w-0 rounded-[20px] object-cover lg:aspect-[1007/590]"
        />
      </section>
      <section
        id="features"
        className="mx-auto mt-12 grid max-w-[1032px] gap-6 md:grid-cols-3 lg:mt-[94px]"
      >
        {[
          ["imgIcon", "AI 자세 분석", "개인 기준 대비 변화 감지"],
          ["imgIcon1", "자세 리포트", "유효 감지 시간으로 기록"],
          ["imgIcon2", "내 기록", "이 PC 브라우저에 저장"],
        ].map(([icon, title, description]) => (
          <article
            key={title}
            className="flex items-center gap-4 rounded-[18px] border border-line p-6"
          >
            <span className="grid size-13 shrink-0 place-items-center rounded-[14px] bg-surface">
              <Icon name={`2008-49-${icon}`} />
            </span>
            <div>
              <h2 className="font-bold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{description}</p>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
