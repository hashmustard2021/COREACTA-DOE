from django.db import models

class Project(models.Model):
    name  = models.CharField(max_length=200)
    slogan = models.CharField(max_length=200, default="감이 아니라 근거로 실험하세요.")
    run_budget = models.PositiveSmallIntegerField(default=8) # v1 fixed
    response_name = models.CharField(max_length=50, default="수율(Yield, %)")
    goal = models.CharField(max_length=20, default="maximize")

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.id} - {self.name}"
    

class Factor(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="factors")
    idx = models.PositiveSmallIntegerField() # 1..4
    name_kr = models.CharField(max_length=50)
    name_en = models.CharField(max_length=50)
    unit = models.CharField(max_length=20, blank=True, default="")
    low = models.FloatField()
    high = models.FloatField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "idx"], name="uq_factor_project_idx")
        ]
        ordering = ["idx"]

    @property
    def display_name(self) -> str:
        unit_part = f", {self.unit}" if {self.unit} else ""
        

    def __str__(self):
        return self.display_name


class DesignRun(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="runs")
    run_no = models.PositiveSmallIntegerField()
    x1 = models.FloatField()
    x2 = models.FloatField()
    x3 = models.FloatField()
    x4 = models.FloatField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "run_no"], name="up_run_project_runno")
        ]
        ordering = ["run_no"]

    def __str__(self):
        return f"P{self.project_id}-Run{self.run_no}"
    

class Result(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="results")
    run = models.OneToOneField(DesignRun, models.CASCADE, related_name="result")
    y = models.FloatField() # Yield %

    def __str__(self):
        return f"P{self.project_id}-Run{self.run.run_no}: {self.y}"







