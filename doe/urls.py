from django.urls import path

from . import views


urlpatterns = [
    path("projects/", views.projects, name="projects"),
    path("projects/<int:project_id>/", views.project_detail, name="project-detail"),
    path("projects/<int:project_id>/design/", views.create_design, name="create-design"),
    path(
        "projects/<int:project_id>/design.csv/",
        views.download_design_csv,
        name="download-design-csv",
    ),
    path(
        "projects/<int:project_id>/report.pdf/",
        views.download_report_pdf,
        name="download-report-pdf",
    ),
    path(
        "projects/<int:project_id>/results/",
        views.create_or_update_result,
        name="create-or-update-result",
    ),
    path("projects/<int:project_id>/surface/", views.surface, name="surface"),
    path("projects/<int:project_id>/report/", views.report, name="report"),
]
