from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("doe", "0006_project_goal_default"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="include_center_points",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="project",
            name="run_budget",
            field=models.PositiveSmallIntegerField(default=8),
        ),
    ]
