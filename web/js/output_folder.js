import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

app.registerExtension({
	name: "BaniniNodes.OutputFolderBrowser",

	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "OutputFolderBrowser") return;

		const onCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			onCreated?.apply(this, arguments);

			const folderWidget = this.widgets?.find(w => w.name === "folder");
			if (!folderWidget) return;

			// Fetch fresh folder list once on creation
			api.fetchApi("/banini/output_folders")
				.then(r => r.json())
				.then(folders => {
					folderWidget.options.values = folders;
					if (!folders.includes(folderWidget.value)) {
						folderWidget.value = folders[0] || "(root)";
					}
				})
				.catch(() => {});
		};

		// Right-click option to refresh folder list
		const origMenu = nodeType.prototype.getExtraMenuOptions;
		nodeType.prototype.getExtraMenuOptions = function (_, options) {
			origMenu?.apply(this, arguments);
			const node = this;
			options.unshift({
				content: "Refresh folder list",
				callback: () => {
					const folderWidget = node.widgets?.find(w => w.name === "folder");
					if (!folderWidget) return;
					api.fetchApi("/banini/output_folders")
						.then(r => r.json())
						.then(folders => {
							folderWidget.options.values = folders;
							if (!folders.includes(folderWidget.value)) {
								folderWidget.value = folders[0] || "(root)";
							}
							node.setDirtyCanvas(true, true);
						})
						.catch(() => {});
				},
			});
		};
	},
});
