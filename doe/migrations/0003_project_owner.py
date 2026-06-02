from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def create_default_owner(apps, schema_editor):
    user_model = apps.get_model("auth", "User")
    project_model = apps.get_model("doe", "Project")
    owner, _ = user_model.objects.get_or_create(
        username="coreacta_demo",
        defaults={
            "email": "coreacta_demo@example.com",
            "is_staff": False,
            "is_superuser": False,
        },
    )
    project_model.objects.filter(owner__isnull=True).update(owner=owner)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("doe", "0002_factor_range_and_result_response_constraints"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="owner",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="doe_projects",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(create_default_owner, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="project",
            name="owner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="doe_projects",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
