"""LLM 统一封装：基于 config.yaml 的 provider 动态创建 LangChain Chat Model。"""

import asyncio
import json
import os
import time
from typing import Any, TypeVar

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, ValidationError

from config_loader import (
    get_config,
    get_llm_config,
    get_judge_llm_config,
    get_resume_parse_config,
    get_translation_config,
    get_resume_generation_config,
    _resolve_api_key,
)
from log import get_logger, elapsed_ms, log_stage_timing

_timing_logger = get_logger("agent")


_llm_instance: Any | None = None
_judge_llm_instance: Any | None = None
_resume_parse_llm_instance: Any | None = None
_translation_llm_instance: Any | None = None
_resume_generation_llm_instance: Any | None = None
_SchemaT = TypeVar("_SchemaT", bound=BaseModel)


def _normalize_provider(provider: str) -> str:
    return (provider or "openai").strip().lower()


def _create_openai_compatible_llm(cfg: dict) -> Any:
    kwargs: dict[str, Any] = {
        "model": cfg["model"],
        "temperature": cfg["temperature"],
        "max_tokens": cfg["max_tokens"],
    }
    if cfg.get("api_key"):
        kwargs["openai_api_key"] = cfg["api_key"]
    if cfg.get("api_base"):
        kwargs["openai_api_base"] = cfg["api_base"]
    if cfg.get("timeout") is not None:
        kwargs["request_timeout"] = cfg["timeout"]

    model_kwargs = cfg.get("model_kwargs") or {}
    if model_kwargs:
        kwargs["model_kwargs"] = model_kwargs

    return ChatOpenAI(**kwargs)


def _create_azure_openai_llm(cfg: dict) -> Any:
    from langchain_openai import AzureChatOpenAI

    kwargs: dict[str, Any] = {
        "azure_deployment": cfg.get("deployment") or cfg["model"],
        "api_version": cfg.get("api_version") or "2024-02-15-preview",
        "temperature": cfg["temperature"],
        "max_tokens": cfg["max_tokens"],
    }
    if cfg.get("api_base"):
        kwargs["azure_endpoint"] = cfg["api_base"]
    if cfg.get("api_key"):
        kwargs["api_key"] = cfg["api_key"]

    model_kwargs = cfg.get("model_kwargs") or {}
    if model_kwargs:
        kwargs["model_kwargs"] = model_kwargs

    return AzureChatOpenAI(**kwargs)


def _create_anthropic_llm(cfg: dict) -> Any:
    from langchain_anthropic import ChatAnthropic

    kwargs: dict[str, Any] = {
        "model": cfg["model"],
        "temperature": cfg["temperature"],
        "max_tokens": cfg["max_tokens"],
    }
    if cfg.get("api_key"):
        kwargs["anthropic_api_key"] = cfg["api_key"]

    return ChatAnthropic(**kwargs)


def _create_ollama_llm(cfg: dict) -> Any:
    try:
        from langchain_ollama import ChatOllama
    except ImportError:
        from langchain_community.chat_models import ChatOllama

    kwargs: dict[str, Any] = {
        "model": cfg["model"],
        "temperature": cfg["temperature"],
    }
    if cfg.get("api_base"):
        kwargs["base_url"] = cfg["api_base"]

    return ChatOllama(**kwargs)


def setup_langsmith() -> str | None:
    """从 config.yaml 读取配置并设置 LangSmith 环境变量。"""
    cfg = get_config().get("langsmith", {})
    if not cfg.get("tracing_v2"):
        return None

    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    project = cfg.get("project", "ai-career-copilot")
    os.environ["LANGCHAIN_PROJECT"] = project

    api_key_env = cfg.get("api_key_env", "LANGCHAIN_API_KEY")
    api_key = _resolve_api_key(api_key_env)
    if api_key:
        os.environ["LANGCHAIN_API_KEY"] = api_key

    endpoint = cfg.get("endpoint", "https://api.smith.langchain.com")
    os.environ["LANGCHAIN_ENDPOINT"] = endpoint

    return f"https://smith.langchain.com/o/default/projects?filter=name%3D{project}"


def create_llm_from_config(cfg: dict) -> Any:
    """根据标准化 LLM 配置 dict 创建 Chat Model 实例。"""
    provider = _normalize_provider(cfg.get("provider", "openai"))

    if provider in {"openai", "deepseek", "qwen", "openai_compatible"}:
        return _create_openai_compatible_llm(cfg)
    if provider in {"azure_openai", "azure"}:
        return _create_azure_openai_llm(cfg)
    if provider in {"anthropic", "claude"}:
        return _create_anthropic_llm(cfg)
    if provider in {"ollama", "local"}:
        return _create_ollama_llm(cfg)

    raise ValueError(
        "Unsupported llm.provider='{}'. Supported providers: openai, deepseek, "
        "qwen, openai_compatible, azure_openai, anthropic, ollama".format(provider)
    )


