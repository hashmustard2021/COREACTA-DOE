from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("doe", "0005_factor_categorical"),
    ]

    operations = [
        migrations.AlterField(
            model_name="project",
            name="goal",
            field=models.TextField(blank=True, default="maximize"),
        ),
    ]
