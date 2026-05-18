from django.conf import settings
from django.http import HttpResponse


class DevCorsMiddleware:
    allowed_origins = {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if settings.DEBUG and request.method == "OPTIONS":
            response = HttpResponse()
        else:
            response = self.get_response(request)

        origin = request.headers.get("Origin")
        if settings.DEBUG and origin in self.allowed_origins:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type"

        return response