def _get_or_create_llm(
    cache_attr: str,
    cfg_loader,
) -> Any:
    cached = globals().get(cache_attr)
    if cached is not None:
        return cached
    instance = create_llm_from_config(cfg_loader())
    globals()[cache_attr] = instance
    return instance


def get_llm() -> Any:
    """获取或创建共享的 LLM 实例。"""
    return _get_or_create_llm("_llm_instance", get_llm_config)


def get_judge_llm() -> Any:
    """Get or create the LLM-as-judge instance (separate model config)."""
    return _get_or_create_llm("_judge_llm_instance", get_judge_llm_config)


def get_resume_parse_llm() -> Any:
    """简历 OCR / 画像解析专用 LLM。"""
    return _get_or_create_llm("_resume_parse_llm_instance", get_resume_parse_config)


def get_translation_llm() -> Any:
    """翻译专用 LLM（Hunyuan-MT）。"""
    return _get_or_create_llm("_translation_llm_instance", get_translation_config)


def get_resume_generation_llm() -> Any:
    """简历内容生成专用 LLM。"""
    return _get_or_create_llm("_resume_generation_llm_instance", get_resume_generation_config)


def _extract_text_content(response: Any) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict):
                parts.append(str(part.get("text", "")))
            else:
                parts.append(str(part))
        return "".join(parts).strip()
    return str(content).strip()


