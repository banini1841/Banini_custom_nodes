import folder_paths
import json
import comfy.utils
import comfy.sd

class ApplyLoraStack:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"model": ("MODEL",),
                            "clip": ("CLIP", ),
                            "lora_stack": ("LORA_STACK", ),
                            }
        }
    RETURN_TYPES = ("MODEL", "CLIP",)
    RETURN_NAMES = ("MODEL", "CLIP",)
    FUNCTION = "apply_lora_stack"
    CATEGORY = "loaders"

    def apply_lora_stack(self, model, clip, lora_stack=None):
        if not lora_stack:
            return (model, clip,)
        model_lora = model
        clip_lora = clip
        for tup in lora_stack:
            lora_name, strength_model, strength_clip = tup
            lora_path = folder_paths.get_full_path("loras", lora_name)
            lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
            model_lora, clip_lora = comfy.sd.load_lora_for_models(model_lora, clip_lora, lora, strength_model, strength_clip)
        return (model_lora, clip_lora,)


class PowerLoraStack:
    CATEGORY = "loaders"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "loras": ("STRING", {"default": "[]"}),
            },
            "optional": {
                "optional_lora_stack": ("LORA_STACK",),
            }
        }

    RETURN_TYPES = ("LORA_STACK",)
    RETURN_NAMES = ("lora_stack",)
    FUNCTION = "stack"

    def stack(self, loras, optional_lora_stack=None):
        result = []
        if optional_lora_stack is not None:
            result.extend([l for l in optional_lora_stack if l[0] != "None"])
        try:
            lora_list = json.loads(loras)
        except Exception:
            return (result,)
        for item in lora_list:
            if not item.get("enabled", True):
                continue
            name = item.get("name", "")
            if not name or name == "None":
                continue
            strength = float(item.get("strength", 1.0))
            result.append((name, strength, strength))
        return (result,)


NODE_CLASS_MAPPINGS = {
    "PowerLoraStack": PowerLoraStack,
    "ApplyLoraStack": ApplyLoraStack,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "PowerLoraStack": "Power LoRa Stack",
    "ApplyLoraStack": "Apply LoRa Stack",
}

