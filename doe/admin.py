from django.contrib import admin

from .models import DesignRun, Factor, Project, Result


admin.site.register(Project)
admin.site.register(Factor)
admin.site.register(DesignRun)
admin.site.register(Result)
