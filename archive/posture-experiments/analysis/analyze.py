"""기술 검증 데이터 분석 (docs/01_기술검증_플랜.md의 T1, T2, T3).

사용법:
  python analysis/analyze.py t1 data/front_*.csv
  python analysis/analyze.py t2 data/side_*.csv
  python analysis/analyze.py compare data/compare_*.csv
  python analysis/analyze.py t3 data/front_day1.csv --next-day data/front_day2.csv
"""
from __future__ import annotations

import argparse
import glob
from pathlib import Path

import numpy as np
import pandas as pd

FRONT_SIGNALS = ["head_forward", "neck_len", "pitch_deg", "shoulder_tilt"]
RATIO_SIGNALS = ["head_forward", "neck_len"]   # 의자 당김에 흔들리면 안 되는 신호
T3_FEATURES = ["head_forward", "neck_len", "pitch_deg"]
GOOD = "바른자세"
STRONG = "거북목_강"
CHAIR = "의자당김"
STILL = "정지_1분"

# 성공 기준 (플랜의 제안값. 바꾸고 싶으면 여기만 고치면 된다)
VIS_MIN = 0.5                # 이 값 이상이면 "인식됨"
T1_MIN_EFFECT = 2.0          # 바른자세 vs 거북목_강: 신호 하나라도 |Cohen's d| 이상이면 분리됨
T1_CHAIR_MAX_TOWARD = 0.25   # 의자당김: 비율 신호가 거북목_강 변화량의 이 비율 이상 "같은 방향"으로 가면 거북목처럼 보임
T1_MIN_SHOULDER_RATE = 0.8
MIN_FPS = 2.0
T2_MAX_NOISE = 2.0           # 가만히 있을 때 흔들림(표준편차, 도)
T2_MIN_SIGNAL_TO_NOISE = 3.0 # (바른자세 − 거북목_강) 차이가 흔들림의 몇 배 이상
COMPARE_MAX_MAE = 5.0
T3_MAX_MAE = 5.0
T3_MAX_MAE_NEXT_DAY = 7.0
T3_MAX_SIDE_AGE_MS = 500     # 이보다 오래된 옆모습 값은 짝으로 쓰지 않음
T3_TRAIN_RATIO = 0.7


def load(paths: list[str]) -> pd.DataFrame:
    files = [f for p in paths for f in (sorted(glob.glob(p)) or [p])]
    frames = [pd.read_csv(f, encoding="utf-8-sig").assign(source=Path(f).name) for f in files]
    df = pd.concat(frames, ignore_index=True)
    for col in ("participant", "condition"):
        if col in df:
            df[col] = df[col].fillna("-").astype(str)
    return df


def cohens_d(a: pd.Series, b: pd.Series) -> float:
    a, b = a.dropna(), b.dropna()
    if len(a) < 2 or len(b) < 2:
        return float("nan")
    pooled = np.sqrt(((len(a) - 1) * a.var() + (len(b) - 1) * b.var()) / (len(a) + len(b) - 2))
    return float((b.mean() - a.mean()) / pooled) if pooled > 0 else float("nan")


def check(name: str, value: float, passed: bool) -> dict:
    return {"name": name, "value": value, "passed": bool(passed)}


# ---------------------------------------------------------------- T1

def analyze_t1(df: pd.DataFrame) -> dict:
    df = df.copy()
    # 체형이 사람마다 달라서 원래 값 대신 "본인 바른자세 평균 대비 변화량"으로 비교한다.
    for s in FRONT_SIGNALS:
        base = df[df.label == GOOD].groupby("participant")[s].mean()
        df[f"d_{s}"] = df[s] - df["participant"].map(base)
    deltas = [f"d_{s}" for s in FRONT_SIGNALS]

    stats = df.groupby("label")[deltas].agg(["mean", "std", "count"])
    good = df[df.label == GOOD]
    effect = pd.DataFrame(
        {s: {lab: cohens_d(good[f"d_{s}"], g[f"d_{s}"]) for lab, g in df.groupby("label") if lab != GOOD}
         for s in FRONT_SIGNALS}
    )

    checks = []
    if STRONG in effect.index:
        best = effect.loc[STRONG].abs().max()
        checks.append(check(f"바른자세 vs {STRONG} 분리 (가장 큰 |d| ≥ {T1_MIN_EFFECT})", best, best >= T1_MIN_EFFECT))
    if CHAIR in stats.index and STRONG in stats.index:
        # 변화 크기만 보면 반대 방향(거북목과 무관한 변화)도 실패로 잡힌다.
        # 거북목_강 쪽으로 얼마나 갔는지를 본다. 음수면 반대 방향.
        toward = max(
            stats.loc[CHAIR, (f"d_{s}", "mean")] / stats.loc[STRONG, (f"d_{s}", "mean")]
            for s in RATIO_SIGNALS
            if stats.loc[STRONG, (f"d_{s}", "mean")] != 0
        )
        checks.append(check(f"{CHAIR}이 거북목처럼 안 보임 (비율 신호가 {STRONG} 쪽으로 {T1_CHAIR_MAX_TOWARD:.0%} 미만 이동)", toward, toward < T1_CHAIR_MAX_TOWARD))
    shoulder_rate = (df.shoulder_vis >= VIS_MIN).mean()
    checks.append(check(f"어깨 인식 비율 ≥ {T1_MIN_SHOULDER_RATE:.0%}", shoulder_rate, shoulder_rate >= T1_MIN_SHOULDER_RATE))
    fps = df.fps.mean()
    checks.append(check(f"처리 속도 ≥ {MIN_FPS}fps", fps, fps >= MIN_FPS))

    return {"data": df, "stats": stats, "effect": effect, "checks": checks}