def _get_json_llm(llm: Any) -> Any:
    """Prefer JSON object mode when the provider supports OpenAI-style response_format."""
    if not hasattr(llm, "bind"):
        return llm
    try:
        return llm.bind(response_format={"type": "json_object"})
    except Exception:
        return llm


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip().replace("\ufeff", "")
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [line for line in lines if not line.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()
    return cleaned


def _extract_balanced_json(text: str) -> str:
    start_positions = [index for index, char in enumerate(text) if char in "[{"]
    for start in start_positions:
        opener = text[start]
        closer = "}" if opener == "{" else "]"
        depth = 0
        in_string = False
        escape = False
        for index in range(start, len(text)):
            char = text[index]
            if in_string:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
                continue
            if char == opener:
                depth += 1
            elif char == closer:
                depth -= 1
                if depth == 0:
                    return text[start:index + 1]
    return text


_DEGENERATE_TOKEN_PATTERNS = (
    ('" "', 40),
    ("项目描述", 12),
    ("content\": \"项目", 8),
    ("仅输出", 6),
    ("contentcontent", 1),
)


def _looks_like_degenerate_json_output(text: str) -> bool:
    """Detect repetition loops that are useless for JSON repair."""
    sample = (text or "")[:6000]
    if not sample.strip():
        return True
    for needle, threshold in _DEGENERATE_TOKEN_PATTERNS:
        if sample.count(needle) >= threshold:
            return True
    # High density of isolated quote/space pairs
    if len(sample) > 800 and sample.count('"') > 200 and sample.count('" "') > 30:
        return True
    # Length-truncated instruction-echo degeneration (seen on SiliconFlow polish failures)
    if "仅输出" in sample and sample.count('"') > 40 and "{" in sample[:40]:
        # Valid short JSON rarely needs dozens of quotes plus instruction echo.
        if "items" not in sample or len(sample) > 1500:
            return True
    return False


def _build_repair_prompt(raw_output: str, schema: type[BaseModel], error: Exception) -> str:
    schema_json = json.dumps(schema.model_json_schema(), ensure_ascii=False, indent=2)
    # Cap repair payload — stuffing multi-KB degeneration loops makes retry worse.
    clipped = raw_output if len(raw_output) <= 4000 else raw_output[:4000] + "\n…(truncated)"
    return (
        "你是 JSON 修复器。请把下面内容修复为单个合法 JSON 对象，并严格符合给定 JSON Schema。"
        "不要输出 Markdown，不要输出解释，不要输出代码块。\n\n"
        f"JSON Schema:\n{schema_json}\n\n"
        f"上一轮错误:\n{error}\n\n"
        f"待修复内容:\n{clipped}"
    )


async def _ainvoke_model(llm: Any, payload: Any) -> Any:
    if hasattr(llm, "ainvoke"):
        return await llm.ainvoke(payload)
    return await asyncio.to_thread(llm.invoke, payload)


def _content_from_length_error(exc: BaseException) -> str:
    """Recover truncated text from openai.LengthFinishReasonError when possible."""
    completion = getattr(exc, "completion", None)
    if completion is None:
        return ""
    choices = getattr(completion, "choices", None) or []
    if not choices:
        return ""
    message = getattr(choices[0], "message", None)
    return _extract_text_content(getattr(message, "content", "") or "")


async def ainvoke_json_with_schema(
    llm: Any,
    prompt: str,
    schema: type[_SchemaT],
    logger: Any,
    agent_name: str,
) -> _SchemaT:
    """异步调用 LLM 并执行 JSON Schema 校验。"""
    json_llm = _get_json_llm(llm)
    request_prompt = prompt
    last_error: Exception | None = None
    use_json_mode = True

    for attempt in range(2):
        llm_t0 = time.perf_counter()
        active_llm = json_llm if use_json_mode else llm
        hit_length_limit = False
        try:
            response = await _ainvoke_model(active_llm, request_prompt)
            raw_output = _extract_text_content(response)
        except Exception as invoke_exc:
            # Some providers raise LengthFinishReasonError when completion hits max_tokens.
            raw_output = _content_from_length_error(invoke_exc)
            hit_length_limit = True
            if not raw_output:
                logger.error("%s LLM invoke failed on attempt %d: %s", agent_name, attempt + 1, invoke_exc)
                last_error = invoke_exc
                if attempt == 0:
                    use_json_mode = False
                    request_prompt = (
                        f"{prompt}\n\n"
                        "CRITICAL: Previous output hit the token limit. "
                        "Return one compact valid JSON object only (<1500 tokens). "
                        "No Markdown, no prose, no repetition."
                    )
                    continue
                break
            logger.warning(
                "%s hit output length limit on attempt %d; trying truncated content (%d chars)",
                agent_name,
                attempt + 1,
                len(raw_output),
            )
            last_error = invoke_exc

        log_stage_timing(
            _timing_logger,
            f"llm.{agent_name}",
            elapsed_ms(llm_t0),
            attempt=attempt + 1,
            repair=attempt > 0,
        )

        # Length-truncated degeneration is not worth parsing/repairing — retry compact.
        if hit_length_limit and attempt == 0 and _looks_like_degenerate_json_output(raw_output):
            logger.warning(
                "%s degenerate truncated output; retrying with compact instruction",
                agent_name,
            )
            use_json_mode = True
            request_prompt = (
                f"{prompt}\n\n"
                "CRITICAL: Previous attempt hit the output length limit and degenerated. "
                "Return one compact valid JSON object only (<800 tokens). "
                "No Markdown, no prose, no repetition."
            )
            continue

        try:
            parsed = parse_json_response(raw_output)
            return schema.model_validate(parsed)
        except (json.JSONDecodeError, ValidationError, TypeError, ValueError) as exc:
            preview = raw_output if len(raw_output) <= 2000 else raw_output[:2000] + "\n…(truncated)"
            logger.error("%s JSON parse/validation failed on attempt %d: %s", agent_name, attempt + 1, exc)
            logger.error("%s raw model output on attempt %d:\n%s", agent_name, attempt + 1, preview)
            last_error = exc
            if attempt == 0:
                if _looks_like_degenerate_json_output(raw_output):
                    # Re-run original task instead of "repairing" garbage loops.
                    logger.warning(
                        "%s degenerate output detected; retrying original prompt instead of repair",
                        agent_name,
                    )
                    use_json_mode = True
                    request_prompt = (
                        f"{prompt}\n\n"
                        "CRITICAL: Previous attempt degenerated into repetitive tokens. "
                        "Return one compact valid JSON object only. No Markdown, no prose."
                    )
                else:
                    request_prompt = _build_repair_prompt(raw_output, schema, exc)
                continue
            break

    raise RuntimeError(f"{agent_name} JSON parse/validation failed after retry: {last_error}")


def call_llm(system: str, user: str) -> str:
    """调用 LLM，返回文本结果。"""
    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=system),
        HumanMessage(content=user),
    ])
    return _extract_text_content(response)


async def acall_llm(system: str, user: str) -> str:
    """异步调用 LLM，返回文本结果。"""
    llm = get_llm()
    response = await _ainvoke_model(llm, [
        SystemMessage(content=system),
        HumanMessage(content=user),
    ])
    return _extract_text_content(response)


def parse_json_response(text: str):
    """从 LLM 回复中解析 JSON，兼容代码块和前后包裹文本。"""
    cleaned = _strip_code_fences(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        extracted = _extract_balanced_json(cleaned)
        if extracted != cleaned:
            return json.loads(extracted)
        raise
