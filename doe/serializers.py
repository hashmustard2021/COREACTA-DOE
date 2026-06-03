from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import DesignRun, Factor, Project, Result


class FactorSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = Factor
        fields = [
            "id",
            "idx",
            "factor_type",
            "name_kr",
            "name_en",
            "unit",
            "low",
            "high",
            "levels",
            "display_name",
        ]

    def validate(self, attrs):
        factor_type = attrs.get(
            "factor_type",
            getattr(self.instance, "factor_type", Factor.CONTINUOUS),
        )
        low = attrs.get("low", getattr(self.instance, "low", None))
        high = attrs.get("high", getattr(self.instance, "high", None))
        levels = attrs.get("levels", getattr(self.instance, "levels", []))

        if factor_type == Factor.CONTINUOUS:
            if low is None or high is None:
                raise serializers.ValidationError(
                    "continuous factors require both low and high."
                )
            if low >= high:
                raise serializers.ValidationError("low must be smaller than high.")
            attrs["levels"] = []
            return attrs

        if factor_type == Factor.CATEGORICAL:
            if isinstance(levels, str):
                levels = levels.replace("\n", ",").split(",")
            cleaned_levels = [
                str(level).strip()
                for level in levels
                if str(level).strip()
            ]
            if len(cleaned_levels) < 2:
                raise serializers.ValidationError(
                    "categorical factors require at least 2 levels."
                )
            if len(cleaned_levels) > 2:
                raise serializers.ValidationError(
                    "Coreacta DOE v2 supports exactly 2 categorical levels."
                )
            attrs["levels"] = cleaned_levels
            attrs["low"] = None
            attrs["high"] = None
            attrs["unit"] = ""
            return attrs

        raise serializers.ValidationError("factor_type must be continuous or categorical.")
        return attrs


class ProjectSerializer(serializers.ModelSerializer):
    factors = FactorSerializer(many=True)
    owner = serializers.CharField(source="owner.username", read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "owner",
            "name",
            "description",
            "slogan",
            "response_name",
            "goal",
            "factors",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["owner", "created_at", "updated_at"]

    def validate_factors(self, factors):
        if not 1 <= len(factors) <= 4:
            raise serializers.ValidationError("Use 1 to 4 factors.")

        indexes = [factor["idx"] for factor in factors]
        if len(indexes) != len(set(indexes)):
            raise serializers.ValidationError("Factor idx values must be unique.")

        expected_indexes = list(range(1, len(factors) + 1))
        if sorted(indexes) != expected_indexes:
            raise serializers.ValidationError(
                f"Factor idx values must be sequential: {expected_indexes}."
            )
        return factors

    def validate_goal(self, value):
        if value in {"", "maximize", "minimize"}:
            return value or "maximize"
        raise serializers.ValidationError("goal must be maximize or minimize.")

    def create(self, validated_data):
        factors_data = validated_data.pop("factors")
        owner = self.context["request"].user
        project = Project.objects.create(owner=owner, **validated_data)
        for factor_data in factors_data:
            Factor.objects.create(project=project, **factor_data)
        return project


class ProjectUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["name", "slogan", "response_name", "goal"]

    def validate_goal(self, value):
        if value in {"", "maximize", "minimize"}:
            return value or "maximize"
        raise serializers.ValidationError("goal must be maximize or minimize.")


class ProjectListSerializer(serializers.ModelSerializer):
    project_id = serializers.IntegerField(source="id", read_only=True)
    owner = serializers.CharField(source="owner.username", read_only=True)
    run_budget = serializers.SerializerMethodField()
    response_name = serializers.SerializerMethodField()
    factor_count = serializers.SerializerMethodField()
    result_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "project_id",
            "owner",
            "name",
            "created_at",
            "run_budget",
            "response_name",
            "factor_count",
            "result_count",
        ]

    def get_run_budget(self, obj):
        return obj.design_runs.count() or 8

    def get_response_name(self, obj):
        return obj.response_name or "Yield"

    def get_factor_count(self, obj):
        return obj.factors.count()

    def get_result_count(self, obj):
        return obj.design_runs.filter(result__isnull=False).count()


class DesignRunSerializer(serializers.ModelSerializer):
    result = serializers.SerializerMethodField()

    class Meta:
        model = DesignRun
        fields = ["id", "run_order", "levels", "values", "result"]

    def get_result(self, obj):
        if not hasattr(obj, "result"):
            return None
        return {
            "response": obj.result.response,
            "note": obj.result.note,
            "updated_at": obj.result.updated_at,
        }


class ResultUpsertSerializer(serializers.Serializer):
    run_order = serializers.IntegerField(min_value=1, max_value=11)
    response = serializers.DecimalField(max_digits=12, decimal_places=4)
    note = serializers.CharField(required=False, allow_blank=True)

    def validate_response(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("Yield response must be between 0 and 100.")
        return value


class ResultSerializer(serializers.ModelSerializer):
    run_order = serializers.IntegerField(source="design_run.run_order", read_only=True)

    class Meta:
        model = Result
        fields = ["id", "run_order", "response", "note", "created_at", "updated_at"]


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["username"],
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError("Invalid username or password.")
        attrs["user"] = user
        return attrs
