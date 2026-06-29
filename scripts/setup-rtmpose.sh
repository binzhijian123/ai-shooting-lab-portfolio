#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_PREFIX="${ROOT_DIR}/.venv-mmpose"

if ! command -v mamba >/dev/null 2>&1; then
  echo "mamba is required for the RTMPose environment." >&2
  exit 1
fi

if [ ! -d "${ENV_PREFIX}" ]; then
  mamba create -y -p "${ENV_PREFIX}" python=3.10 pip
fi

"${ENV_PREFIX}/bin/python" -m pip install -U pip wheel
"${ENV_PREFIX}/bin/python" -m pip install numpy scipy cython

# PyPI xtcocotools can miss generated C sources on macOS arm64.
"${ENV_PREFIX}/bin/python" -m pip install git+https://github.com/jin-s13/xtcocoapi.git

"${ENV_PREFIX}/bin/python" -m pip install torch torchvision openmim
"${ENV_PREFIX}/bin/mim" install mmengine

# mmdet 3.3.x requires mmcv < 2.2.0, so avoid the newer 2.2.0 wheel/build.
"${ENV_PREFIX}/bin/python" -m pip install --no-build-isolation "mmcv>=2.1.0,<2.2.0"
"${ENV_PREFIX}/bin/mim" install "mmdet>=3.1.0,<3.4.0"
"${ENV_PREFIX}/bin/python" -m pip install "mmpose==1.3.2"

"${ENV_PREFIX}/bin/python" - <<'PY'
import torch, torchvision, mmengine, mmcv, mmdet, mmpose, cv2, xtcocotools
for mod in [torch, torchvision, mmengine, mmcv, mmdet, mmpose, cv2]:
    print(mod.__name__, getattr(mod, "__version__", "ok"))
print("xtcocotools ok")
PY
