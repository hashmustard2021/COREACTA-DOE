from decimal import Decimal

from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import DesignRun, Factor, Project, Result, ResultHistory


class HealthApiTests(APITestCase):
    def test_health_api_is_public(self):
        response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"], {"status": "ok"})


class SuzukiCouplingDoeApiTests(APITestCase):
    project_payload = {
        "name": "Suzuki coupling optimization",
        "description": "DOE test",
        "factors": [
            {
                "idx": 1,
                "name_kr": "온도",
                "name_en": "Temperature",
                "unit": "°C",
                "low": "60",
                "high": "90",
            },
            {
                "idx": 2,
                "name_kr": "시간",
                "name_en": "Time",
                "unit": "h",
                "low": "1",
                "high": "4",
            },
            {
                "idx": 3,
                "name_kr": "촉매량",
                "name_en": "Catalyst loading",
                "unit": "mol%",
                "low": "0.5",
                "high": "5",
            },
            {
                "idx": 4,
                "name_kr": "농도",
                "name_en": "Concentration",
                "unit": "M",
                "low": "0.05",
                "high": "0.30",
            },
        ],
    }
    result_values = [42, 55, 48, 51, 46, 58, 53, 61]
    mixed_factor_payload = {
        "name": "Mixed factor Suzuki optimization",
        "description": "Mixed DOE test",
        "factors": [
            {
                "idx": 1,
                "factor_type": "continuous",
                "name_kr": "온도",
                "name_en": "Temperature",
                "unit": "°C",
                "low": "60",
                "high": "90",
            },
            {
                "idx": 2,
                "factor_type": "continuous",
                "name_kr": "시간",
                "name_en": "Time",
                "unit": "h",
                "low": "1",
                "high": "4",
            },
            {
                "idx": 3,
                "factor_type": "categorical",
                "name_kr": "용매",
                "name_en": "Solvent",
                "levels": ["THF", "Toluene"],
            },
            {
                "idx": 4,
                "factor_type": "categorical",
                "name_kr": "염기",
                "name_en": "Base",
                "levels": ["K2CO3", "Cs2CO3"],
            },
        ],
    }

    def setUp(self):
        self.user = User.objects.create_user(username="chemist_a", password="pass-a")
        self.other_user = User.objects.create_user(username="chemist_b", password="pass-b")
        self.client.force_authenticate(user=self.user)

    def test_project_creation_api(self):
        project = self.create_project()

        self.assertEqual(project["name"], "Suzuki coupling optimization")
        self.assertEqual(project["owner"], "chemist_a")
        self.assertEqual(len(project["factors"]), 4)
        self.assertEqual(project["factors"][0]["display_name"], "온도(Temperature, °C)")

    def test_anonymous_api_access_is_rejected(self):
        anonymous_client = APIClient()

        response = anonymous_client.get("/api/projects/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(response.data["success"])

    @override_settings(DEBUG=True)
    def test_local_dev_cors_allows_project_patch_and_delete(self):
        response = self.client.options(
            "/api/projects/1/",
            HTTP_ORIGIN="http://localhost:3000",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="PATCH",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="Content-Type,X-CSRFToken",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("PATCH", response["Access-Control-Allow-Methods"])
        self.assertIn("DELETE", response["Access-Control-Allow-Methods"])
        self.assertEqual(
            response["Access-Control-Allow-Origin"],
            "http://localhost:3000",
        )

    def test_user_cannot_access_other_users_projects(self):
        project = self.create_project()
        other_client = APIClient()
        other_client.force_authenticate(user=self.other_user)

        list_response = other_client.get("/api/projects/")
        detail_response = other_client.get(f"/api/projects/{project['id']}/")
        design_response = other_client.post(f"/api/projects/{project['id']}/design/")

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["data"], [])
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(design_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_owner_can_update_project(self):
        project = self.create_project()

        response = self.client.patch(
            f"/api/projects/{project['id']}/",
            {
                "name": "Updated Suzuki optimization",
                "slogan": "Evidence first.",
                "response_name": "Conversion",
                "goal": "minimize",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        updated = response.data["data"]
        self.assertEqual(updated["name"], "Updated Suzuki optimization")
        self.assertEqual(updated["slogan"], "Evidence first.")
        self.assertEqual(updated["response_name"], "Conversion")
        self.assertEqual(updated["goal"], "minimize")

    def test_owner_can_delete_project_and_related_records(self):
        project = self.create_project()
        self.create_design(project["id"])
        self.submit_results(project["id"])

        response = self.client.delete(f"/api/projects/{project['id']}/")
        list_response = self.client.get("/api/projects/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertTrue(response.data["data"]["deleted"])
        self.assertFalse(Project.objects.filter(id=project["id"]).exists())
        self.assertEqual(Factor.objects.count(), 0)
        self.assertEqual(DesignRun.objects.count(), 0)
        self.assertEqual(Result.objects.count(), 0)
        self.assertEqual(list_response.data["data"], [])

    def test_other_user_cannot_update_or_delete_project(self):
        project = self.create_project()
        other_client = APIClient()
        other_client.force_authenticate(user=self.other_user)

        patch_response = other_client.patch(
            f"/api/projects/{project['id']}/",
            {"name": "Not allowed"},
            format="json",
        )
        delete_response = other_client.delete(f"/api/projects/{project['id']}/")

        self.assertEqual(patch_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(delete_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Project.objects.filter(id=project["id"]).exists())

    def test_owner_can_duplicate_continuous_project_without_design_or_results(self):
        project = self.create_project()
        self.create_design(project["id"], include_center_points=True)
        self.submit_results(project["id"])

        response = self.client.post(f"/api/projects/{project['id']}/duplicate/")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["message"], "Project duplicated successfully.")

        duplicated = Project.objects.get(id=response.data["data"]["project_id"])
        original = Project.objects.get(id=project["id"])
        self.assertEqual(duplicated.owner, self.user)
        self.assertEqual(duplicated.name, f"{original.name} (Copy)")
        self.assertEqual(duplicated.slogan, original.slogan)
        self.assertEqual(duplicated.response_name, original.response_name)
        self.assertEqual(duplicated.goal, original.goal)
        self.assertEqual(duplicated.run_budget, 11)
        self.assertTrue(duplicated.include_center_points)
        self.assertEqual(duplicated.design_runs.count(), 0)
        self.assertEqual(Result.objects.filter(design_run__project=duplicated).count(), 0)

        original_factors = list(original.factors.order_by("idx").values(
            "idx",
            "factor_type",
            "name_kr",
            "name_en",
            "unit",
            "low",
            "high",
            "levels",
        ))
        duplicated_factors = list(duplicated.factors.order_by("idx").values(
            "idx",
            "factor_type",
            "name_kr",
            "name_en",
            "unit",
            "low",
            "high",
            "levels",
        ))
        self.assertEqual(duplicated_factors, original_factors)

    def test_owner_can_duplicate_mixed_project_factors(self):
        project = self.create_project(self.mixed_factor_payload)
        self.create_design(project["id"])
        self.submit_results(project["id"])

        response = self.client.post(f"/api/projects/{project['id']}/duplicate/")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        duplicated = Project.objects.get(id=response.data["data"]["project_id"])
        factors = list(duplicated.factors.order_by("idx"))
        self.assertEqual(duplicated.design_runs.count(), 0)
        self.assertEqual(factors[2].factor_type, Factor.CATEGORICAL)
        self.assertEqual(factors[2].levels, ["THF", "Toluene"])
        self.assertIsNone(factors[2].low)
        self.assertIsNone(factors[2].high)
        self.assertEqual(factors[3].levels, ["K2CO3", "Cs2CO3"])

    def test_other_user_cannot_duplicate_project(self):
        project = self.create_project()
        other_client = APIClient()
        other_client.force_authenticate(user=self.other_user)

        response = other_client.post(f"/api/projects/{project['id']}/duplicate/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Project.objects.filter(name__endswith="(Copy)").count(), 0)

    def test_anonymous_user_cannot_update_or_delete_project(self):
        project = self.create_project()
        anonymous_client = APIClient()

        patch_response = anonymous_client.patch(
            f"/api/projects/{project['id']}/",
            {"name": "Anonymous update"},
            format="json",
        )
        delete_response = anonymous_client.delete(f"/api/projects/{project['id']}/")

        self.assertEqual(patch_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(delete_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(Project.objects.filter(id=project["id"]).exists())

    def test_login_logout_and_me_api(self):
        session_client = APIClient(enforce_csrf_checks=True)
        csrf_response = session_client.get("/api/auth/csrf/")
        csrf_token = csrf_response.data["data"]["csrfToken"]

        login_response = session_client.post(
            "/api/auth/login/",
            {"username": "chemist_a", "password": "pass-a"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        me_response = session_client.get("/api/auth/me/")
        csrf_token = session_client.cookies["csrftoken"].value
        logout_response = session_client.post(
            "/api/auth/logout/",
            {},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        self.assertEqual(login_response.data["data"]["username"], "chemist_a")
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data["data"]["username"], "chemist_a")
        self.assertEqual(logout_response.status_code, status.HTTP_200_OK)

    def test_project_validation_error_uses_common_response_format(self):
        response = self.client.post("/api/projects/", {"name": ""}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])
        self.assertIsNone(response.data["data"])
        self.assertIsInstance(response.data["message"], str)
        self.assertNotEqual(response.data["message"], "")

    def test_project_list_and_detail_restore_design_and_results(self):
        project = self.create_project()
        self.create_design(project["id"])
        self.submit_results(project["id"])

        list_response = self.client.get("/api/projects/")

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertTrue(list_response.data["success"])
        projects = list_response.data["data"]
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]["project_id"], project["id"])
        self.assertEqual(projects[0]["name"], "Suzuki coupling optimization")
        self.assertEqual(projects[0]["run_budget"], 8)
        self.assertEqual(projects[0]["response_name"], "Yield")
        self.assertEqual(projects[0]["factor_count"], 4)
        self.assertEqual(projects[0]["result_count"], 8)

        detail_response = self.client.get(f"/api/projects/{project['id']}/")

        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertTrue(detail_response.data["success"])
        detail = detail_response.data["data"]
        self.assertEqual(detail["project"]["id"], project["id"])
        self.assertEqual(len(detail["factors"]), 4)
        self.assertEqual(len(detail["design_runs"]), 8)
        self.assertEqual(len(detail["results"]), 8)
        self.assertEqual(detail["design_runs"][0]["run_order"], 1)
        self.assertEqual(Decimal(detail["results"][0]["response"]), Decimal("42.0000"))

    def test_design_creation_api_creates_8_runs(self):
        project = self.create_project()
        design = self.create_design(project["id"])

        self.assertEqual(len(design), 8)
        self.assertEqual(design[0]["run_order"], 1)
        self.assertEqual(design[0]["levels"], {"A": -1, "B": -1, "C": -1, "D": -1})
        self.assertEqual(design[7]["run_order"], 8)
        self.assertEqual(design[7]["levels"], {"A": 1, "B": 1, "C": 1, "D": 1})

    def test_mixed_categorical_design_report_exports_and_surface_guard(self):
        project = self.create_project(self.mixed_factor_payload)
        design = self.create_design(project["id"])
        self.submit_results(project["id"])

        self.assertEqual(design[0]["values"]["C"], "THF")
        self.assertEqual(design[0]["values"]["D"], "K2CO3")
        self.assertEqual(design[7]["values"]["C"], "Toluene")
        self.assertEqual(design[7]["values"]["D"], "Cs2CO3")

        report_response = self.client.get(f"/api/projects/{project['id']}/report/")
        self.assertEqual(report_response.status_code, status.HTTP_200_OK)
        report = report_response.data["data"]
        solvent_effect = next(
            effect for effect in report["effects"] if effect["factor_key"] == "C"
        )
        self.assertEqual(solvent_effect["factor_type"], "categorical")
        self.assertEqual(solvent_effect["direction"], "HIGH")
        self.assertIn("Toluene", solvent_effect["direction_label"])
        self.assertIn("THF", solvent_effect["direction_label"])
        self.assertTrue(
            any(
                condition["value"] in {"THF", "Toluene", "K2CO3", "Cs2CO3"}
                for recommendation in report["recommendations"]
                for condition in recommendation["conditions"].values()
                if condition["factor_type"] == "categorical"
            )
        )

        surface_response = self.client.get(
            f"/api/projects/{project['id']}/surface/",
            {
                "x_factor": "용매(Solvent)",
                "y_factor": "온도(Temperature, °C)",
            },
        )
        self.assertEqual(surface_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(surface_response.data["success"])
        self.assertIn("continuous factors only", surface_response.data["message"])

        csv_response = self.client.get(f"/api/projects/{project['id']}/design.csv/")
        self.assertEqual(csv_response.status_code, status.HTTP_200_OK)
        csv_text = csv_response.content.decode("utf-8-sig")
        self.assertIn("THF", csv_text)
        self.assertIn("Toluene", csv_text)
        self.assertIn("K2CO3", csv_text)
        self.assertIn("Cs2CO3", csv_text)

        pdf_response = self.client.get(f"/api/projects/{project['id']}/report.pdf/")
        self.assertEqual(pdf_response.status_code, status.HTTP_200_OK)
        self.assertEqual(pdf_response["Content-Type"], "application/pdf")
        self.assertTrue(pdf_response.content.startswith(b"%PDF"))

    def test_categorical_factor_rejects_more_than_two_levels(self):
        payload = {
            **self.mixed_factor_payload,
            "factors": [
                *self.mixed_factor_payload["factors"][:2],
                {
                    "idx": 3,
                    "factor_type": "categorical",
                    "name_kr": "용매",
                    "name_en": "Solvent",
                    "levels": ["THF", "Toluene", "DMSO"],
                },
                self.mixed_factor_payload["factors"][3],
            ],
        }

        response = self.client.post("/api/projects/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])
        self.assertIn("exactly 2 categorical levels", response.data["message"])

    def test_design_creation_api_can_add_center_points(self):
        project = self.create_project()
        design = self.create_design(project["id"], include_center_points=True)

        self.assertEqual(len(design), 11)
        center_runs = design[8:]
        self.assertEqual([run["run_order"] for run in center_runs], [9, 10, 11])
        for run in center_runs:
            self.assertEqual(run["levels"], {"A": 0, "B": 0, "C": 0, "D": 0})
            self.assertEqual(Decimal(str(run["values"]["A"])), Decimal("75.0000"))
            self.assertEqual(Decimal(str(run["values"]["B"])), Decimal("2.5000"))
            self.assertEqual(Decimal(str(run["values"]["C"])), Decimal("2.7500"))
            self.assertEqual(Decimal(str(run["values"]["D"])), Decimal("0.1750"))

    def test_result_input_api(self):
        project = self.create_project()
        self.create_design(project["id"])

        response = self.client.post(
            f"/api/projects/{project['id']}/results/",
            {"run_order": 1, "response": "42", "note": "test run 1"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        result = response.data["data"]
        self.assertEqual(Decimal(result["response"]), Decimal("42.0000"))
        self.assertEqual(result["run_order"], 1)
        self.assertEqual(ResultHistory.objects.count(), 0)

    def test_result_update_creates_history(self):
        project = self.create_project()
        self.create_design(project["id"])
        self.client.post(
            f"/api/projects/{project['id']}/results/",
            {"run_order": 1, "response": "42"},
            format="json",
        )

        response = self.client.post(
            f"/api/projects/{project['id']}/results/",
            {"run_order": 1, "response": "55"},
            format="json",
        )
        history_response = self.client.get(f"/api/projects/{project['id']}/result-history/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(ResultHistory.objects.count(), 1)
        history = ResultHistory.objects.get()
        self.assertEqual(history.project_id, project["id"])
        self.assertEqual(history.run.run_order, 1)
        self.assertEqual(history.old_y, Decimal("42.0000"))
        self.assertEqual(history.new_y, Decimal("55.0000"))
        self.assertEqual(history.changed_by, self.user)
        self.assertEqual(history_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(history_response.data["data"]), 1)
        self.assertEqual(history_response.data["data"][0]["run_order"], 1)
        self.assertEqual(
            Decimal(history_response.data["data"][0]["old_y"]),
            Decimal("42.0000"),
        )

    def test_project_delete_removes_result_history(self):
        project = self.create_project()
        self.create_design(project["id"])
        self.client.post(
            f"/api/projects/{project['id']}/results/",
            {"run_order": 1, "response": "42"},
            format="json",
        )
        self.client.post(
            f"/api/projects/{project['id']}/results/",
            {"run_order": 1, "response": "55"},
            format="json",
        )
        self.assertEqual(ResultHistory.objects.count(), 1)

        response = self.client.delete(f"/api/projects/{project['id']}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(ResultHistory.objects.count(), 0)

    def test_other_user_cannot_access_result_history(self):
        project = self.create_project()
        self.create_design(project["id"])
        other_client = APIClient()
        other_client.force_authenticate(user=self.other_user)

        response = other_client.get(f"/api/projects/{project['id']}/result-history/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_report_api_main_effects_and_next_runs(self):
        project = self.create_project()
        design = self.create_design(project["id"])
        self.submit_results(project["id"])

        response = self.client.get(f"/api/projects/{project['id']}/report/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["message"], "")
        report = response.data["data"]

        effects = {
            item["factor_key"]: Decimal(str(item["effect"]))
            for item in report["effects"]
        }
        effect_impacts = {
            item["factor_key"]: Decimal(str(item["effect_abs"]))
            for item in report["effects"]
        }
        self.assertEqual(effects["A"], Decimal("5.5"))
        self.assertEqual(effects["B"], Decimal("3.0"))
        self.assertEqual(effects["C"], Decimal("9.0"))
        self.assertEqual(effects["D"], Decimal("1.5"))
        self.assertEqual(effect_impacts["A"], Decimal("5.5"))
        self.assertEqual(effect_impacts["B"], Decimal("3.0"))
        self.assertEqual(effect_impacts["C"], Decimal("9.0"))
        self.assertEqual(effect_impacts["D"], Decimal("1.5"))

        top_drivers = report["top_drivers"]
        self.assertEqual([item["factor_key"] for item in top_drivers], ["C", "A", "B", "D"])
        self.assertEqual([item["factor_key"] for item in report["pareto"]], ["C", "A", "B", "D"])
        self.assertFalse(report["curvature"]["available"])
        self.assertEqual(len(report["anova"]), 4)
        self.assertTrue(all("p_value" in row for row in report["anova"]))

        interpretation = report["interpretation"]
        self.assertGreaterEqual(len(interpretation), 5)
        self.assertTrue(any("현재 데이터에서는" in item for item in interpretation))
        self.assertTrue(any("후속 실험에서는" in item for item in interpretation))
        self.assertTrue(any("추가 검증이 필요합니다" in item for item in interpretation))

        recommendations = report["recommendations"]
        self.assertEqual(len(recommendations), 3)
        completed_conditions = {
            tuple(Decimal(str(run["values"][key])).normalize() for key in ("A", "B", "C", "D"))
            for run in design
        }

        for recommendation in recommendations:
            self.assertIn("predicted_yield", recommendation)
            self.assertIsInstance(recommendation["predicted_yield"], float)
            self.assertGreaterEqual(recommendation["predicted_yield"], 0)
            self.assertLessEqual(recommendation["predicted_yield"], 100)
            self.assertIn(
                "예측 모델 기준 수율이 높게 예상됨",
                recommendation["strategy"],
            )
            recommended_condition = tuple(
                Decimal(str(recommendation["conditions"][key]["value"])).normalize()
                for key in ("A", "B", "C", "D")
            )
            self.assertNotIn(recommended_condition, completed_conditions)

            factors_by_key = {factor["display_name"]: factor for factor in project["factors"]}
            for condition in recommendation["conditions"].values():
                factor = factors_by_key[condition["display_name"]]
                value = Decimal(str(condition["value"]))
                self.assertEqual(condition["unit"], factor["unit"])
                self.assertEqual(Decimal(str(condition["low"])), Decimal(str(factor["low"])))
                self.assertEqual(Decimal(str(condition["high"])), Decimal(str(factor["high"])))
                self.assertGreaterEqual(value, Decimal(str(factor["low"])))
                self.assertLessEqual(value, Decimal(str(factor["high"])))

    def test_report_with_center_points_returns_curvature_and_anova(self):
        project = self.create_project()
        self.create_design(project["id"], include_center_points=True)
        self.submit_results(project["id"])
        for run_order, result_value in zip((9, 10, 11), ("62", "64", "63")):
            response = self.client.post(
                f"/api/projects/{project['id']}/results/",
                {"run_order": run_order, "response": result_value},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertTrue(response.data["success"])

        response = self.client.get(f"/api/projects/{project['id']}/report/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        report = response.data["data"]
        self.assertTrue(report["curvature"]["available"])
        self.assertEqual(report["curvature"]["center_mean"], 63.0)
        self.assertEqual(len(report["anova"]), 4)
        self.assertTrue(all("p_value" in row for row in report["anova"]))
        self.assertTrue(all("significant" in row for row in report["anova"]))

    def test_result_input_rejects_invalid_yield_percent(self):
        project = self.create_project()
        self.create_design(project["id"])

        for invalid_value in ("-1", "101"):
            response = self.client.post(
                f"/api/projects/{project['id']}/results/",
                {"run_order": 1, "response": invalid_value},
                format="json",
            )

            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertFalse(response.data["success"])
            self.assertIn("between 0 and 100", response.data["message"])

    def test_report_interpretation_warns_when_data_is_insufficient(self):
        project = self.create_project()
        self.create_design(project["id"])

        response = self.client.get(f"/api/projects/{project['id']}/report/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        report = response.data["data"]
        self.assertIn("interpretation", report)
        self.assertTrue(
            any("아직 부족합니다" in item for item in report["interpretation"])
        )
        self.assertTrue(
            any("추가 검증이 필요합니다" in item for item in report["interpretation"])
        )

    def test_report_pdf_download(self):
        project = self.create_project()
        self.create_design(project["id"])
        self.submit_results(project["id"])

        response = self.client.get(f"/api/projects/{project['id']}/report.pdf/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(
            f"coreacta-doe-report-project-{project['id']}.pdf",
            response["Content-Disposition"],
        )
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertGreater(len(response.content), 1000)

    def test_surface_api_returns_grid_for_suzuki_data(self):
        project = self.create_project()
        self.create_design(project["id"])
        self.submit_results(project["id"])

        response = self.client.get(
            f"/api/projects/{project['id']}/surface/",
            {
                "x_factor": "온도(Temperature, °C)",
                "y_factor": "촉매량(Catalyst loading, mol%)",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        surface = response.data["data"]
        self.assertEqual(surface["x_factor"], "온도(Temperature, °C)")
        self.assertEqual(surface["y_factor"], "촉매량(Catalyst loading, mol%)")
        self.assertEqual(len(surface["x_values"]), 11)
        self.assertEqual(len(surface["y_values"]), 11)
        self.assertEqual(len(surface["z_matrix"]), 11)
        self.assertEqual(len(surface["z_matrix"][0]), 11)
        self.assertIsInstance(surface["z_matrix"][0][0], float)
        for row in surface["z_matrix"]:
            for predicted_yield in row:
                self.assertGreaterEqual(predicted_yield, 0)
                self.assertLessEqual(predicted_yield, 100)

    def create_project(self, payload=None):
        response = self.client.post(
            "/api/projects/",
            payload or self.project_payload,
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["message"], "")
        return response.data["data"]

    def create_design(self, project_id, include_center_points=False):
        response = self.client.post(
            f"/api/projects/{project_id}/design/",
            {"include_center_points": include_center_points},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["message"], "")
        return response.data["data"]

    def submit_results(self, project_id):
        for run_order, result_value in enumerate(self.result_values, start=1):
            response = self.client.post(
                f"/api/projects/{project_id}/results/",
                {"run_order": run_order, "response": str(result_value)},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertTrue(response.data["success"])
