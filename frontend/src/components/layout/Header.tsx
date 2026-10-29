import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { useSession } from "../../app/SessionProvider";
export function Header({ home, dark }: { home: boolean; dark: boolean }) {
  const navigate = useNavigate(),
    { controller } = useSession();
  return (
    <header className="mx-auto flex min-h-12 max-w-[1792px] items-center justify-between gap-3">
      <Link
        to="/"
        aria-label="패스트거북이 홈"
        className="flex shrink-0 items-center gap-2 text-sm font-extrabold md:gap-2.5 md:text-[17px]"
      >
        <Icon
          name={dark ? "2008-170-imgIconTurtle" : "2008-49-imgIconTurtle"}
        />
        FAST TURTLE
      </Link>
      <nav className="flex items-center gap-3 text-sm md:gap-9">
        {home ? (
          <>
            <a href="#features" className="hidden md:block">
              기능 소개
            </a>
            <Link to="/history">내 기록</Link>
            <Button
              variant="primary"
              onClick={() => {
                controller.newSession("basic");
                navigate("/setup");
              }}
            >
              시작하기
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => navigate("/")}>
            홈으로
          </Button>
        )}
      </nav>
    </header>
  );
}
