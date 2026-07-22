"""
currency_predictor.py
─────────────────────
Loads the currency_cnn.pt checkpoint once at startup and exposes a
`predict(pil_image)` function used by the FastAPI route.

Checkpoint format expected:
  {
    "arch":       str,          # e.g. "efficientnet_b0"
    "classes":    list[str],    # e.g. ["fake", "real"]
    "state_dict": OrderedDict   # model weights
  }
"""

import os
import torch
import torchvision.models as tvm
from torchvision import transforms
from PIL import Image

# ── Path to the checkpoint ──────────────────────────────────────────────────
_BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
_MODEL_PATH = os.path.join(_BASE_DIR, "..", "ai", "currency_cnn.pt")

# ── ImageNet normalisation (must match training pre-processing) ─────────────
_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std =[0.229, 0.224, 0.225],
    ),
])

# ── Supported architecture builders ─────────────────────────────────────────
_ARCH_MAP = {
    # EfficientNet family (torchvision ≥ 0.13)
    "efficientnet_b0": lambda nc: _efficientnet("efficientnet_b0", nc),
    "efficientnet_b1": lambda nc: _efficientnet("efficientnet_b1", nc),
    "efficientnet_b2": lambda nc: _efficientnet("efficientnet_b2", nc),
    "efficientnet_b3": lambda nc: _efficientnet("efficientnet_b3", nc),
    "efficientnet_b4": lambda nc: _efficientnet("efficientnet_b4", nc),
    # ResNet family
    "resnet18":  lambda nc: _resnet(tvm.resnet18,  nc),
    "resnet34":  lambda nc: _resnet(tvm.resnet34,  nc),
    "resnet50":  lambda nc: _resnet(tvm.resnet50,  nc),
    "resnet101": lambda nc: _resnet(tvm.resnet101, nc),
    # MobileNet family
    "mobilenet_v2": lambda nc: _mobilenet_v2(nc),
    "mobilenet_v3_small":  lambda nc: _mobilenet_v3("mobilenet_v3_small",  nc),
    "mobilenet_v3_large":  lambda nc: _mobilenet_v3("mobilenet_v3_large",  nc),
    # VGG
    "vgg16": lambda nc: _vgg(tvm.vgg16, nc),
    "vgg19": lambda nc: _vgg(tvm.vgg19, nc),
}


def _efficientnet(name: str, num_classes: int):
    """Build an EfficientNet from torchvision and replace classifier head."""
    builder = getattr(tvm, name)
    model   = builder(weights=None)
    in_feat = model.classifier[1].in_features
    import torch.nn as nn
    model.classifier[1] = nn.Linear(in_feat, num_classes)
    return model


def _resnet(builder, num_classes: int):
    import torch.nn as nn
    model = builder(weights=None)
    model.fc = nn.Linear(model.fc.in_features, num_classes)
    return model


def _mobilenet_v2(num_classes: int):
    import torch.nn as nn
    model = tvm.mobilenet_v2(weights=None)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
    return model


def _mobilenet_v3(name: str, num_classes: int):
    import torch.nn as nn
    builder = getattr(tvm, name)
    model   = builder(weights=None)
    model.classifier[3] = nn.Linear(model.classifier[3].in_features, num_classes)
    return model


def _vgg(builder, num_classes: int):
    import torch.nn as nn
    model = builder(weights=None)
    model.classifier[6] = nn.Linear(model.classifier[6].in_features, num_classes)
    return model


# ── Module-level singletons (loaded once at startup) ────────────────────────
_model:   torch.nn.Module | None = None
_classes: list[str]              = []
_device:  torch.device           = torch.device("cpu")


def load_model() -> None:
    """Load checkpoint and build the model. Called once during FastAPI startup."""
    global _model, _classes, _device

    if not os.path.isfile(_MODEL_PATH):
        raise FileNotFoundError(
            f"currency_cnn.pt not found at: {_MODEL_PATH}\n"
            "Make sure the file exists at backend/ai/currency_cnn.pt"
        )

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[CurrencyML] Loading checkpoint from: {_MODEL_PATH}")
    print(f"[CurrencyML] Using device: {_device}")

    checkpoint = torch.load(_MODEL_PATH, map_location=_device, weights_only=False)

    # ── Read architecture & classes from checkpoint ──────────────────────────
    arch    = checkpoint.get("arch", "efficientnet_b0").lower().replace("-", "_")
    classes = checkpoint.get("classes", ["fake", "real"])

    print(f"[CurrencyML] Architecture: {arch}")
    print(f"[CurrencyML] Classes:      {classes}")

    if arch not in _ARCH_MAP:
        raise ValueError(
            f"Unsupported architecture '{arch}'. "
            f"Supported: {list(_ARCH_MAP.keys())}"
        )

    model = _ARCH_MAP[arch](len(classes))
    model.load_state_dict(checkpoint["state_dict"])
    model.to(_device)
    model.eval()

    _model   = model
    _classes = classes
    print(f"[CurrencyML] Model ready. Classes: {_classes}")


def predict(image: Image.Image) -> dict:
    """
    Run inference on a PIL image.

    Returns:
        {
          "prediction": "fake" | "real",
          "confidence": 0.0–100.0
        }
    """
    if _model is None:
        raise RuntimeError("Model not loaded. Call load_model() first.")

    # Ensure RGB (drop alpha channel if present)
    image = image.convert("RGB")

    tensor = _TRANSFORM(image).unsqueeze(0).to(_device)   # (1, 3, 224, 224)

    with torch.no_grad():
        logits = _model(tensor)                             # (1, num_classes)
        probs  = torch.softmax(logits, dim=1)[0]           # (num_classes,)

    best_idx    = int(probs.argmax())
    label       = _classes[best_idx]
    confidence  = float(probs[best_idx]) * 100.0           # 0–100

    return {
        "prediction": label,
        "confidence": round(confidence, 2),
    }
