"""합성 데이터로 분석 스크립트의 판정 로직을 확인한다."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent))
import analyze  # noqa: E402

rng = np.random.default_rng(0)


def front_rows(participant, label, n, head_forward, neck_len, pitch, noise=0.005, t0=0):
    return pd.DataFrame({
        "t_ms": t0 + np.arange(n) * 250,
        "participant": participant,
        "label": label,
        "head_forward": head_forward + rng.normal(0, noise, n),
        "neck_len": neck_len + rng.normal(0, noise, n),
        "pitch_deg": pitch + rng.normal(0, 0.5, n),
        "shoulder_tilt": rng.normal(0, noise, n),
        "ear_vis": 0.9,
        "shoulder_vis": 0.9,
        "fps": 4,
    })


def synth_t1(chair_shift=0.0):
    parts = []
    for who, body in (("p1", 0.0), ("p2", 0.05)):  # 체형 차이: 원래 값이 다름
        parts += [
            front_rows(who, "바른자세", 120, 0.33 + body, 0.75 + body, 0),
            front_rows(who, "거북목_강", 120, 0.38 + body, 0.68 + body, 8),
            front_rows(who, "의자당김", 120, 0.33 + body + chair_shift, 0.75 + body, 1),
        ]
    return pd.concat(parts, ignore_index=True)


def by_name(checks):
    return {c["name"].split(" (")[0]: c["passed"] for c in checks}


def test_t1_good_data_passes():
    r = analyze.analyze_t1(synth_t1())
    assert all(c["passed"] for c in r["checks"]), r["checks"]


def test_t1_flags_chair_pull_false_positive():
    r = analyze.analyze_t1(synth_t1(chair_shift=0.04))
    assert by_name(r["checks"])["의자당김이 거북목처럼 안 보임"] is False


def test_t1_chair_pull_in_opposite_direction_is_not_false_positive():
    # 실제 p1 데이터처럼 의자를 당기면 head_forward가 거북목 반대 방향으로 약간 움직이는 경우
    r = analyze.analyze_t1(synth_t1(chair_shift=-0.01))
    assert by_name(r["checks"])["의자당김이 거북목처럼 안 보임"] is True


def test_t1_flags_low_shoulder_detection():
    df = synth_t1()
    df.loc[df.index % 3 == 0, "shoulder_vis"] = 0.1
    r = analyze.analyze_t1(df)
    assert by_name(r["checks"])["어깨 인식 비율 ≥ 80%"] is False


def side_rows(label, n, angle, noise, condition="50cm_책상"):
    return pd.DataFrame({
        "t_ms": np.arange(n) * 250,
        "participant": "p1",
        "label": label,
        "condition": condition,
        "angle_deg": angle + rng.normal(0, noise, n),
        "side": "left",
        "ear_vis": 0.9,
        "shoulder_vis": 0.9,
        "fps": 4,
    })


@pytest.mark.parametrize("noise, expected", [(1.0, True), (4.0, False)])
def test_t2_noise_threshold(noise, expected):
    df = pd.concat([
        side_rows("정지_1분", 240, 70, noise),
        side_rows("바른자세", 120, 70, noise),
        side_rows("거북목_강", 120, 55, noise),
    ], ignore_index=True)
    r = analyze.analyze_t2(df)
    assert by_name(r["checks"])["가만히 있을 때 흔들림 ≤ ±2.0°"] is expected


def test_t2_counts_undetected_rows_in_detect_rate():
    df = side_rows("바른자세", 100, 70, 1.0)
    df.loc[:49, ["ear_vis", "shoulder_vis", "angle_deg"]] = np.nan  # 인식 실패 행
    r = analyze.analyze_t2(df)
    assert r["detect_rate"].iloc[0] == pytest.approx(0.5)


def test_compare_mae():
    df = pd.DataFrame({"photo": ["a", "b"], "app_angle": [70, 60], "manual_angle": [68, 63], "diff": [2, -3]})
    r = analyze.analyze_compare(df)
    assert r["checks"][0]["value"] == pytest.approx(2.5)
    assert r["checks"][0]["passed"]


def synth_t3(drift=0.0, n=480):
    # 바른자세 ↔ 거북목을 천천히 오가는 2분: 정답 각도는 정면 신호의 선형 함수 + 잡음
    phase = (np.sin(np.linspace(0, 4 * np.pi, n)) + 1) / 2
    hf = 0.33 + 0.05 * phase + rng.normal(0, 0.003, n)
    nl = 0.75 - 0.07 * phase + rng.normal(0, 0.003, n)
    pitch = 8 * phase + rng.normal(0, 0.5, n)
    angle = 70 - 150 * (hf - 0.33) + 60 * (nl - 0.75) - 0.3 * pitch + drift + rng.normal(0, 1.0, n)
    return pd.DataFrame({
        "t_ms": np.arange(n) * 250,
        "participant": "p1",
        "label": "보정_연속",
        "head_forward": hf,
        "neck_len": nl,
        "pitch_deg": pitch,
        "shoulder_vis": 0.9,
        "side_angle": angle,
        "side_vis": 0.9,
        "side_age_ms": 120,
    })


def test_t3_learns_mapping_and_flags_next_day_drift():
    r = analyze.analyze_t3(synth_t3(), next_day=synth_t3(drift=10))
    row = r["results"][0]
    assert row["mae_test"] < 2.0
    assert row["mae_next_day"] > 7.0
    checks = by_name(r["checks"])
    assert checks["같은 날 평균 오차 ≤ 5.0°"] is True
    assert checks["다음 날 평균 오차 ≤ 7.0°"] is False


def test_t3_ignores_stale_side_values():
    df = synth_t3()
    df["side_age_ms"] = 5000  # 옆모습 값이 전부 오래됨 → 짝지을 데이터 없음
    r = analyze.analyze_t3(df)
    assert r["results"] == []
    assert r["checks"] == []


def test_load_reads_bom_csv_and_fills_blank_participant(tmp_path):
    path = tmp_path / "front.csv"
    path.write_text("t_ms,participant,label\n1,,바른자세\n", encoding="utf-8-sig")
    df = analyze.load([str(path)])
    assert df.loc[0, "participant"] == "-"
    assert df.loc[0, "label"] == "바른자세"
