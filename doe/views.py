import csv
from io import StringIO

from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from django.db import OperationalError
from django.http import Http404, HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Project
from .pdf import build_project_report_pdf
from .serializers import (
    DesignRunSerializer,
    FactorSerializer,
    LoginSerializer,
    ProjectListSerializer,
    ProjectSerializer,
    ProjectUpdateSerializer,
    ResultSerializer,
    ResultUpsertSerializer,
)
from .services import (
    build_report,
    build_response_surface,
    create_fractional_factorial_design,
    upsert_result,
)


@ensure_csrf_cookie
@api_view(["GET"])
def auth_csrf(request):
    return api_success({"csrfToken": get_token(request)})


@api_view(["GET"])
def auth_me(request):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    return api_success(user_payload(request.user))


@api_view(["POST"])
def auth_login(request):
    serializer = LoginSerializer(data=request.data, context={"request": request})
    if not serializer.is_valid():
        return api_error(format_validation_errors(serializer.errors))

    user = serializer.validated_data["user"]
    login(request, user)
    return api_success(user_payload(user))


@api_view(["POST"])
def auth_logout(request):
    logout(request)
    return api_success({})


@api_view(["GET", "POST"])
def projects(request):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    if request.method == "GET":
        queryset = Project.objects.filter(owner=request.user).order_by("-created_at")
        return api_success(ProjectListSerializer(queryset, many=True).data)

    serializer = ProjectSerializer(data=request.data, context={"request": request})
    if not serializer.is_valid():
        return api_error(format_validation_errors(serializer.errors))

    project = serializer.save()
    return api_success(ProjectSerializer(project).data, status_code=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
def project_detail(request, project_id):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    try:
        project = get_project(request, project_id)
    except Http404 as exc:
        return api_error(str(exc), status_code=status.HTTP_404_NOT_FOUND)

    if request.method == "PATCH":
        serializer = ProjectUpdateSerializer(project, data=request.data, partial=True)
        if not serializer.is_valid():
            return api_error(format_validation_errors(serializer.errors))

        serializer.save()
        return api_success(ProjectSerializer(project).data)

    if request.method == "DELETE":
        deleted_project_id = project.id
        project.delete()
        return api_success({"project_id": deleted_project_id, "deleted": True})

    design_runs = project.design_runs.select_related("result").order_by("run_order")
    results = ResultSerializer(
        [
            run.result
            for run in design_runs
            if hasattr(run, "result")
        ],
        many=True,
    ).data

    return api_success(
        {
            "project": ProjectSerializer(project).data,
            "factors": FactorSerializer(project.factors.order_by("idx"), many=True).data,
            "design_runs": DesignRunSerializer(design_runs, many=True).data,
            "results": results,
        }
    )


@api_view(["POST"])
def create_design(request, project_id):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    try:
        project = get_project(request, project_id)
        include_center_points = bool(request.data.get("include_center_points", False))
        runs = create_fractional_factorial_design(
            project,
            include_center_points=include_center_points,
        )
    except Http404 as exc:
        return api_error(str(exc), status_code=status.HTTP_404_NOT_FOUND)
    except ValueError as exc:
        return api_error(str(exc), status_code=status.HTTP_400_BAD_REQUEST)

    return api_success(
        DesignRunSerializer(runs, many=True).data,
        status_code=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
def create_or_update_result(request, project_id):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    try:
        project = get_project(request, project_id)
    except Http404 as exc:
        return api_error(str(exc), status_code=status.HTTP_404_NOT_FOUND)

    serializer = ResultUpsertSerializer(data=request.data)
    if not serializer.is_valid():
        return api_error(format_validation_errors(serializer.errors))

    try:
        result = upsert_result(project, **serializer.validated_data)
    except OperationalError:
        return api_error(
            "Database is busy. Please retry.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except ValueError as exc:
        return api_error(str(exc), status_code=status.HTTP_400_BAD_REQUEST)

    return api_success(ResultSerializer(result).data)


@api_view(["GET"])
def report(request, project_id):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    try:
        project = get_project(request, project_id)
    except Http404 as exc:
        return api_error(str(exc), status_code=status.HTTP_404_NOT_FOUND)

    return api_success(build_report(project))


@api_view(["GET"])
def surface(request, project_id):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    try:
        project = get_project(request, project_id)
        surface_data = build_response_surface(
            project,
            request.query_params.get("x_factor"),
            request.query_params.get("y_factor"),
        )
    except Http404 as exc:
        return api_error(str(exc), status_code=status.HTTP_404_NOT_FOUND)
    except ValueError as exc:
        return api_error(str(exc), status_code=status.HTTP_400_BAD_REQUEST)

    return api_success(surface_data)


@api_view(["GET"])
def download_design_csv(request, project_id):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    project = get_project(request, project_id)
    factors = list(project.factors.order_by("idx"))
    runs = project.design_runs.select_related("result").order_by("run_order")

    buffer = StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(["Run", *[factor.display_name for factor in factors], "수율(Yield, %)"])

    for run in runs:
        row = [run.run_order]
        row.extend(run.values.get(factor.key, "") for factor in factors)
        row.append(run.result.response if hasattr(run, "result") else "")
        writer.writerow(row)

    response = HttpResponse(
        buffer.getvalue().encode("utf-8-sig"),
        content_type="text/csv; charset=utf-8",
    )
    response["Content-Disposition"] = (
        f'attachment; filename="coreacta_project_{project.id}_design.csv"'
    )
    return response


@api_view(["GET"])
def download_report_pdf(request, project_id):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    project = get_project(request, project_id)
    pdf_bytes = build_project_report_pdf(project)

    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="coreacta-doe-report-project-{project.id}.pdf"'
    )
    return response


def get_project(request, project_id):
    try:
        return Project.objects.get(pk=project_id, owner=request.user)
    except Project.DoesNotExist:
        raise Http404("Project not found.")


def require_authenticated(request):
    if request.user.is_authenticated:
        return None
    return api_error("Authentication required.", status_code=status.HTTP_401_UNAUTHORIZED)


def user_payload(user):
    return {"id": user.id, "username": user.username, "email": user.email}


def api_success(data, status_code=status.HTTP_200_OK, message=""):
    return Response(
        {
            "success": True,
            "data": data,
            "message": message,
        },
        status=status_code,
    )


def api_error(message, status_code=status.HTTP_400_BAD_REQUEST):
    return Response(
        {
            "success": False,
            "data": None,
            "message": message,
        },
        status=status_code,
    )


def format_validation_errors(errors):
    messages = []

    def collect(value, path=""):
        if isinstance(value, dict):
            for key, child in value.items():
                collect(child, f"{path}.{key}" if path else str(key))
            return

        if isinstance(value, list):
            for idx, child in enumerate(value):
                child_path = f"{path}[{idx}]" if path else str(idx)
                collect(child, child_path)
            return

        messages.append(f"{path}: {value}" if path else str(value))

    collect(errors)
    return "; ".join(messages) if messages else "Validation error."
