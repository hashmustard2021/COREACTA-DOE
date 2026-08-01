import csv
import logging
import secrets
from io import StringIO
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.shortcuts import redirect
from django.utils.crypto import constant_time_compare
from django.middleware.csrf import get_token
from django.db import OperationalError
from django.http import Http404, HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import AnalyticsEvent, Factor, Project, VisitorSession
from .google_oauth import (
    GoogleOAuthError,
    authorization_url,
    exchange_code,
    google_login_enabled,
    verify_identity_token,
)
from .feedback_serializers import FeedbackCreateSerializer
from .pdf import build_project_report_pdf
from .serializers import (
    DesignRunSerializer,
    FactorSerializer,
    LoginSerializer,
    ProjectListSerializer,
    ProjectSerializer,
    ProjectUpdateSerializer,
    ResultHistorySerializer,
    ResultSerializer,
    ResultUpsertSerializer,
)
from .services import (
    build_report,
    build_response_surface,
    create_fractional_factorial_design,
    upsert_result,
)


security_logger = logging.getLogger("doe.security")


@api_view(["GET"])
def health(request):
    return api_success({"status": "ok"})


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


@api_view(["GET"])
def auth_providers(request):
    return api_success({"google": google_login_enabled()})


@api_view(["GET"])
def google_login(request):
    if not google_login_enabled():
        return redirect(google_redirect_url("Google login is not configured yet."))

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    request.session["google_oauth_state"] = state
    request.session["google_oauth_nonce"] = nonce
    return redirect(authorization_url(state, nonce))


@api_view(["GET"])
def google_callback(request):
    error = request.GET.get("error")
    if error:
        return redirect(google_redirect_url("Google 로그인을 취소했어요."))

    state = request.GET.get("state", "")
    expected_state = request.session.pop("google_oauth_state", "")
    nonce = request.session.pop("google_oauth_nonce", "")
    code = request.GET.get("code", "")
    if not code or not expected_state or not constant_time_compare(state, expected_state):
        return redirect(google_redirect_url("Google 로그인 요청을 확인할 수 없어요. 다시 시도해 주세요."))

    try:
        identity = verify_identity_token(exchange_code(code), nonce)
    except GoogleOAuthError as error:
        security_logger.warning("google_login_failed reason=%s", error)
        return redirect(google_redirect_url("Google 로그인을 완료하지 못했어요. 다시 시도해 주세요."))

    user = get_or_create_google_user(identity)
    login(request, user)
    return redirect(settings.GOOGLE_OAUTH_SUCCESS_URL)


@api_view(["POST"])
def auth_logout(request):
    logout(request)
    return api_success({})


@api_view(["POST"])
def feedback(request):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    serializer = FeedbackCreateSerializer(data=request.data, context={"request": request})
    if not serializer.is_valid():
        return api_error(format_validation_errors(serializer.errors))
    feedback_record = serializer.save()
    return api_success({"id": feedback_record.id}, status_code=status.HTTP_201_CREATED)


