import gc
import ctypes
import torch
import comfy.model_management

# ── Linux only: grab malloc_trim from glibc ──────────────────────────────────
try:
    _libc = ctypes.cdll.LoadLibrary("libc.so.6")
    _malloc_trim = _libc.malloc_trim
    _malloc_trim.restype = ctypes.c_int
    _malloc_trim.argtypes = [ctypes.c_size_t]
    _HAS_MALLOC_TRIM = True
except Exception:
    _HAS_MALLOC_TRIM = False


def _free_ram(aggressive: bool = False) -> str:
    """
    Best-effort CPU RAM release.

    Steps
    -----
    1. gc.collect() x3          – finalize cyclic garbage in Python
    2. ComfyUI soft cache clear – drop ComfyUI's internal tensor caches
    3. malloc_trim(0)            – tell glibc to give freed pages back to the OS
                                   (Linux only, no-op elsewhere)
    4. (aggressive) unload_all_models + gc again
    """
    report = []

    # 1. Python GC – run several passes to catch multi-generation cycles
    collected = 0
    for _ in range(3):
        collected += gc.collect()
    report.append(f"gc collected {collected} objects")

    # 2. ComfyUI internal caches
    #    soft_empty_cache() frees cached CPU tensors ComfyUI keeps between runs
    try:
        comfy.model_management.soft_empty_cache()
        report.append("comfy soft cache cleared")
    except Exception as e:
        report.append(f"comfy soft cache skipped ({e})")

    if aggressive:
        try:
            comfy.model_management.unload_all_models()
            report.append("comfy models unloaded")
        except Exception as e:
            report.append(f"comfy unload skipped ({e})")
        # Extra GC pass after model unload
        gc.collect()

    # 3. VRAM cache (keeps GPU side tidy too)
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        report.append("cuda cache cleared")

    # 4. malloc_trim – the critical step your original node was missing.
    #    gc.collect() marks Python objects as free, but glibc holds those
    #    pages in its own free-list.  malloc_trim(0) flushes them back to
    #    the OS so /proc/meminfo actually shows the freed memory.
    if _HAS_MALLOC_TRIM:
        result = _malloc_trim(0)
        report.append(f"malloc_trim(0) → {result}")
    else:
        report.append("malloc_trim not available (non-Linux?)")

    summary = " | ".join(report)
    print(f"[FreeCPUMemory] {summary}")
    return summary


# ─────────────────────────────────────────────────────────────────────────────
# Node: pass-through on IMAGE – drop in anywhere in your workflow
# ─────────────────────────────────────────────────────────────────────────────
class FreeCPUMemory:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            },
            "optional": {
                # Set to True to also unload all ComfyUI-cached models.
                # Useful between major pipeline stages (e.g. after frame gen,
                # before frame concatenation).  Slower because models must
                # reload on the next run.
                "aggressive": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "free"
    CATEGORY = "utils"
    # Mark as output node so ComfyUI won't prune it even with no downstream
    OUTPUT_NODE = False

    def free(self, image, aggressive=False):
        _free_ram(aggressive=aggressive)
        return (image,)


# ─────────────────────────────────────────────────────────────────────────────
# Node: standalone trigger – no tensor needed, just wire it with CTRL nodes
# or use the "always execute" trick via a primitive
# ─────────────────────────────────────────────────────────────────────────────
class FreeCPUMemoryTrigger:
    """
    Standalone version with no image pass-through.
    Connect it between two stages using a STRING or INT dummy wire,
    or just place it as a side-effect node.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "aggressive": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("report",)
    FUNCTION = "free"
    CATEGORY = "utils"
    OUTPUT_NODE = True  # Always executes even if output isn't consumed

    def free(self, aggressive=False):
        report = _free_ram(aggressive=aggressive)
        return (report,)


# ─────────────────────────────────────────────────────────────────────────────
NODE_CLASS_MAPPINGS = {
    "FreeCPUMemory": FreeCPUMemory,
    "FreeCPUMemoryTrigger": FreeCPUMemoryTrigger,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "FreeCPUMemory": "Free CPU Memory",
    "FreeCPUMemoryTrigger": "Free CPU Memory (Trigger)",
}