# ---------------------------------------------------------------- T2

def analyze_t2(df: pd.DataFrame) -> dict:
    df = df.copy()
    detected = (df.ear_vis >= VIS_MIN) & (df.shoulder_vis >= VIS_MIN)
    ok = df[detected]

    stats = ok.groupby(["condition", "label"])["angle_deg"].agg(["mean", "std", "count"])
    detect_rate = df.assign(detected=detected).groupby("condition")["detected"].mean()

    checks = []
    still = ok[ok.label == STILL]
    noise = still.groupby(["participant", "condition"])["angle_deg"].std().mean() if len(still) else float("nan")
    if not np.isnan(noise):
        checks.append(check(f"가만히 있을 때 흔들림 ≤ ±{T2_MAX_NOISE}°", noise, noise <= T2_MAX_NOISE))

    means = ok.groupby("label")["angle_deg"].mean()
    if GOOD in means and STRONG in means and not np.isnan(noise):
        gap = means[GOOD] - means[STRONG]
        ratio = gap / noise if noise > 0 else float("inf")
        checks.append(check(f"{GOOD}−{STRONG} 차이가 흔들림의 {T2_MIN_SIGNAL_TO_NOISE}배 이상", ratio, ratio >= T2_MIN_SIGNAL_TO_NOISE))

    fps = df.fps.mean()
    checks.append(check(f"처리 속도 ≥ {MIN_FPS}fps", fps, fps >= MIN_FPS))
    return {"data": df, "stats": stats, "detect_rate": detect_rate, "checks": checks}


def analyze_compare(df: pd.DataFrame) -> dict:
    d = df.dropna(subset=["app_angle", "manual_angle"])
    mae = (d.app_angle - d.manual_angle).abs().mean()
    return {"n": len(d), "checks": [check(f"사진 수동 측정과 평균 차이 ≤ {COMPARE_MAX_MAE}°", mae, mae <= COMPARE_MAX_MAE)]}


# ---------------------------------------------------------------- T3

def paired(df: pd.DataFrame) -> pd.DataFrame:
    m = df.dropna(subset=T3_FEATURES + ["side_angle", "side_age_ms"])
    m = m[(m.side_age_ms <= T3_MAX_SIDE_AGE_MS) & (m.side_vis >= VIS_MIN) & (m.shoulder_vis >= VIS_MIN)]
    return m.sort_values("t_ms")


def analyze_t3(df: pd.DataFrame, next_day: pd.DataFrame | None = None) -> dict:
    from sklearn.linear_model import LinearRegression

    rows, notes = [], []
    next_pairs = paired(next_day) if next_day is not None else None
    for who, g in paired(df).groupby("participant"):
        cut = int(len(g) * T3_TRAIN_RATIO)
        if cut < 10 or len(g) - cut < 5:
            notes.append(f"{who}: 짝지은 데이터가 {len(g)}행뿐이라 건너뜀")
            continue
        # 시간 순서대로 앞부분 학습, 뒷부분 검증 (섞으면 비슷한 순간이 양쪽에 들어가 오차가 작게 나온다)
        train, test = g.iloc[:cut], g.iloc[cut:]
        model = LinearRegression().fit(train[T3_FEATURES], train.side_angle)
        test_pred = model.predict(test[T3_FEATURES])
        row = {
            "participant": who,
            "n_train": len(train),
            "n_test": len(test),
            "mae_test": float(np.abs(test_pred - test.side_angle).mean()),
            "mae_next_day": float("nan"),
            "intercept": float(model.intercept_),
            **{f"coef_{f}": float(c) for f, c in zip(T3_FEATURES, model.coef_)},
            "_test": test.assign(pred=test_pred),
        }
        if next_pairs is not None:
            nd = next_pairs[next_pairs.participant == who]
            if len(nd):
                row["mae_next_day"] = float(np.abs(model.predict(nd[T3_FEATURES]) - nd.side_angle).mean())
        rows.append(row)

    checks = []
    if rows:
        worst = max(r["mae_test"] for r in rows)
        checks.append(check(f"같은 날 평균 오차 ≤ {T3_MAX_MAE}° (가장 나쁜 참여자)", worst, worst <= T3_MAX_MAE))
        nexts = [r["mae_next_day"] for r in rows if not np.isnan(r["mae_next_day"])]
        if nexts:
            checks.append(check(f"다음 날 평균 오차 ≤ {T3_MAX_MAE_NEXT_DAY}° (가장 나쁜 참여자)", max(nexts), max(nexts) <= T3_MAX_MAE_NEXT_DAY))
    return {"results": rows, "notes": notes, "checks": checks}


