from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("doe", "0004_project_goal_project_response_name_project_slogan"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="factor",
            name="factor_low_smaller_than_high",
        ),
        migrations.AddField(
            model_name="factor",
            name="factor_type",
            field=models.CharField(
                choices=[
                    ("continuous", "Continuous"),
                    ("categorical", "Categorical"),
                ],
                default="continuous",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="factor",
            name="levels",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name="factor",
            name="high",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="factor",
            name="low",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddConstraint(
            model_name="factor",
            constraint=models.CheckConstraint(
                check=(
                    models.Q(
                        ("factor_type", "continuous"),
                        ("high__isnull", False),
                        ("low__isnull", False),
                        ("low__lt", models.F("high")),
                    )
                    | models.Q(("factor_type", "categorical"))
                ),
                name="factor_continuous_range_valid",
            ),
        ),
    ]