@api_view(["POST"])
def analytics_event(request):
    """Record a privacy-preserving acquisition and product-use event."""
    session_id = request.data.get("session_id")
    event_name = request.data.get("event_name")
    if not session_id or event_name not in dict(AnalyticsEvent.EVENT_CHOICES):
        return api_error("Invalid analytics event.")

    try:
        visitor_session, created = VisitorSession.objects.get_or_create(
            session_id=session_id,
            defaults={
                "landing_path": str(request.data.get("landing_path", ""))[:500],
                "referrer_url": str(request.data.get("referrer_url", ""))[:1000],
                "referrer_source": str(request.data.get("referrer_source", ""))[:120],
                "utm_source": str(request.data.get("utm_source", ""))[:120],
                "utm_medium": str(request.data.get("utm_medium", ""))[:120],
                "utm_campaign": str(request.data.get("utm_campaign", ""))[:160],
                "user": request.user if request.user.is_authenticated else None,
            },
        )
    except (TypeError, ValueError):
        return api_error("Invalid analytics session.")

    changed_fields = []
    if request.user.is_authenticated and visitor_session.user_id != request.user.id:
        visitor_session.user = request.user
        changed_fields.append("user")
    if not created:
        visitor_session.save(update_fields=[*changed_fields, "last_seen_at"])

    project = None
    project_id = request.data.get("project_id")
    if project_id and request.user.is_authenticated:
        project = Project.objects.filter(pk=project_id, owner=request.user).first()

    AnalyticsEvent.objects.create(
        session=visitor_session,
        user=request.user if request.user.is_authenticated else None,
        project=project,
        event_name=event_name,
        path=str(request.data.get("path", ""))[:500],
    )
    return api_success({"recorded": True}, status_code=status.HTTP_201_CREATED)


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
def duplicate_project(request, project_id):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    try:
        project = get_project(request, project_id)
    except Http404 as exc:
        return api_error(str(exc), status_code=status.HTTP_404_NOT_FOUND)

    duplicated = Project.objects.create(
        owner=request.user,
        name=f"{project.name} (Copy)",
        description=project.description,
        slogan=project.slogan,
        response_name=project.response_name,
        goal=project.goal,
        run_budget=project.run_budget,
        include_center_points=project.include_center_points,
    )
    for factor in project.factors.order_by("idx"):
        Factor.objects.create(
            project=duplicated,
            idx=factor.idx,
            factor_type=factor.factor_type,
            name_kr=factor.name_kr,
            name_en=factor.name_en,
            unit=factor.unit,
            low=factor.low,
            high=factor.high,
            levels=list(factor.levels or []),
        )

    return api_success(
        {"project_id": duplicated.id},
        status_code=status.HTTP_201_CREATED,
        message="Project duplicated successfully.",
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
        result = upsert_result(
            project,
            changed_by=request.user,
            **serializer.validated_data,
        )
    except OperationalError:
        return api_error(
            "Database is busy. Please retry.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except ValueError as exc:
        return api_error(str(exc), status_code=status.HTTP_400_BAD_REQUEST)

    return api_success(ResultSerializer(result).data)


@api_view(["GET"])
def result_history(request, project_id):
    auth_response = require_authenticated(request)
    if auth_response:
        return auth_response

    try:
        project = get_project(request, project_id)
    except Http404 as exc:
        return api_error(str(exc), status_code=status.HTTP_404_NOT_FOUND)

    history = project.result_history.select_related("run", "changed_by").order_by(
        "run__run_order",
        "-changed_at",
        "-id",
    )
    return api_success(ResultHistorySerializer(history, many=True).data)


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
    return api_error(
        "Session expired. Please log in again.",
        status_code=status.HTTP_401_UNAUTHORIZED,
        request=request,
    )


def user_payload(user):
    return {"id": user.id, "username": user.username, "email": user.email}


def google_redirect_url(message):
    separator = "&" if "?" in settings.GOOGLE_OAUTH_SUCCESS_URL else "?"
    return f"{settings.GOOGLE_OAUTH_SUCCESS_URL}{separator}{urlencode({'google_auth_error': message})}"


def get_or_create_google_user(identity):
    """Link by verified email so an existing account keeps its projects."""
    user_model = get_user_model()
    email = identity["email"].strip().lower()
    user = user_model.objects.filter(email__iexact=email).first()
    if user:
        return user

    username_field = user_model.USERNAME_FIELD
    username_max_length = user_model._meta.get_field(username_field).max_length or 150
    local_part = email.split("@", 1)[0]
    base_username = "".join(
        character if character.isalnum() or character in {".", "_", "-"} else "-"
        for character in local_part
    ).strip(".-_") or "researcher"
    base_username = base_username[:username_max_length]
    username = base_username
    suffix = 2
    while user_model.objects.filter(**{username_field: username}).exists():
        suffix_text = f"-{suffix}"
        username = f"{base_username[:username_max_length - len(suffix_text)]}{suffix_text}"
        suffix += 1

    user = user_model(
        **{
            username_field: username,
            "email": email,
            "first_name": identity.get("given_name", "")[:150],
            "last_name": identity.get("family_name", "")[:150],
        }
    )
    user.set_unusable_password()
    user.save()
    return user


def api_success(data, status_code=status.HTTP_200_OK, message=""):
    return Response(
        {
            "success": True,
            "data": data,
            "message": message,
        },
        status=status_code,
    )


def api_error(message, status_code=status.HTTP_400_BAD_REQUEST, request=None):
    if status_code in {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}:
        security_logger.warning(
            "api_error status=%s method=%s path=%s user=%s authenticated=%s message=%r",
            status_code,
            getattr(request, "method", ""),
            request.get_full_path() if request else "",
            getattr(getattr(request, "user", None), "username", "anonymous"),
            getattr(getattr(request, "user", None), "is_authenticated", False),
            message,
        )
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
