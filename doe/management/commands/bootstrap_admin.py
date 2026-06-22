import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


REQUIRED_ENV_VARS = (
    "DJANGO_SUPERUSER_USERNAME",
    "DJANGO_SUPERUSER_EMAIL",
    "DJANGO_SUPERUSER_PASSWORD",
)


def env_flag(name):
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


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
        existing_user = user_model.objects.filter(username=username).first()
        if existing_user and env_flag("DJANGO_SUPERUSER_RESET_PASSWORD"):
            existing_user.email = values["DJANGO_SUPERUSER_EMAIL"]
            existing_user.is_staff = True
            existing_user.is_superuser = True
            existing_user.set_password(values["DJANGO_SUPERUSER_PASSWORD"])
            existing_user.save(
                update_fields=["email", "is_staff", "is_superuser", "password"]
            )
            self.stdout.write(self.style.SUCCESS("Existing admin account recovered."))
            return

        if existing_user:
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
