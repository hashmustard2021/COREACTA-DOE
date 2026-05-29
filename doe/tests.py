from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase


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

    def test_project_creation_api(self):
        project = self.create_project()

        self.assertEqual(project["name"], "Suzuki coupling optimization")
        self.assertEqual(len(project["factors"]), 4)
        self.assertEqual(project["factors"][0]["display_name"], "온도(Temperature, °C)")

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

    def create_project(self):
        response = self.client.post("/api/projects/", self.project_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["message"], "")
        return response.data["data"]

    def create_design(self, project_id):
        response = self.client.post(f"/api/projects/{project_id}/design/")
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
