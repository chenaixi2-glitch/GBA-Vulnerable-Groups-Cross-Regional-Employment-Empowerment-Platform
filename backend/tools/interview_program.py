"""面试模拟程序配置 — 统一三轮流程与极速/完整/专项版本。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ProgramVersion = Literal["quick", "full", "specialized"]
SpecializedFocus = Literal["technical", "final_negotiation", "resume_deep_dive"]
JobTrack = Literal["tech", "business", "functional", "general"]
StageId = Literal["screening", "professional", "final", "screening_final"]

TECH_KEYWORDS = ("开发", "工程师", "测试", "算法", "数据", "前端", "后端", "运维", "dev", "engineer", "qa", "test")
BUSINESS_KEYWORDS = ("产品", "运营", "市场", "销售", "商务", "推广", "pm", "product", "marketing", "sales")
FUNCTIONAL_KEYWORDS = ("人事", "行政", "财务", "文员", "hr", "admin", "finance", "会计", "出纳")


@dataclass
class InterviewStageConfig:
    stage_id: str
    name: str
    subtitle: str
    interviewer_role: str
    max_turns: int
    focus_modules: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    track_content: dict[str, str] = field(default_factory=dict)
    elimination_criteria: list[str] = field(default_factory=list)


@dataclass
class InterviewProgramConfig:
    version: str
    specialized_focus: str
    job_track: str
    stages: list[InterviewStageConfig]
    estimated_minutes: str

    @property
    def max_rounds(self) -> int:
        return sum(s.max_turns for s in self.stages)

    @property
    def stage_count(self) -> int:
        return len(self.stages)


SCREENING_MODULES = [
    "自我介绍（结构化：个人背景+核心经历+匹配岗位优势+求职意向）",
    "离职/求职原因（话术合理性、稳定性）",
    "对本次投递岗位、公司业务的理解",
    "个人职业规划（短期1-2年）",
    "通勤、到岗时间、基础薪资预期",
    "简单简历细节核实（校园经历、实习、基础工作内容）",
]

SCREENING_CATEGORIES = [
    "简历深挖与个人经历",
    "岗位认知与求职动机",
    "职业规划与稳定性",
]

FINAL_MODULES = [
    "深挖性格、优缺点、团队合作经历",
    "抗压/加班/紧急工作场景提问",
    "为什么录用你、核心竞争力",
    "薪资谈判、福利诉求、底线沟通",
    "反问面试官环节（考察求职者思维）",
]

FINAL_CATEGORIES = [
    "职场软实力与团队协作",
    "压力应变与短板复盘",
    "面试反向提问",
    "职业规划与稳定性",
]

PROFESSIONAL_TRACK_CONTENT: dict[str, str] = {
    "tech": (
        "技术岗考察：基础知识点提问 + 简历项目深挖（难点、亮点、复盘、报错解决）"
        " + 现场实操/手撕题 + 场景问题"
    ),
    "business": (
        "业务岗考察：过往项目业绩复盘 + 业务场景题（用户增长、活动落地、客诉处理）"
        " + 岗位工具使用 + 案例拆解"
    ),
    "functional": (
        "职能岗考察：岗位流程熟练度 + 日常工作场景处理 + 细致度/执行力案例 + 办公技能考察"
    ),
    "general": (
        "通用专业考察：项目实战能力 + 问题解决能力 + 业务思维 + 落地经验"
    ),
}

PROFESSIONAL_CATEGORIES = [
    "专业技能与岗位匹配",
    "项目实操与问题解决",
    "简历深挖与个人经历",
    "岗位认知与求职动机",
]

SPECIALIZED_CONFIGS: dict[str, dict] = {
    "technical": {
        "name": "专项·技术/专业面",
        "subtitle": "20-30分钟 · 核心提分环节",
        "interviewer_role": "部门主管/资深员工",
        "max_turns": 10,
        "focus_modules": [
            "基础知识点 / 岗位硬技能",
            "简历项目深挖（难点、亮点、复盘、报错解决）",
            "现场实操 / 场景题 / 手撕题（技术岗）或业务案例（业务岗）",
            "万能公式：做过什么→怎么做的→遇到什么问题→怎么解决→数据结果→复盘优化",
        ],
        "categories": PROFESSIONAL_CATEGORIES,
    },
    "final_negotiation": {
        "name": "专项·终面谈判",
        "subtitle": "10-15分钟 · 总监/HRD综合面",
        "interviewer_role": "总监/HRD",
        "max_turns": 6,
        "focus_modules": FINAL_MODULES,
        "categories": FINAL_CATEGORIES,
    },
    "resume_deep_dive": {
        "name": "专项·简历深挖",
        "subtitle": "15-20分钟 · 初筛+经历核实",
        "interviewer_role": "HR/基础面试官",
        "max_turns": 8,
        "focus_modules": SCREENING_MODULES,
        "categories": SCREENING_CATEGORIES + ["简历深挖与个人经历"],
    },
}


def detect_job_track(job_title: str = "", jd_text: str = "") -> str:
    """根据岗位标题与JD推断岗位赛道。"""
    combined = f"{job_title} {jd_text}".lower()
    if any(k in combined for k in TECH_KEYWORDS):
        return "tech"
    if any(k in combined for k in BUSINESS_KEYWORDS):
        return "business"
    if any(k in combined for k in FUNCTIONAL_KEYWORDS):
        return "functional"
    return "general"


def _screening_stage(max_turns: int = 5) -> InterviewStageConfig:
    return InterviewStageConfig(
        stage_id="screening",
        name="第一轮·初筛面试",
        subtitle="10-15分钟 · HR/基础面试官",
        interviewer_role="HR/初筛面试官",
        max_turns=max_turns,
        focus_modules=SCREENING_MODULES,
        categories=SCREENING_CATEGORIES,
        elimination_criteria=[
            "表达混乱", "求职动机模糊", "完全不了解岗位",
            "薪资严重不符", "稳定性差",
        ],
    )


def _professional_stage(job_track: str, max_turns: int = 8) -> InterviewStageConfig:
    return InterviewStageConfig(
        stage_id="professional",
        name="第二轮·专业/技术面",
        subtitle="20-30分钟 · 部门主管/资深员工",
        interviewer_role="部门主管/资深员工",
        max_turns=max_turns,
        focus_modules=[
            "岗位硬技能与项目实战能力",
            "问题解决能力与业务思维",
            "万能公式：做过什么→怎么做的→遇到什么问题→怎么解决→数据结果→复盘优化",
        ],
        categories=PROFESSIONAL_CATEGORIES,
        track_content={job_track: PROFESSIONAL_TRACK_CONTENT[job_track]},
    )


def _final_stage(max_turns: int = 4) -> InterviewStageConfig:
    return InterviewStageConfig(
        stage_id="final",
        name="第三轮·总监/HR终面",
        subtitle="10-15分钟 · 总监/HRD",
        interviewer_role="总监/HRD",
        max_turns=max_turns,
        focus_modules=FINAL_MODULES,
        categories=FINAL_CATEGORIES,
    )


def _screening_final_merged(max_turns: int = 5) -> InterviewStageConfig:
    return InterviewStageConfig(
        stage_id="screening_final",
        name="综合面·初筛+终面",
        subtitle="15分钟 · HR+综合评估（极速版合并轮）",
        interviewer_role="HR/综合面试官",
        max_turns=max_turns,
        focus_modules=SCREENING_MODULES + FINAL_MODULES[:3],
        categories=list(dict.fromkeys(SCREENING_CATEGORIES + FINAL_CATEGORIES)),
        elimination_criteria=[
            "表达混乱", "求职动机模糊", "完全不了解岗位",
            "薪资严重不符", "稳定性差", "价值观明显不匹配",
        ],
    )


def build_interview_program(
    version: str = "quick",
    specialized_focus: str = "",
    job_title: str = "",
    jd_text: str = "",
) -> InterviewProgramConfig:
    """构建面试程序配置。"""
    job_track = detect_job_track(job_title, jd_text)
    version = version if version in ("quick", "full", "specialized") else "quick"

    if version == "specialized":
        focus = specialized_focus if specialized_focus in SPECIALIZED_CONFIGS else "technical"
        cfg = SPECIALIZED_CONFIGS[focus]
        stage = InterviewStageConfig(
            stage_id=f"specialized_{focus}",
            name=cfg["name"],
            subtitle=cfg["subtitle"],
            interviewer_role=cfg["interviewer_role"],
            max_turns=cfg["max_turns"],
            focus_modules=cfg["focus_modules"],
            categories=cfg["categories"],
            track_content={job_track: PROFESSIONAL_TRACK_CONTENT[job_track]} if focus == "technical" else {},
        )
        return InterviewProgramConfig(
            version="specialized",
            specialized_focus=focus,
            job_track=job_track,
            stages=[stage],
            estimated_minutes="15-30",
        )

    if version == "full":
        stages = [
            _screening_stage(5),
            _professional_stage(job_track, 8),
            _final_stage(4),
        ]
        return InterviewProgramConfig(
            version="full",
            specialized_focus="",
            job_track=job_track,
            stages=stages,
            estimated_minutes="50-60",
        )

    # quick (default, recommended)
    stages = [
        _screening_final_merged(5),
        _professional_stage(job_track, 8),
    ]
    return InterviewProgramConfig(
        version="quick",
        specialized_focus="",
        job_track=job_track,
        stages=stages,
        estimated_minutes="25-35",
    )


def format_stage_context(stage: InterviewStageConfig, job_track: str) -> str:
    """格式化当前轮次考察内容供 Prompt 注入。"""
    lines = [
        f"【{stage.name}】{stage.subtitle}",
        f"面试官角色：{stage.interviewer_role}",
        "",
        "固定提问模块：",
    ]
    for i, mod in enumerate(stage.focus_modules, 1):
        lines.append(f"  {i}. {mod}")

    track_hint = stage.track_content.get(job_track) or PROFESSIONAL_TRACK_CONTENT.get(job_track, "")
    if track_hint:
        lines.extend(["", f"岗位赛道（{job_track}）专项考察：", f"  {track_hint}"])

    if stage.elimination_criteria:
        lines.extend(["", "淘汰/低分信号：", *[f"  - {c}" for c in stage.elimination_criteria]])

    lines.extend(["", "本轮可用分类标签：", f"  {' | '.join(stage.categories)}"])
    return "\n".join(lines)


def format_program_overview(program: InterviewProgramConfig) -> str:
    """格式化完整程序概览。"""
    version_labels = {
        "quick": "极速版（~30分钟）：合并初试+终面，保留完整专业复试",
        "full": "完整版（~60分钟）：三轮全流程",
        "specialized": f"专项版：{program.specialized_focus}",
    }
    lines = [
        version_labels.get(program.version, program.version),
        f"预计时长：{program.estimated_minutes}分钟",
        f"岗位赛道：{program.job_track}",
        f"共 {program.stage_count} 个阶段，{program.max_rounds} 轮问答",
        "",
    ]
    for i, stage in enumerate(program.stages, 1):
        lines.append(f"阶段{i}：{stage.name}（{stage.max_turns}轮）")
    return "\n".join(lines)
