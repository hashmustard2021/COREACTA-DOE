import os
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase


ADMIN_ENV = {
    "DJANGO_SUPERUSER_USERNAME": "render_admin",
    "DJANGO_SUPERUSER_EMAIL": "admin@example.com",
    "DJANGO_SUPERUSER_PASSWORD": "temporary-strong-password-932!",
}


class BootstrapAdminCommandTests(TestCase):
    def test_missing_environment_variables_skip_creation(self):
        output = StringIO()
        initial_user_count = get_user_model().objects.count()
        with patch.dict(os.environ, {}, clear=True):
            call_command("bootstrap_admin", stdout=output)

        self.assertEqual(get_user_model().objects.count(), initial_user_count)
        self.assertFalse(
            get_user_model().objects.filter(username="render_admin").exists()
        )
        self.assertIn("skipped", output.getvalue())

    def test_environment_variables_create_superuser(self):
        output = StringIO()
        with patch.dict(os.environ, ADMIN_ENV, clear=False):
            call_command("bootstrap_admin", stdout=output)

        user = get_user_model().objects.get(username="render_admin")
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertEqual(user.email, "admin@example.com")
        self.assertTrue(user.check_password(ADMIN_ENV["DJANGO_SUPERUSER_PASSWORD"]))
        self.assertNotIn(ADMIN_ENV["DJANGO_SUPERUSER_PASSWORD"], output.getvalue())

    def test_existing_user_and_password_are_left_unchanged(self):
        user = get_user_model().objects.create_user(
            username="render_admin",
            email="existing@example.com",
            password="existing-password-741!",
        )
        output = StringIO()

        with patch.dict(os.environ, ADMIN_ENV, clear=False):
            call_command("bootstrap_admin", stdout=output)

        user.refresh_from_db()
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(user.email, "existing@example.com")
        self.assertTrue(user.check_password("existing-password-741!"))
        self.assertFalse(user.check_password(ADMIN_ENV["DJANGO_SUPERUSER_PASSWORD"]))
        self.assertIn("left unchanged", output.getvalue())

    def test_explicit_reset_recovers_existing_admin(self):
        user = get_user_model().objects.create_user(
            username="render_admin",
            email="existing@example.com",
            password="existing-password-741!",
        )
        output = StringIO()
        recovery_env = {
            **ADMIN_ENV,
            "DJANGO_SUPERUSER_RESET_PASSWORD": "true",
        }

        with patch.dict(os.environ, recovery_env, clear=False):
            call_command("bootstrap_admin", stdout=output)

        user.refresh_from_db()
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertEqual(user.email, ADMIN_ENV["DJANGO_SUPERUSER_EMAIL"])
        self.assertTrue(user.check_password(ADMIN_ENV["DJANGO_SUPERUSER_PASSWORD"]))
        self.assertNotIn(ADMIN_ENV["DJANGO_SUPERUSER_PASSWORD"], output.getvalue())
        self.assertIn("recovered", output.getvalue())
