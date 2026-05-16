import csv
from io import StringIO

from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Project
from .serializers import (
    DesignRunSerializer,
    ProjectSerializer,
    ResultSerializer,
    ResultUpsertSerializer,
)
from .services import (
    build_report,
    create_fractional_factorial_design,
    upsert_result,
)


@api_view(["POST"])
def create_project(request):
    serializer = ProjectSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    project = serializer.save()
    return Response(ProjectSerializer(project).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
def create_design(request, project_id):
    project = get_project(project_id)
    runs = create_fractional_factorial_design(project)
    return Response(DesignRunSerializer(runs, many=True).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
def create_or_update_result(request, project_id):
    project = get_project(project_id)
    serializer = ResultUpsertSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        result = upsert_result(project, **serializer.validated_data)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(ResultSerializer(result).data)


@api_view(["GET"])
def report(request, project_id):
    project = get_project(project_id)
    return Response(build_report(project))


@api_view(["GET"])
def download_design_csv(request, project_id):
    project = get_project(project_id)
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


def get_project(project_id):
    try:
        return Project.objects.get(pk=project_id)
    except Project.DoesNotExist:
        from django.http import Http404

        raise Http404("Project not found.")
