from django.db import models

class Video(models.Model):
    """
    One deepfake analysis run.

    This record is used by:
    - results page (latest or by id)
    - history page (all rows)
    """

    PRED_REAL = "REAL"
    PRED_FAKE = "FAKE"
    PRED_CHOICES = [(PRED_REAL, "REAL"), (PRED_FAKE, "FAKE")]

    video_name = models.CharField(max_length=255)
    original_video = models.FileField(upload_to="videos/%Y/%m/%d/")

    prediction = models.CharField(max_length=4, choices=PRED_CHOICES)
    confidence = models.FloatField(help_text="Confidence percentage (0-100)")

    sequence_length = models.PositiveIntegerField(default=20)
    num_faces = models.PositiveIntegerField(default=0)
    is_demo = models.BooleanField(default=False)
    model_used = models.CharField(max_length=255, default="ResNeXt50 + LSTM")

    upload_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-upload_date"]

    def __str__(self) -> str:
        return f"{self.video_name} ({self.prediction} {self.confidence:.1f}%)"
