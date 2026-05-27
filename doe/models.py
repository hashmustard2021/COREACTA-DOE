from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Project(models.Model):
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Factor(models.Model):
    project = models.ForeignKey(Project, related_name="factors", on_delete=models.CASCADE)
    idx = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(4)]
    )
    name_kr = models.CharField(max_length=80)
    name_en = models.CharField(max_length=80)
    unit = models.CharField(max_length=30, blank=True)
    low = models.DecimalField(max_digits=12, decimal_places=4)
    high = models.DecimalField(max_digits=12, decimal_places=4)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "idx"], name="unique_factor_idx_per_project"
            ),
            models.CheckConstraint(
                check=models.Q(low__lt=models.F("high")),
                name="factor_low_smaller_than_high",
            ),
        ]
        ordering = ["idx"]

    def __str__(self):
        return self.display_name

    @property
    def key(self):
        return "ABCD"[self.idx - 1]

    @property
    def display_name(self):
        unit = f", {self.unit}" if self.unit else ""
        return f"{self.name_kr}({self.name_en}{unit})"

    @property
    def mid(self):
        return (self.low + self.high) / Decimal("2")


class DesignRun(models.Model):
    project = models.ForeignKey(
        Project, related_name="design_runs", on_delete=models.CASCADE
    )
    run_order = models.PositiveSmallIntegerField()
    levels = models.JSONField()
    values = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "run_order"], name="unique_run_order_per_project"
            )
        ]
        ordering = ["run_order"]

    def __str__(self):
        return f"{self.project} run {self.run_order}"


class Result(models.Model):
    design_run = models.OneToOneField(
        DesignRun, related_name="result", on_delete=models.CASCADE
    )
    response = models.DecimalField(max_digits=12, decimal_places=4)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(response__gte=0) & models.Q(response__lte=100),
                name="result_response_between_0_and_100",
            )
        ]

    def __str__(self):
        return f"{self.design_run}: {self.response}"
