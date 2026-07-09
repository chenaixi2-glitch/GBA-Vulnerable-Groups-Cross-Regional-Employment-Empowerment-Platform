"""Node JWT uses numeric sub (user.id); Python backend must accept it."""

from __future__ import annotations

import jwt

from auth.jwt import verify_token
from config_loader import get_jwt_config


def test_verify_token_accepts_numeric_sub():
    secret = get_jwt_config()["secret"]
    token = jwt.encode({"sub": 42, "username": "demo", "role": "individual"}, secret, algorithm="HS256")
    payload = verify_token(token)
    assert payload is not None
    assert payload["sub"] == 42


def test_verify_token_accepts_string_sub():
    secret = get_jwt_config()["secret"]
    token = jwt.encode({"sub": "42", "username": "demo", "role": "individual"}, secret, algorithm="HS256")
    payload = verify_token(token)
    assert payload is not None
    assert payload["sub"] == "42"
