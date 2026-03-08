from django.contrib import admin

from .models import Video


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ("id", "video_name", "prediction", "confidence", "sequence_length", "num_faces", "upload_date")
    list_filter = ("prediction", "sequence_length", "upload_date")
    search_fields = ("video_name",)
