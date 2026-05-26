from rest_framework import serializers

from .models import DesignRun, Factor, Project, Result


class FactorSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = Factor
        fields = ["id", "idx", "name_kr", "name_en", "unit", "low", "high", "display_name"]

    def validate(self, attrs):
        low = attrs.get("low", getattr(self.instance, "low", None))
        high = attrs.get("high", getattr(self.instance, "high", None))
        if low is not None and high is not None and low >= high:
            raise serializers.ValidationError("low must be smaller than high.")
        return attrs


class ProjectSerializer(serializers.ModelSerializer):
    factors = FactorSerializer(many=True)

    class Meta:
        model = Project
        fields = ["id", "name", "description", "factors", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

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

    def create(self, validated_data):
        factors_data = validated_data.pop("factors")
        project = Project.objects.create(**validated_data)
        for factor_data in factors_data:
            Factor.objects.create(project=project, **factor_data)
        return project


class ProjectListSerializer(serializers.ModelSerializer):
    project_id = serializers.IntegerField(source="id", read_only=True)
    run_budget = serializers.SerializerMethodField()
    response_name = serializers.SerializerMethodField()
    factor_count = serializers.SerializerMethodField()
    result_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "project_id",
            "name",
            "created_at",
            "run_budget",
            "response_name",
            "factor_count",
            "result_count",
        ]

    def get_run_budget(self, obj):
        return 8

    def get_response_name(self, obj):
        return "Yield"

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
    run_order = serializers.IntegerField(min_value=1, max_value=8)
    response = serializers.DecimalField(max_digits=12, decimal_places=4)
    note = serializers.CharField(required=False, allow_blank=True)


class ResultSerializer(serializers.ModelSerializer):
    run_order = serializers.IntegerField(source="design_run.run_order", read_only=True)

    class Meta:
        model = Result
        fields = ["id", "run_order", "response", "note", "created_at", "updated_at"]
