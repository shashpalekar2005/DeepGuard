from django import forms

class VideoUploadForm(forms.Form):

    upload_video_file = forms.FileField(
        label="Select Video",
        required=True,
        widget=forms.FileInput(attrs={"accept": "video/*"}),
    )
    sequence_length = forms.IntegerField(label="Sequence Length", required=True, initial=20)

    def clean_sequence_length(self):
        val = int(self.cleaned_data["sequence_length"])
        allowed = {10, 20, 40, 60, 80, 100}
        if val not in allowed:
            raise forms.ValidationError("Sequence Length must be one of: 10, 20, 40, 60, 80, 100")
        return val
