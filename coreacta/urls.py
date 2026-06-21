from django.contrib import admin
from django.urls import include, path, re_path

from .views import frontend_app


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("doe.urls")),
    re_path(
        r"^(?!api(?:/|$)|admin(?:/|$)|static(?:/|$)|_next(?:/|$)).*$",
        frontend_app,
        name="frontend-app",
    ),
]
