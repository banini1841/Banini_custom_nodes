"""
AnySwitch — Switch node with unlimited dynamically-growing "any" inputs.

The JS companion (web/js/any_switch.js) adds new optional input slots
as needed. Python only declares input_1; extra inputs arrive via kwargs.
"""


class AnyType(str):
    """Type that compares equal to every other type."""
    def __eq__(self, other):
        return True
    def __ne__(self, other):
        return False
    def __hash__(self):
        return hash("*")


ANY = AnyType("*")


class AnySwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "select": ("INT", {"default": 1, "min": 1, "max": 99}),
            },
            "optional": {
                "input_1": (ANY,),
            },
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("output",)
    FUNCTION = "switch"
    CATEGORY = "utils"
    DESCRIPTION = (
        "Routes one of N inputs to the output based on the 'select' index. "
        "New input slots appear automatically when you connect the last one."
    )

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def switch(self, select=1, **kwargs):
        # Collect all connected inputs in order
        connected = []
        for i in range(1, 100):
            key = f"input_{i}"
            if key in kwargs and kwargs[key] is not None:
                connected.append((i, kwargs[key]))

        if not connected:
            raise RuntimeError("AnySwitch: No inputs connected.")

        # select is 1-based, clamp to range of connected inputs
        idx = max(0, min(select - 1, len(connected) - 1))
        return (connected[idx][1],)


NODE_CLASS_MAPPINGS = {
    "AnySwitch": AnySwitch,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AnySwitch": "Any Switch",
}
