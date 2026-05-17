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
        self.assertEqual(Decimal(response.data["response"]), Decimal("42.0000"))
        self.assertEqual(response.data["run_order"], 1)

    def test_report_api_main_effects_and_next_runs(self):
        project = self.create_project()
        self.create_design(project["id"])
        self.submit_results(project["id"])

        response = self.client.get(f"/api/projects/{project['id']}/report/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "")

        effects = {
            item["factor_key"]: Decimal(str(item["effect"]))
            for item in response.data["effects"]
        }
        self.assertEqual(effects["A"], Decimal("5.5"))
        self.assertEqual(effects["B"], Decimal("3.0"))
        self.assertEqual(effects["C"], Decimal("9.0"))
        self.assertEqual(effects["D"], Decimal("1.5"))

        top_drivers = response.data["top_drivers"]
        self.assertEqual([item["factor_key"] for item in top_drivers], ["C", "A", "B", "D"])

        recommendations = response.data["recommendations"]
        self.assertEqual(len(recommendations), 3)
        self.assertEqual(recommendations[0]["conditions"]["C"]["direction"], "HIGH")
        self.assertEqual(recommendations[0]["conditions"]["A"]["direction"], "HIGH")
        self.assertEqual(recommendations[1]["conditions"]["C"]["direction"], "LOW")
        self.assertEqual(recommendations[2]["conditions"]["A"]["direction"], "LOW")

    def create_project(self):
        response = self.client.post("/api/projects/", self.project_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return response.data

    def create_design(self, project_id):
        response = self.client.post(f"/api/projects/{project_id}/design/")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return response.data

    def submit_results(self, project_id):
        for run_order, result_value in enumerate(self.result_values, start=1):
            response = self.client.post(
                f"/api/projects/{project_id}/results/",
                {"run_order": run_order, "response": str(result_value)},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
