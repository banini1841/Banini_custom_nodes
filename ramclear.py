import gc
import ctypes
import subprocess
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


def _clear_swap() -> str:
    try:
        r1 = subprocess.run(
            ["sudo", "swapoff", "-a"],
            capture_output=True, text=True, timeout=120
        )
        if r1.returncode != 0:
            return f"swapoff failed (rc={r1.returncode}): {r1.stderr.strip()} — did you add the sudoers rule?"

        r2 = subprocess.run(
            ["sudo", "swapon", "-a"],
            capture_output=True, text=True, timeout=30
        )
        if r2.returncode != 0:
            return f"swapoff OK but swapon failed (rc={r2.returncode}): {r2.stderr.strip()}"

        return "swap cleared (swapoff -a && swapon -a)"

    except subprocess.TimeoutExpired:
        return "swap clear timed out — system may be under heavy memory pressure"
    except FileNotFoundError:
        return "sudo not found"
    except Exception as e:
        return f"swap clear error: {e}"


def _free_ram(clear_swap: bool = False) -> str:
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

    # 3. malloc_trim — return glibc free-list pages to the OS.
    #    Must run BEFORE clear_swap so RAM is maximally free
    #    before swapoff tries to move swap pages back into it.
    if _HAS_MALLOC_TRIM:
        result = _malloc_trim(0)
        report.append(f"malloc_trim → {result}")
    else:
        report.append("malloc_trim unavailable")

    # 4. Swap clear — swapoff moves all swap pages back into RAM (now free),
    #    then swapon re-enables swap clean and empty.
    #    Requires: sudo visudo -f /etc/sudoers.d/comfyui-swap
    #    Line: yourusername ALL=(ALL) NOPASSWD: /sbin/swapoff -a, /sbin/swapon -a
    if clear_swap:
        report.append(_clear_swap())

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
            "optional": {
                "clear_swap": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "free"
    CATEGORY = "utils"
    OUTPUT_NODE = False

    def free(self, image, clear_swap=False):
        _free_ram(clear_swap=clear_swap)
        return (image,)


# ─────────────────────────────────────────────────────────────────────────────
# Node: standalone trigger (no image needed)
# ─────────────────────────────────────────────────────────────────────────────
class FreeCPUMemoryTrigger:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "clear_swap": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("report",)
    FUNCTION = "free"
    CATEGORY = "utils"
    OUTPUT_NODE = True

    def free(self, clear_swap=False):
        report = _free_ram(clear_swap=clear_swap)
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
