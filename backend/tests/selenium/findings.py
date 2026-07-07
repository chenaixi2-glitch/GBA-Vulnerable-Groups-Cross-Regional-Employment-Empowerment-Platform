"""Collect E2E findings and write a markdown report (no auto-fix)."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class Finding:
    id: str
    area: str
    severity: str  # info | warning | error
    title: str
    detail: str
    recommendation: str
    i18n_notes: str = ""
    extra: dict[str, Any] = field(default_factory=dict)


class FindingsCollector:
    def __init__(self) -> None:
        self.items: list[Finding] = []

    def add(
        self,
        *,
        id: str,
        area: str,
        severity: str,
        title: str,
        detail: str,
        recommendation: str,
        i18n_notes: str = "",
        **extra: Any,
    ) -> None:
        self.items.append(
            Finding(
                id=id,
                area=area,
                severity=severity,
                title=title,
                detail=detail,
                recommendation=recommendation,
                i18n_notes=i18n_notes,
                extra=extra,
            )
        )

    def add_once(self, **kwargs) -> None:
        id_ = kwargs.get("id")
        if id_ and any(x.id == id_ for x in self.items):
            return
        self.add(**kwargs)

    def write_report(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            "# Selenium E2E 问题记录与推荐方案",
            "",
            f"生成时间 (UTC): {datetime.now(timezone.utc).isoformat()}",
            "",
            "> 本文档由自动化测试生成，仅记录问题与建议，**不包含代码修改**.",
            "",
        ]
        if not self.items:
            lines.append("未发现需记录的问题。")
        else:
            for i, f in enumerate(self.items, 1):
                lines.extend(
                    [
                        f"## {i}. [{f.severity.upper()}] {f.title}",
                        "",
                        f"- **编号**: `{f.id}`",
                        f"- **模块**: {f.area}",
                        f"- **现象**: {f.detail}",
                        f"- **推荐方案**: {f.recommendation}",
                    ]
                )
                if f.i18n_notes:
                    lines.append(f"- **i18n 注意**: {f.i18n_notes}")
                if f.extra:
                    lines.append(f"- **附加信息**: `{json.dumps(f.extra, ensure_ascii=False)}`")
                lines.append("")

        path.write_text("\n".join(lines), encoding="utf-8")
        json_path = path.with_suffix(".json")
        json_path.write_text(
            json.dumps([asdict(x) for x in self.items], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return path
