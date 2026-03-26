import torch
import comfy.samplers

class BigModelPipeIn:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                # still strings here because that's what selector nodes output
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS,),
                "scheduler_name": (comfy.samplers.KSampler.SCHEDULERS,),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
            }
        }

    RETURN_TYPES = ("PIPE_LINE",)
    RETURN_NAMES = ("pipe",)
    FUNCTION = "bundle_pipeline"
    CATEGORY = "Utilities/Pipeline"

    def bundle_pipeline(self, model, vae, clip, sampler_name, scheduler_name, steps):
        # Convert names to actual objects here
        #sampler_obj = comfy.samplers.KSampler.get_sampler(sampler_name)
        #scheduler_obj = comfy.samplers.KSampler.get_scheduler(scheduler_name)

        pipe = {
            "model": model,
            "clip": clip,
            "vae": vae,
            "sampler": sampler_name,       # now an actual object with .sample()
            "scheduler": scheduler_name,   # now an actual scheduler object
            "steps": steps,
        }
        return (pipe,)


class BigModelPipeOut:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "pipe": ("PIPE_LINE",),
            }
        }

    RETURN_TYPES = (
        "MODEL",
        "CLIP",
        "VAE",
        comfy.samplers.KSampler.SAMPLERS,
        comfy.samplers.KSampler.SCHEDULERS,
        "INT",
    )
    RETURN_NAMES = (
        "model",
        "clip",
        "vae",
        "sampler",
        "scheduler",
        "steps",
    )
    FUNCTION = "unbundle_pipeline"
    CATEGORY = "Utilities/Pipeline"

    def unbundle_pipeline(self, pipe):
        return (
            pipe["model"],
            pipe["clip"],
            pipe["vae"],
            pipe["sampler"],    # now a callable sampler object
            pipe["scheduler"],  # now the actual scheduler object
            pipe["steps"],
        )


NODE_CLASS_MAPPINGS = {
    "BigModelPipeIn": BigModelPipeIn,
    "BigModelPipeOut": BigModelPipeOut,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BigModelPipeIn": "BigModelPipeIn",
    "BigModelPipeOut": "BigModelPipeOut",
}
