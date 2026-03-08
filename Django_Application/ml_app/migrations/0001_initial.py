from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Video",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("video_name", models.CharField(max_length=255)),
                ("original_video", models.FileField(upload_to="videos/%Y/%m/%d/")),
                (
                    "prediction",
                    models.CharField(
                        choices=[("REAL", "REAL"), ("FAKE", "FAKE")],
                        max_length=4,
                    ),
                ),
                ("confidence", models.FloatField(help_text="Confidence percentage (0-100)")),
                ("sequence_length", models.PositiveIntegerField(default=20)),
                ("num_faces", models.PositiveIntegerField(default=0)),
                ("upload_date", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["-upload_date"],
            },
        ),
    ]