def js_formula(row: dict) -> str:
    terms = " + ".join(f"({row[f'coef_{f}']:.4f} * {f})" for f in T3_FEATURES)
    return f"angle = {row['intercept']:.4f} + {terms}"


# ---------------------------------------------------------------- 출력

def setup_plot():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager
    installed = {f.name for f in font_manager.fontManager.ttflist}
    for font in ("Malgun Gothic", "AppleGothic", "NanumGothic"):
        if font in installed:
            plt.rcParams["font.family"] = font
            break
    plt.rcParams["axes.unicode_minus"] = False
    return plt


def print_checks(checks: list[dict]) -> None:
    print("\n[성공 기준]")
    for c in checks:
        mark = "PASS" if c["passed"] else "FAIL"
        print(f"  {mark}  {c['name']}  → {c['value']:.3f}")


def plot_t1(result: dict, out: Path) -> Path:
    plt = setup_plot()
    df = result["data"]
    labels = list(df.label.dropna().unique())
    fig, axes = plt.subplots(2, 2, figsize=(12, 8))
    for ax, s in zip(axes.flat, FRONT_SIGNALS):
        ax.boxplot([df.loc[df.label == lab, f"d_{s}"].dropna() for lab in labels], tick_labels=labels, showfliers=False)
        ax.axhline(0, color="gray", lw=0.8)
        ax.set_title(f"{s} (바른자세 대비 변화량)")
        ax.tick_params(axis="x", rotation=30)
    fig.tight_layout()
    path = out / "t1_boxplot.png"
    fig.savefig(path, dpi=120)
    return path


def plot_t3(result: dict, out: Path) -> list[Path]:
    plt = setup_plot()
    paths = []
    for r in result["results"]:
        t = r["_test"]
        sec = (t.t_ms - t.t_ms.iloc[0]) / 1000
        fig, ax = plt.subplots(figsize=(10, 4))
        ax.plot(sec, t.side_angle, label="옆모습 각도 (정답)")
        ax.plot(sec, t.pred, label="정면 신호로 추정")
        ax.set_xlabel("검증 구간 시간 (초)")
        ax.set_ylabel("각도 (°)")
        ax.set_title(f"T3 {r['participant']} · 평균 오차 {r['mae_test']:.2f}°")
        ax.legend()
        fig.tight_layout()
        path = out / f"t3_{r['participant']}.png"
        fig.savefig(path, dpi=120)
        paths.append(path)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("test", choices=["t1", "t2", "compare", "t3"])
    parser.add_argument("files", nargs="+", help="CSV 파일 (와일드카드 가능)")
    parser.add_argument("--next-day", nargs="+", help="T3: 다음 날 재측정 CSV")
    parser.add_argument("--out", default="results", help="그래프 저장 폴더")
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    df = load(args.files)
    pd.set_option("display.width", 160)
    pd.set_option("display.max_columns", 20)

    if args.test == "t1":
        r = analyze_t1(df)
        print("[라벨별 바른자세 대비 변화량]\n", r["stats"].round(4))
        print("\n[바른자세 대비 효과 크기 Cohen's d (절대값이 클수록 잘 구분됨)]\n", r["effect"].round(2))
        print(f"\n그래프: {plot_t1(r, out)}")
    elif args.test == "t2":
        r = analyze_t2(df)
        print("[조건·라벨별 각도]\n", r["stats"].round(2))
        print("\n[조건별 인식률 (귀·어깨 모두 인식)]\n", r["detect_rate"].round(3))
    elif args.test == "compare":
        r = analyze_compare(df)
        print(f"비교한 사진 {r['n']}장")
    else:
        r = analyze_t3(df, load(args.next_day) if args.next_day else None)
        for note in r["notes"]:
            print("참고:", note)
        for row in r["results"]:
            print(f"\n[{row['participant']}] 학습 {row['n_train']}행 / 검증 {row['n_test']}행")
            print(f"  같은 날 평균 오차 {row['mae_test']:.2f}°, 다음 날 {row['mae_next_day']:.2f}°")
            print(f"  JS용 식: {js_formula(row)}")
        for p in plot_t3(r, out):
            print("그래프:", p)

    print_checks(r["checks"])


if __name__ == "__main__":
    main()
