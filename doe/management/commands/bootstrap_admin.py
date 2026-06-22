import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


REQUIRED_ENV_VARS = (
    "DJANGO_SUPERUSER_USERNAME",
    "DJANGO_SUPERUSER_EMAIL",
    "DJANGO_SUPERUSER_PASSWORD",
)


class Command(BaseCommand):
    help = "Create the initial superuser from environment variables when needed."

    def handle(self, *args, **options):
        values = {name: os.getenv(name, "").strip() for name in REQUIRED_ENV_VARS}
        missing = [name for name, value in values.items() if not value]
        if missing:
            self.stdout.write(
                "Admin bootstrap skipped: required environment variables are not set."
            )
            return

        user_model = get_user_model()
        username = values["DJANGO_SUPERUSER_USERNAME"]
        if user_model.objects.filter(username=username).exists():
            self.stdout.write(
                "Admin bootstrap skipped: the configured user already exists and was left unchanged."
            )
            return

        user_model.objects.create_superuser(
            username=username,
            email=values["DJANGO_SUPERUSER_EMAIL"],
            password=values["DJANGO_SUPERUSER_PASSWORD"],
        )
        self.stdout.write(self.style.SUCCESS("Initial admin account created."))
