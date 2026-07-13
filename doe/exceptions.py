import logging

from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated, PermissionDenied
from rest_framework.views import exception_handler


security_logger = logging.getLogger("doe.security")


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    request = context.get("request")
    view = context.get("view")

    if response is not None and response.status_code in {
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
    }:
        log_api_denial(exc, request, view, response.status_code)

    return response


def log_api_denial(exc, request, view, status_code):
    if request is None:
        security_logger.warning(
            "api_denied status=%s reason=%r",
            status_code,
            str(exc),
        )
        return

    user = getattr(request, "user", None)
    security_logger.warning(
        "api_denied status=%s method=%s path=%s view=%s user=%s authenticated=%s reason=%r origin=%r referer=%r x_forwarded_for=%r",
        status_code,
        request.method,
        request.get_full_path(),
        view.__class__.__name__ if view else "",
        getattr(user, "username", "anonymous"),
        getattr(user, "is_authenticated", False),
        str(exc),
        request.headers.get("Origin"),
        request.headers.get("Referer"),
        request.headers.get("X-Forwarded-For"),
    )


__all__ = [
    "AuthenticationFailed",
    "NotAuthenticated",
    "PermissionDenied",
    "api_exception_handler",
]
