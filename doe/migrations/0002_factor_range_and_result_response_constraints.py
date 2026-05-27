from django.db import migrations, models


def clamp_existing_yield_responses(apps, schema_editor):
    result_model = apps.get_model("doe", "Result")
    result_model.objects.filter(response__lt=0).update(response=0)
    result_model.objects.filter(response__gt=100).update(response=100)


class Migration(migrations.Migration):

    dependencies = [
        ("doe", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            clamp_existing_yield_responses,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AddConstraint(
            model_name="factor",
            constraint=models.CheckConstraint(
                check=models.Q(("low__lt", models.F("high"))),
                name="factor_low_smaller_than_high",
            ),
        ),
        migrations.AddConstraint(
            model_name="result",
            constraint=models.CheckConstraint(
                check=models.Q(("response__gte", 0)) & models.Q(("response__lte", 100)),
                name="result_response_between_0_and_100",
            ),
        ),
    ]
