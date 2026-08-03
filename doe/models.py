from decimal import Decimal
import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class VisitorSession(models.Model):
    session_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="doe_visitor_sessions", null=True, blank=True, on_delete=models.SET_NULL)
    landing_path = models.CharField(max_length=500, blank=True)
    referrer_url = models.URLField(max_length=1000, blank=True)
    referrer_source = models.CharField(max_length=120, blank=True, db_index=True)
    utm_source = models.CharField(max_length=120, blank=True, db_index=True)
    utm_medium = models.CharField(max_length=120, blank=True)
    utm_campaign = models.CharField(max_length=160, blank=True, db_index=True)
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-first_seen_at"]

    def __str__(self):
        return f"{self.utm_source or self.referrer_source or 'direct'} - {self.session_id}"


class AnalyticsEvent(models.Model):
    HOME_VIEWED = "home_viewed"
    WIZARD_STARTED = "wizard_started"
    DESIGN_GENERATED = "design_generated"
    RESULTS_SAVED = "results_saved"
    REPORT_VIEWED = "report_viewed"
    EVENT_CHOICES = [
        (HOME_VIEWED, "Home viewed"),
        (WIZARD_STARTED, "Wizard started"),
        (DESIGN_GENERATED, "Design generated"),
        (RESULTS_SAVED, "Results saved"),
        (REPORT_VIEWED, "Report viewed"),
    ]

    session = models.ForeignKey(
        VisitorSession,
        related_name="events",
        on_delete=models.CASCADE,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="doe_analytics_events",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    project = models.ForeignKey(
        "Project",
        related_name="analytics_events",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    event_name = models.CharField(max_length=40, choices=EVENT_CHOICES, db_index=True)
    path = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["event_name", "created_at"]),
            models.Index(fields=["session", "created_at"]),
        ]

    def __str__(self):
        return f"{self.get_event_name_display()} - {self.created_at:%Y-%m-%d %H:%M}"


class Feedback(models.Model):
    INQUIRY = "inquiry"
    BUG = "bug"
    IMPROVEMENT = "improvement"
    CATEGORY_CHOICES = [
        (INQUIRY, "사용 방법 문의"),
        (BUG, "오류 신고"),
        (IMPROVEMENT, "개선 제안"),
    ]
    NEW = "new"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    STATUS_CHOICES = [
        (NEW, "새 문의"),
        (IN_PROGRESS, "확인 중"),
        (RESOLVED, "처리 완료"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="doe_feedback",
        on_delete=models.CASCADE,
    )
    project = models.ForeignKey(
        "Project",
        related_name="feedback",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    message = models.TextField(max_length=4000)
    attachment_data = models.BinaryField(null=True, blank=True, editable=False)
    attachment_name = models.CharField(max_length=255, blank=True)
    attachment_content_type = models.CharField(max_length=100, blank=True)
    page = models.CharField(max_length=80, blank=True)
    step = models.CharField(max_length=160, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=NEW)
    admin_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["status", "-created_at"]

    def __str__(self):
        return f"{self.get_category_display()} - {self.user} - {self.created_at:%Y-%m-%d %H:%M}"


class Project(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="doe_projects",
        on_delete=models.CASCADE,
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    slogan = models.CharField(
        max_length=160,
        blank=True,
        default="감이 아니라 근거로 실험하세요.",
    )
    response_name = models.CharField(max_length=80, blank=True, default="Yield")
    goal = models.TextField(blank=True, default="maximize")
    run_budget = models.PositiveSmallIntegerField(default=8)
    include_center_points = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Factor(models.Model):
    CONTINUOUS = "continuous"
    CATEGORICAL = "categorical"
    FACTOR_TYPE_CHOICES = [
        (CONTINUOUS, "Continuous"),
        (CATEGORICAL, "Categorical"),
    ]

    project = models.ForeignKey(Project, related_name="factors", on_delete=models.CASCADE)
    idx = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(4)]
    )
    factor_type = models.CharField(
        max_length=20,
        choices=FACTOR_TYPE_CHOICES,
        default=CONTINUOUS,
    )
    name_kr = models.CharField(max_length=80)
    name_en = models.CharField(max_length=80)
    unit = models.CharField(max_length=30, blank=True)
    low = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    high = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    levels = models.JSONField(blank=True, default=list)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "idx"], name="unique_factor_idx_per_project"
            ),
            models.CheckConstraint(
                check=(
                    models.Q(
                        factor_type="continuous",
                        low__isnull=False,
                        high__isnull=False,
                        low__lt=models.F("high"),
                    )
                    | models.Q(factor_type="categorical")
                ),
                name="factor_continuous_range_valid",
            ),
        ]
        ordering = ["idx"]

    def __str__(self):
        return self.display_name

    @property
    def key(self):
        return "ABCD"[self.idx - 1]

    @property
    def is_categorical(self):
        return self.factor_type == self.CATEGORICAL

    @property
    def is_continuous(self):
        return self.factor_type == self.CONTINUOUS

    @property
    def display_name(self):
        unit = f", {self.unit}" if self.unit else ""
        return f"{self.name_kr}({self.name_en}{unit})"

    @property
    def mid(self):
        if self.low is None or self.high is None:
            return None
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


class ResultHistory(models.Model):
    project = models.ForeignKey(
        Project, related_name="result_history", on_delete=models.CASCADE
    )
    run = models.ForeignKey(
        DesignRun, related_name="result_history", on_delete=models.CASCADE
    )
    old_y = models.DecimalField(max_digits=12, decimal_places=4)
    new_y = models.DecimalField(max_digits=12, decimal_places=4)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="doe_result_changes",
        on_delete=models.CASCADE,
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at", "-id"]

    def __str__(self):
        return f"{self.project} run {self.run.run_order}: {self.old_y} -> {self.new_y}"
