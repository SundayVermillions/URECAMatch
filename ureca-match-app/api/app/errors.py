"""One error envelope for every failure (SRS 5.4.2: plain language, how to fix)."""

from __future__ import annotations

from fastapi import HTTPException


class ApiError(HTTPException):
    def __init__(self, status: int, code: str, message: str, field: str | None = None):
        super().__init__(status_code=status, detail={"code": code, "message": message, "field": field})


def not_found(what: str) -> ApiError:
    return ApiError(404, "not_found", f"{what} was not found.")


def forbidden(message: str = "You do not have access to this.") -> ApiError:
    return ApiError(403, "forbidden", message)


def conflict(code: str, message: str) -> ApiError:
    return ApiError(409, code, message)


def invalid(code: str, message: str, field: str | None = None) -> ApiError:
    return ApiError(422, code, message, field)
