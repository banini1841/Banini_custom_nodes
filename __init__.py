"""
Banini Nodes — Custom node pack for ComfyUI
============================================
Combines:
  - BigModelPipe      (pipeline bundling/unbundling)
  - RamClear          (CPU/GPU memory freeing)
  - PowerLoraStack    (interactive LoRA stacking widget)
  - SetGetCategory    (virtual Set/Get with category filtering, JS-only)
  - AnySwitch         (switch with unlimited dynamic any-type inputs)
  - OutputFolderBrowser (browse and select output subfolders)
"""

from .bigmodelpipe import NODE_CLASS_MAPPINGS as _bmp_nodes, NODE_DISPLAY_NAME_MAPPINGS as _bmp_names
from .ramclear import NODE_CLASS_MAPPINGS as _rc_nodes, NODE_DISPLAY_NAME_MAPPINGS as _rc_names
from .powerlorastack import NODE_CLASS_MAPPINGS as _pls_nodes, NODE_DISPLAY_NAME_MAPPINGS as _pls_names
from .anyswitch import NODE_CLASS_MAPPINGS as _sw_nodes, NODE_DISPLAY_NAME_MAPPINGS as _sw_names
from .outputfolder import NODE_CLASS_MAPPINGS as _of_nodes, NODE_DISPLAY_NAME_MAPPINGS as _of_names

NODE_CLASS_MAPPINGS = {}
NODE_CLASS_MAPPINGS.update(_bmp_nodes)
NODE_CLASS_MAPPINGS.update(_rc_nodes)
NODE_CLASS_MAPPINGS.update(_pls_nodes)
NODE_CLASS_MAPPINGS.update(_sw_nodes)
NODE_CLASS_MAPPINGS.update(_of_nodes)

NODE_DISPLAY_NAME_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS.update(_bmp_names)
NODE_DISPLAY_NAME_MAPPINGS.update(_rc_names)
NODE_DISPLAY_NAME_MAPPINGS.update(_pls_names)
NODE_DISPLAY_NAME_MAPPINGS.update(_sw_names)
NODE_DISPLAY_NAME_MAPPINGS.update(_of_names)

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
