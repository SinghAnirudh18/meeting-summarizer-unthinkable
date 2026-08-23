"""
CUDA & cuDNN DLL Setup Utility for Windows.
Automatically registers NVIDIA cuDNN, cuBLAS, and CUDA runtime DLL directories
so CTranslate2, faster-whisper, and llama-cpp find cudnn_ops64_9.dll and cublas64_12.dll.
"""
from __future__ import annotations

import logging
import os
import site
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


def setup_cuda_dlls():
    """Register all NVIDIA CUDA and cuDNN binary paths with Windows DLL search."""
    if sys.platform != "win32":
        return

    added_paths = []

    # 1. Check known pip package locations
    package_names = [
        "nvidia.cudnn",
        "nvidia.cublas",
        "nvidia.cuda_nvrtc",
        "nvidia.cuda_runtime",
    ]
    for pkg in package_names:
        try:
            mod = __import__(pkg, fromlist=["__file__"])
            if hasattr(mod, "__file__") and mod.__file__:
                bin_dir = Path(mod.__file__).parent / "bin"
                if bin_dir.exists():
                    try:
                        os.add_dll_directory(str(bin_dir))
                        added_paths.append(str(bin_dir))
                    except Exception as e:
                        logger.debug("Failed add_dll_directory for %s: %s", bin_dir, e)
        except Exception:
            pass

    # 2. Check site-packages/nvidia/*/bin
    try:
        site_dirs = site.getsitepackages()
        for s in site_dirs:
            nvidia_root = Path(s) / "nvidia"
            if nvidia_root.exists() and nvidia_root.is_dir():
                for sub in nvidia_root.iterdir():
                    if sub.is_dir():
                        bin_dir = sub / "bin"
                        if bin_dir.exists() and str(bin_dir) not in added_paths:
                            try:
                                os.add_dll_directory(str(bin_dir))
                                added_paths.append(str(bin_dir))
                            except Exception:
                                pass
    except Exception:
        pass

    # 3. Check torch/lib and other Python environments on the machine
    known_dll_dirs = [
        r"C:\Users\under\AppData\Local\Programs\Python\Python310\Lib\site-packages\torch\lib",
        r"C:\Users\under\AppData\Local\Programs\Python\Python312\Lib\site-packages\torch\lib",
        r"C:\Users\under\AppData\Local\Programs\Python\Python312\Lib\site-packages\nvidia\cudnn\bin",
        r"C:\Users\under\AppData\Local\Programs\Python\Python312\Lib\site-packages\nvidia\cublas\bin",
    ]
    for d in known_dll_dirs:
        p = Path(d)
        if p.exists() and str(p) not in added_paths:
            try:
                os.add_dll_directory(str(p))
                added_paths.append(str(p))
            except Exception:
                pass

    # 4. Prepend to PATH so CTranslate2 and C++ binaries find the DLLs
    if added_paths:
        os.environ["PATH"] = os.pathsep.join(added_paths) + os.pathsep + os.environ.get("PATH", "")
        logger.info("Registered %d NVIDIA CUDA/cuDNN DLL paths: %s", len(added_paths), added_paths)


setup_cuda_dlls()
