from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.views.decorators.http import require_GET


@require_GET
def frontend_app(request):
    index_path = Path(settings.FRONTEND_DIR) / "index.html"
    if not index_path.exists():
        raise Http404("Frontend build is not available. Run npm run build first.")

    response = FileResponse(index_path.open("rb"), content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-cache"
    return response
