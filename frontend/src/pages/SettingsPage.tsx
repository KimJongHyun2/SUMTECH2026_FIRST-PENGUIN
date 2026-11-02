import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../app/SessionProvider";
import { PageHeading } from "../components/layout/PageHeading";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SENSITIVITY } from "../lib/policy";
import type { Settings } from "../lib/types";
export function SettingsPage() {
  const { state } = useSession();
  if (!state.loaded)
    return (
      <section className="pt-12">
        <PageHeading title="설정" />
        <EmptyState>저장한 설정을 불러오고 있어요.</EmptyState>
      </section>
    );
  return <SettingsForm />;
}

// 저장소를 읽은 뒤 폼을 처음 만들어 기본값이 저장된 설정을 덮어쓰지 않게 한다.
function SettingsForm() {
  const { state, controller } = useSession(),
    navigate = useNavigate();
  const [draft, setDraft] = useState<Settings>({ ...state.data.settings }),
    [error, setError] = useState("");
  const back = () =>
    navigate(state.session && state.session.state !== "ended" ? "/watch" : "/");
  return (
    <section className="pt-12">
      <PageHeading title="설정" />
      <form
        className="mt-10 grid gap-9"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const issue = controller.applySettings(draft);
          if (issue) setError(issue);
          else back();
        }}
      >
        <fieldset>
          <legend className="mb-4 text-muted">알림 민감도</legend>
          <div className="flex overflow-hidden rounded-xl border border-line">
            {(["low", "normal", "high"] as const).map((value) => (
              <label key={value} className="relative flex-1 text-center">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="sensitivity"
                  value={value}
                  checked={draft.sensitivity === value}
                  onChange={() => setDraft({ ...draft, sensitivity: value })}
                />
                <span className="block p-4 text-sm peer-checked:bg-primary-tint peer-checked:font-bold peer-focus-visible:ring-2 peer-focus-visible:ring-primary-strong">
                  {SENSITIVITY[value].label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {(
          [
            ["warningSeconds", "경고 시간 (초)"],
            ["rewarningSeconds", "재경고 간격 (초)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="grid gap-3 text-muted">
            {label}
            <input
              name={key}
              type="number"
              min={1}
              step={1}
              value={Number.isNaN(draft[key]) ? "" : draft[key]}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [key]: e.target.value === "" ? NaN : Number(e.target.value),
                })
              }
              className="rounded-xl border border-line p-4 text-ink"
            />
          </label>
        ))}
        <label className="flex items-center justify-between">
          소리 알림
          <input
            type="checkbox"
            checked={draft.sound}
            onChange={(e) => setDraft({ ...draft, sound: e.target.checked })}
            className="size-6 accent-primary-strong"
          />
        </label>
        <p role="alert" className="text-red-700">
          {error}
        </p>
        <div className="flex gap-4">
          <Button type="submit" variant="primary">
            적용
          </Button>
          <Button onClick={back}>취소</Button>
        </div>
      </form>
    </section>
  );
}
