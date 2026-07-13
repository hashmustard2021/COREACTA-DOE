import logging
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.views.decorators.http import require_GET


security_logger = logging.getLogger("doe.security")


@require_GET
def frontend_app(request):
    index_path = Path(settings.FRONTEND_DIR) / "index.html"
    if not index_path.exists():
        raise Http404("Frontend build is not available. Run npm run build first.")

    response = FileResponse(index_path.open("rb"), content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-cache"
    return response


def csrf_failure(request, reason=""):
    security_logger.warning(
        "csrf_denied method=%s path=%s user=%s authenticated=%s reason=%r origin=%r referer=%r x_forwarded_for=%r",
        request.method,
        request.get_full_path(),
        getattr(request.user, "username", "anonymous"),
        getattr(request.user, "is_authenticated", False),
        reason,
        request.headers.get("Origin"),
        request.headers.get("Referer"),
        request.headers.get("X-Forwarded-For"),
    )
    return JsonResponse(
        {
            "success": False,
            "data": None,
            "message": "CSRF verification failed. Please refresh the page and try again.",
        },
        status=403,
    )
