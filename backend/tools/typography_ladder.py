"""Typography step ladder for resume PDF page fitting."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from workflow.state import RenderConfig

TypographyFitMode = str  # auto | comfortable | compact

TYPOGRAPHY_FIT_MODES: frozenset[str] = frozenset({"auto", "comfortable", "compact"})
BASELINE_STEP_INDEX = 2


@dataclass(frozen=True)
class TypographyStep:
    font_size_delta: int = 0
    margin_delta: int = 0
    spacing_scale: str | None = None
    dense_mode: bool | None = None
    line_height_delta: float = 0.0


# Index 0 = loosest, BASELINE_STEP_INDEX = experience-tier baseline, higher = tighter.
TYPOGRAPHY_LADDER: tuple[TypographyStep, ...] = (
    TypographyStep(+2, +4, "relaxed", False, +0.08),
    TypographyStep(+1, +2, "standard", False, +0.04),
    TypographyStep(0, 0, None, None, 0.0),
    TypographyStep(-1, -2, "compact", True, -0.05),
    TypographyStep(-2, -4, "compact", True, -0.08),
    TypographyStep(-3, -6, "compact", True, -0.12),
)


def normalize_typography_fit_mode(value: str | None) -> TypographyFitMode:
    mode = (value or "auto").strip().lower()
    return mode if mode in TYPOGRAPHY_FIT_MODES else "auto"


def initial_step_index(mode: TypographyFitMode) -> int:
    """Starting ladder index before loosen/tighten passes."""
    if mode == "compact":
        return min(BASELINE_STEP_INDEX + 1, len(TYPOGRAPHY_LADDER) - 1)
    return BASELINE_STEP_INDEX


def apply_typography_step(config: "RenderConfig", step_index: int) -> "RenderConfig":
    """Return a copy of *config* with ladder offsets applied."""
    step_index = max(0, min(step_index, len(TYPOGRAPHY_LADDER) - 1))
    step = TYPOGRAPHY_LADDER[step_index]
    margin = config.page_margin

    def _margin(side: int) -> int:
        return max(12, min(32, side + step.margin_delta))

    font_size = max(10, min(15, config.font_size + step.font_size_delta))
    line_height = max(1.2, min(1.5, round(config.line_height + step.line_height_delta, 2)))
    spacing_scale = step.spacing_scale if step.spacing_scale is not None else config.spacing_scale
    dense_mode = step.dense_mode if step.dense_mode is not None else config.dense_mode

    return config.model_copy(update={
        "font_size": font_size,
        "line_height": line_height,
        "spacing_scale": spacing_scale,
        "dense_mode": dense_mode,
        "page_margin": margin.model_copy(update={
            "top": _margin(margin.top),
            "right": _margin(margin.right),
            "bottom": _margin(margin.bottom),
            "left": _margin(margin.left),
        }),
    })


def fit_typography_to_page_limit(
    *,
    render_config: "RenderConfig",
    page_limit: int,
    count_pages,
    render_html,
) -> tuple["RenderConfig", str, int | None, int]:
    """Pick the loosest readable step within *page_limit*, or the tightest if over.

    *count_pages(html)* and *render_html(config)* are injected for testing.
    Returns (config, html, page_count, steps_evaluated).
    """
    mode = normalize_typography_fit_mode(render_config.typography_fit_mode)
    baseline_config = render_config
    steps_evaluated = 0

    def _render(step_index: int) -> tuple["RenderConfig", str, int | None]:
        nonlocal steps_evaluated
        steps_evaluated += 1
        cfg = apply_typography_step(baseline_config, step_index)
        html = render_html(cfg)
        pages = count_pages(html)
        return cfg, html, pages

    start = initial_step_index(mode)
    best_index = start
    best_cfg, best_html, best_pages = _render(start)

    if mode in ("auto", "comfortable"):
        for step_index in range(start - 1, -1, -1):
            cfg, html, pages = _render(step_index)
            if pages is not None and pages <= page_limit:
                best_index, best_cfg, best_html, best_pages = step_index, cfg, html, pages
            else:
                break

    if best_pages is not None and best_pages > page_limit:
        for step_index in range(best_index + 1, len(TYPOGRAPHY_LADDER)):
            cfg, html, pages = _render(step_index)
            if pages is not None and pages <= page_limit:
                best_index, best_cfg, best_html, best_pages = step_index, cfg, html, pages
                break

    return best_cfg, best_html, best_pages, steps_evaluated
