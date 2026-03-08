import torch
from torch import nn
from torchvision import models


class Model(nn.Module):
    """
    ResNeXt50_32x4d (pretrained) + LSTM sequence classifier.

    Expected input: (B, T, 3, 112, 112)
    Returns: logits (B, 2) where class 0=FAKE, class 1=REAL.
    """

    def __init__(
        self,
        num_classes: int = 2,
        latent_dim: int = 2048,
        lstm_layers: int = 1,
        hidden_dim: int = 2048,
        bidirectional: bool = False,
        pretrained: bool = True,
    ):
        super().__init__()

        backbone = models.resnext50_32x4d(weights=models.ResNeXt50_32X4D_Weights.DEFAULT if pretrained else None)
        self.cnn = nn.Sequential(*list(backbone.children())[:-1])
        self.cnn_out_dim = latent_dim

        self.lstm = nn.LSTM(
            input_size=self.cnn_out_dim,
            hidden_size=hidden_dim,
            num_layers=lstm_layers,
            batch_first=True,
            bidirectional=bidirectional,
        )

        lstm_out_dim = hidden_dim * (2 if bidirectional else 1)
        self.fc = nn.Linear(lstm_out_dim, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if x.ndim != 5:
            raise ValueError(f"Expected 5D input (B,T,C,H,W). Got shape={tuple(x.shape)}")
        b, t, c, h, w = x.shape
        x = x.reshape(b * t, c, h, w)
        feats = self.cnn(x).flatten(1)  # (B*T, 2048)
        feats = feats.reshape(b, t, -1)
        out, _ = self.lstm(feats)
        last = out[:, -1, :]
        return self.fc(last)

