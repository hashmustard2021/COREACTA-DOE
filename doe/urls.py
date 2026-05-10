from django.urls import path

from . import views


urlpatterns = [
    path("projects/", views.create_project, name="create-project"),
    path("projects/<int:project_id>/design/", views.create_design, name="create-design"),
    path(
        "projects/<int:project_id>/results/",
        views.create_or_update_result,
        name="create-or-update-result",
    ),
    path("projects/<int:project_id>/report/", views.report, name="report"),
]
