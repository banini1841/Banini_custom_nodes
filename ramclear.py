import gc
import os
import ctypes
import datetime
import torch
import psutil
import comfy.model_management
import numpy as np
import sys
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
# Node: MemoryDiagnostic
# ─────────────────────────────────────────────────────────────────────────────
class MemoryDiagnostic:
    """
    Scans the entire Python object space and reports what's actually
    holding RAM. Groups by type and shows the biggest individual objects.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("STRING", "IMAGE",)
    RETURN_NAMES = ("report", "image",)
    FUNCTION = "diagnose"
    CATEGORY = "utils"
    OUTPUT_NODE = True

    def diagnose(self, image=None):
        gc.collect()

        proc = psutil.Process(os.getpid())
        mem = proc.memory_info()
        swap = psutil.swap_memory()

        lines = []
        lines.append("=" * 70)
        lines.append("MEMORY DIAGNOSTIC")
        lines.append(f"Process RSS: {mem.rss / 1e9:.1f} GB")
        lines.append(f"Process VMS: {mem.vms / 1e9:.1f} GB")
        lines.append(f"System RAM used: {psutil.virtual_memory().used / 1e9:.1f} / {psutil.virtual_memory().total / 1e9:.1f} GB")
        lines.append(f"System SWAP used: {swap.used / 1e9:.1f} / {swap.total / 1e9:.1f} GB")
        lines.append("=" * 70)

        # ── Scan all torch tensors on CPU ────────────────────────────────
        cpu_tensors = []
        gpu_tensors = []
        for obj in gc.get_objects():
            try:
                if isinstance(obj, torch.Tensor):
                    size_bytes = obj.element_size() * obj.nelement()
                    if obj.device.type == 'cpu':
                        cpu_tensors.append((size_bytes, list(obj.shape), obj.dtype, sys.getrefcount(obj)))
                    else:
                        gpu_tensors.append((size_bytes, list(obj.shape), obj.dtype, str(obj.device), sys.getrefcount(obj)))
            except Exception:
                pass

        # Sort by size descending
        cpu_tensors.sort(key=lambda x: -x[0])
        gpu_tensors.sort(key=lambda x: -x[0])

        total_cpu_tensor_bytes = sum(t[0] for t in cpu_tensors)
        lines.append(f"\n── CPU Tensors: {len(cpu_tensors)} objects, {total_cpu_tensor_bytes / 1e9:.1f} GB total ──")

        # Show top 20 biggest
        for i, (sz, shape, dtype, refcount) in enumerate(cpu_tensors[:20]):
            lines.append(f"  #{i+1}: {sz / 1e9:.2f} GB | shape={shape} | {dtype} | refcount={refcount}")

        # Summarize by shape pattern
        shape_groups = {}
        for sz, shape, dtype, refcount in cpu_tensors:
            key = (tuple(shape[1:]) if len(shape) > 1 else tuple(shape), str(dtype))
            if key not in shape_groups:
                shape_groups[key] = {"count": 0, "total_bytes": 0, "total_frames": 0}
            shape_groups[key]["count"] += 1
            shape_groups[key]["total_bytes"] += sz
            shape_groups[key]["total_frames"] += shape[0] if len(shape) > 0 else 1

        lines.append(f"\n── CPU Tensor groups by shape ──")
        for key, info in sorted(shape_groups.items(), key=lambda x: -x[1]["total_bytes"]):
            lines.append(f"  shape=*x{list(key[0])} {key[1]}: "
                         f"{info['count']} tensors, {info['total_frames']} total frames, "
                         f"{info['total_bytes'] / 1e9:.1f} GB")

        if gpu_tensors:
            total_gpu = sum(t[0] for t in gpu_tensors)
            lines.append(f"\n── GPU Tensors: {len(gpu_tensors)} objects, {total_gpu / 1e9:.1f} GB total ──")
            for i, (sz, shape, dtype, dev, refcount) in enumerate(gpu_tensors[:10]):
                lines.append(f"  #{i+1}: {sz / 1e9:.2f} GB | shape={shape} | {dtype} | {dev} | refcount={refcount}")

        # ── Scan numpy arrays ────────────────────────────────────────────
        np_arrays = []
        for obj in gc.get_objects():
            try:
                if isinstance(obj, np.ndarray):
                    sz = obj.nbytes
                    if sz > 1_000_000:  # Only arrays > 1 MB
                        np_arrays.append((sz, list(obj.shape), obj.dtype, sys.getrefcount(obj)))
            except Exception:
                pass

        np_arrays.sort(key=lambda x: -x[0])
        total_np = sum(a[0] for a in np_arrays)
        lines.append(f"\n── NumPy arrays (>1MB): {len(np_arrays)} objects, {total_np / 1e9:.1f} GB total ──")
        for i, (sz, shape, dtype, refcount) in enumerate(np_arrays[:10]):
            lines.append(f"  #{i+1}: {sz / 1e9:.2f} GB | shape={shape} | {dtype} | refcount={refcount}")

        # ── Large lists/dicts (potential frame accumulators) ─────────────
        large_lists = []
        for obj in gc.get_objects():
            try:
                if isinstance(obj, list) and len(obj) > 100:
                    # Check if it contains tensors or arrays
                    sample = obj[0] if len(obj) > 0 else None
                    if isinstance(sample, (torch.Tensor, np.ndarray)):
                        total_sz = sum(
                            (x.element_size() * x.nelement() if isinstance(x, torch.Tensor) else x.nbytes)
                            for x in obj if isinstance(x, (torch.Tensor, np.ndarray))
                        )
                        large_lists.append((total_sz, len(obj), type(sample).__name__, sys.getrefcount(obj)))
            except Exception:
                pass

        if large_lists:
            large_lists.sort(key=lambda x: -x[0])
            lines.append(f"\n── Large lists containing tensors/arrays ──")
            for i, (sz, length, elem_type, refcount) in enumerate(large_lists[:10]):
                lines.append(f"  #{i+1}: {sz / 1e9:.2f} GB | {length} elements of {elem_type} | refcount={refcount}")

        # ── Unaccounted memory ───────────────────────────────────────────
        accounted = total_cpu_tensor_bytes + total_np + sum(x[0] for x in large_lists)
        unaccounted = mem.rss - accounted
        lines.append(f"\n── Summary ──")
        lines.append(f"  CPU tensors:  {total_cpu_tensor_bytes / 1e9:.1f} GB")
        lines.append(f"  NumPy arrays: {total_np / 1e9:.1f} GB")
        lines.append(f"  Process RSS:  {mem.rss / 1e9:.1f} GB")
        lines.append(f"  Unaccounted:  {unaccounted / 1e9:.1f} GB (fragmentation / C libs / other)")
        lines.append("=" * 70)

        report = "\n".join(lines)
        print(report)

        if image is not None:
            return (report, image,)
        else:
            # Return a tiny dummy image if no input
            return (report, torch.zeros(1, 1, 1, 3),)


# ─────────────────────────────────────────────────────────────────────────────
NODE_CLASS_MAPPINGS = {
    "FreeCPUMemory": FreeCPUMemory,
    "FreeCPUMemoryTrigger": FreeCPUMemoryTrigger,
    "MemoryUsageLogger": MemoryUsageLogger,
    "EfficientImageBatchConcat": EfficientImageBatchConcat,
    "MemoryDiagnostic": MemoryDiagnostic,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "FreeCPUMemory": "Free CPU Memory",
    "FreeCPUMemoryTrigger": "Free CPU Memory (Trigger)",
    "MemoryUsageLogger": "Memory Usage Logger",
    "EfficientImageBatchConcat": "Efficient Image Batch Concat",
    "MemoryDiagnostic": "Memory Diagnostic",
}
