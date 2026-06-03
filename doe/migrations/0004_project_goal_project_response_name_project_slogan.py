from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("doe", "0003_project_owner"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="goal",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="project",
            name="response_name",
            field=models.CharField(blank=True, default="Yield", max_length=80),
        ),
        migrations.AddField(
            model_name="project",
            name="slogan",
            field=models.CharField(
                blank=True,
                default="감이 아니라 근거로 실험하세요.",
                max_length=160,
            ),
        ),
    ]
