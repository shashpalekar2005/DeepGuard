from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ml_app", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="video",
            name="is_demo",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="video",
            name="model_used",
            field=models.CharField(default="ResNeXt50 + LSTM", max_length=255),
        ),
    ]

