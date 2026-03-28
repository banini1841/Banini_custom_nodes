"""
OutputFolderBrowser — Browse and select subfolders of ComfyUI's output directory.
Outputs the selected folder combined with an optional suffix path.
"""

import os
import folder_paths
import server
from aiohttp import web


def _scan_output_subfolders():
    """Return sorted list of all subfolders relative to the output dir."""
    output_dir = folder_paths.get_output_directory()
    folders = ["(root)"]
    for root, dirs, _files in os.walk(output_dir):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for d in sorted(dirs):
            full = os.path.join(root, d)
            rel = os.path.relpath(full, output_dir)
            folders.append(rel)
    return folders


@server.PromptServer.instance.routes.get("/banini/output_folders")
async def _get_output_folders(request):
    return web.json_response(_scan_output_subfolders())


class OutputFolderBrowser:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "folder": (_scan_output_subfolders(),),
                "suffix": ("STRING", {"default": "", "multiline": False}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("folder_path",)
    FUNCTION = "browse"
    CATEGORY = "utils"
    DESCRIPTION = (
        "Browse subfolders of the ComfyUI output directory. "
        "The suffix is appended to the selected folder path."
    )

    def browse(self, folder, suffix):
        output_dir = folder_paths.get_output_directory()
        if folder == "(root)":
            base = output_dir
        else:
            base = os.path.join(output_dir, folder)

        suffix = suffix.strip().strip("/").strip("\\")
        if suffix:
            return (base + os.sep + suffix,)
        return (base + os.sep,)


NODE_CLASS_MAPPINGS = {
    "OutputFolderBrowser": OutputFolderBrowser,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "OutputFolderBrowser": "Output Folder Browser",
}
