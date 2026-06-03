from django.contrib import admin

from .models import DesignRun, Factor, Project, Result


class FactorInline(admin.TabularInline):
    model = Factor
    extra = 0
    fields = (
        "idx",
        "factor_type",
        "name_kr",
        "name_en",
        "unit",
        "low",
        "high",
        "levels",
        "display_name",
    )
    readonly_fields = ("display_name",)
    ordering = ("idx",)


class DesignRunInline(admin.TabularInline):
    model = DesignRun
    extra = 0
    fields = ("run_order", "levels", "values", "result_response", "created_at")
    readonly_fields = ("run_order", "levels", "values", "result_response", "created_at")
    ordering = ("run_order",)
    can_delete = False

    @admin.display(description="Result")
    def result_response(self, obj):
        if not hasattr(obj, "result"):
            return "-"
        return obj.result.response


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "owner", "factor_count", "design_run_count", "created_at", "updated_at")
    list_filter = ("owner", "created_at", "updated_at")
    search_fields = ("name", "description", "owner__username", "factors__name_kr", "factors__name_en")
    inlines = (FactorInline, DesignRunInline)
    ordering = ("-created_at",)

    @admin.display(description="Factors")
    def factor_count(self, obj):
        return obj.factors.count()

    @admin.display(description="Design runs")
    def design_run_count(self, obj):
        return obj.design_runs.count()


@admin.register(Factor)
class FactorAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "project",
        "owner",
        "idx",
        "factor_type",
        "display_name",
        "unit",
        "low",
        "high",
    )
    list_filter = ("factor_type", "project__owner", "project", "idx", "unit")
    search_fields = (
        "project__name",
        "project__owner__username",
        "name_kr",
        "name_en",
        "unit",
        "levels",
    )
    ordering = ("project", "idx")

    @admin.display(description="Owner")
    def owner(self, obj):
        return obj.project.owner


@admin.register(DesignRun)
class DesignRunAdmin(admin.ModelAdmin):
    list_display = ("id", "project", "owner", "run_order", "levels", "values", "result_response", "created_at")
    list_filter = ("project__owner", "project", "run_order", "created_at")
    search_fields = ("project__name", "project__owner__username")
    ordering = ("project", "run_order")

    @admin.display(description="Result")
    def result_response(self, obj):
        if not hasattr(obj, "result"):
            return "-"
        return obj.result.response

    @admin.display(description="Owner")
    def owner(self, obj):
        return obj.project.owner


@admin.register(Result)
class ResultAdmin(admin.ModelAdmin):
    list_display = ("id", "project", "owner", "run_order", "response", "note", "created_at", "updated_at")
    list_filter = ("design_run__project__owner", "design_run__project", "design_run__run_order", "created_at", "updated_at")
    search_fields = ("design_run__project__name", "design_run__project__owner__username", "note")
    ordering = ("design_run__project", "design_run__run_order")

    @admin.display(description="Project")
    def project(self, obj):
        return obj.design_run.project

    @admin.display(description="Owner")
    def owner(self, obj):
        return obj.design_run.project.owner

    @admin.display(description="Run")
    def run_order(self, obj):
        return obj.design_run.run_order
