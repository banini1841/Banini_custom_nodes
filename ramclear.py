import gc
import os
import ctypes
import datetime
import torch
import psutil
import comfy.model_management
from comfy.utils import common_upscale
from .anyswitch import ANY

# ── Linux only: grab malloc_trim from glibc ──────────────────────────────────
try:
    _libc = ctypes.cdll.LoadLibrary("libc.so.6")
    _malloc_trim = _libc.malloc_trim
    _malloc_trim.restype = ctypes.c_int
    _malloc_trim.argtypes = [ctypes.c_size_t]
    _HAS_MALLOC_TRIM = True
except Exception:
    _HAS_MALLOC_TRIM = False


def _malloc_trim_call():
    if _HAS_MALLOC_TRIM:
        _malloc_trim(0)


def _free_ram() -> str:
    report = []

    # 1. Python GC
    collected = 0
    for _ in range(3):
        collected += gc.collect()
    report.append(f"gc: {collected} objects")

    # 2. ComfyUI CPU tensor caches
    try:
        comfy.model_management.soft_empty_cache()
        report.append("comfy cache cleared")
    except Exception as e:
        report.append(f"comfy cache skipped ({e})")

    # 3. malloc_trim — return glibc free-list pages to the OS
    if _HAS_MALLOC_TRIM:
        result = _malloc_trim(0)
        report.append(f"malloc_trim → {result}")
    else:
        report.append("malloc_trim unavailable")

    summary = " | ".join(report)
    print(f"[FreeCPUMemory] {summary}")
    return summary


# ─────────────────────────────────────────────────────────────────────────────
# Node: pass-through on IMAGE
# ─────────────────────────────────────────────────────────────────────────────
class FreeCPUMemory:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "free"
    CATEGORY = "utils"
    OUTPUT_NODE = False

    def free(self, image):
        _free_ram()
        return (image,)


# ─────────────────────────────────────────────────────────────────────────────
# Node: standalone trigger (no image needed)
# ─────────────────────────────────────────────────────────────────────────────
class FreeCPUMemoryTrigger:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {}
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("report",)
    FUNCTION = "free"
    CATEGORY = "utils"
    OUTPUT_NODE = True

    def free(self):
        report = _free_ram()
        return (report,)


# ─────────────────────────────────────────────────────────────────────────────
# Node: any-type passthrough that appends RAM/swap usage to a log file
# ─────────────────────────────────────────────────────────────────────────────
class MemoryUsageLogger:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (ANY,),
                "log_path": ("STRING", {"default": "memlog.txt"}),
            },
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "log"
    CATEGORY = "utils"
    OUTPUT_NODE = False

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def log(self, value, log_path="memlog.txt"):
        try:
            vm = psutil.virtual_memory()
            sw = psutil.swap_memory()
            ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ram_used = vm.used / 1e9
            ram_total = vm.total / 1e9
            sw_used = sw.used / 1e9
            sw_total = sw.total / 1e9
            line = (
                f"{ts} | RAM {ram_used:.1f}/{ram_total:.1f} GB ({vm.percent:.1f}%) | "
                f"SWAP {sw_used:.1f}/{sw_total:.1f} GB ({sw.percent:.1f}%)\n"
            )
            parent = os.path.dirname(log_path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(line)
            print(f"[MemoryUsageLogger] {line.rstrip()}")
        except Exception as e:
            print(f"[MemoryUsageLogger] warning: could not write log: {e}")
        return (value,)


# ─────────────────────────────────────────────────────────────────────────────
# Node: memory-efficient image batch concatenation
# ─────────────────────────────────────────────────────────────────────────────
class EfficientImageBatchConcat:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "image1": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "doit"
    CATEGORY = "utils"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def doit(self, **kwargs):
        images = [v for v in kwargs.values() if v is not None]

        if len(images) == 0:
            raise ValueError("EfficientImageBatchConcat: no images provided")

        if len(images) == 1:
            return (images[0],)

        # Use first image's spatial dims as reference
        ref = images[0]
        ref_h, ref_w = ref.shape[1], ref.shape[2]

        # Resize any mismatched images and count total frames
        total_frames = 0
        processed = []
        for img in images:
            if img.shape[1] != ref_h or img.shape[2] != ref_w:
                img = common_upscale(
                    img.movedim(-1, 1), ref_w, ref_h, "lanczos", "center"
                ).movedim(1, -1)
            processed.append(img)
            total_frames += img.shape[0]

        # Pre-allocate final tensor — ONE allocation, no intermediates
        out = torch.empty(
            (total_frames, ref_h, ref_w, ref.shape[3]),
            dtype=ref.dtype,
            device="cpu"
        )

        # Copy each batch into its slice
        offset = 0
        for img in processed:
            n = img.shape[0]
            out[offset:offset + n] = img
            offset += n
            _malloc_trim_call()

        print(f"[EfficientImageBatchConcat] {len(processed)} batches → "
              f"{total_frames} frames, {out.element_size() * out.nelement() / 1e9:.1f} GB")

        return (out,)


# ─────────────────────────────────────────────────────────────────────────────
NODE_CLASS_MAPPINGS = {
    "FreeCPUMemory": FreeCPUMemory,
    "FreeCPUMemoryTrigger": FreeCPUMemoryTrigger,
    "MemoryUsageLogger": MemoryUsageLogger,
    "EfficientImageBatchConcat": EfficientImageBatchConcat,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "FreeCPUMemory": "Free CPU Memory",
    "FreeCPUMemoryTrigger": "Free CPU Memory (Trigger)",
    "MemoryUsageLogger": "Memory Usage Logger",
    "EfficientImageBatchConcat": "Efficient Image Batch Concat",
}
