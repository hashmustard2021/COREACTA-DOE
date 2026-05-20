from django.conf import settings
from django.http import HttpResponse
from urllib.parse import urlparse


class DevCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if settings.DEBUG and request.method == "OPTIONS":
            response = HttpResponse()
        else:
            response = self.get_response(request)

        origin = request.headers.get("Origin")
        if settings.DEBUG and is_local_dev_origin(origin):
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type"

        return response


def is_local_dev_origin(origin):
    if not origin:
        return False

    parsed = urlparse(origin)
    return parsed.scheme in {"http", "https"} and parsed.hostname in {
        "localhost",
        "127.0.0.1",
    }
