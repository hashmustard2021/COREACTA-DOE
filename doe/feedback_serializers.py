from rest_framework import serializers

from .models import Feedback, Project


class FeedbackCreateSerializer(serializers.ModelSerializer):
    project_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = Feedback
        fields = ("category", "message", "page", "step", "project_id")
        extra_kwargs = {
            "message": {"trim_whitespace": True},
            "page": {"required": False},
            "step": {"required": False},
        }

    def validate_message(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("내용을 입력해 주세요.")
        return value

    def validate_project_id(self, value):
        if value is None:
            return None
        user = self.context["request"].user
        if not Project.objects.filter(pk=value, owner=user).exists():
            raise serializers.ValidationError("현재 프로젝트를 찾을 수 없어요.")
        return value

    def create(self, validated_data):
        project_id = validated_data.pop("project_id", None)
        return Feedback.objects.create(
            user=self.context["request"].user,
            project_id=project_id,
            **validated_data,
        )
