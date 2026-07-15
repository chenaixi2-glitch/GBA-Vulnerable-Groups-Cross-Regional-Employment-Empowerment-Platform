"""Regression: degenerate LLM JSON should not be stuffed into repair prompts."""

from models.llm import _looks_like_degenerate_json_output


def test_degenerate_space_quote_loop():
    garbage = '{{\nid ' + ('" "' * 80)
    assert _looks_like_degenerate_json_output(garbage)


def test_degenerate_project_description_loop():
    garbage = '\n'.join(['"content": "项目描述",'] * 20)
    assert _looks_like_degenerate_json_output(garbage)


def test_valid_looking_json_is_not_degenerate():
    sample = '{"summary":"Backend engineer","skills":[{"id":"s1","title":"Python","content":"FastAPI"}]}'
    assert not _looks_like_degenerate_json_output(sample)


def test_empty_is_degenerate():
    assert _looks_like_degenerate_json_output("")
    assert _looks_like_degenerate_json_output("   ")


def test_degenerate_instruction_echo_chinese():
    garbage = '{\n " 仅输出 is 与 "' + ('" "' * 50) + "\n" + ("仅输出 " * 10)
    assert _looks_like_degenerate_json_output(garbage)


def test_degenerate_contentcontent_loop():
    assert _looks_like_degenerate_json_output('{"items":[{"content":"Content  contentcontent  "}]}')
