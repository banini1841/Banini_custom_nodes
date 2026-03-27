import { app } from "../../../scripts/app.js";

app.registerExtension({
	name: "BaniniNodes.OutputFolderBrowser",

	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "OutputFolderBrowser") return;

		const onCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			onCreated?.apply(this, arguments);

			const folderWidget = this.widgets?.find(w => w.name === "folder");
			if (!folderWidget) return;

			// Refresh folder list from server every time the dropdown values are read
			const origOptions = folderWidget.options;
			Object.defineProperty(folderWidget.options, "values", {
				get: () => {
					// Trigger async refresh (updates on next open)
					fetch("/banini/output_folders")
						.then(r => r.json())
						.then(folders => {
							folderWidget._cachedFolders = folders;
						})
						.catch(() => {});
					return folderWidget._cachedFolders || origOptions.values || ["(root)"];
				},
				set: (v) => {
					folderWidget._cachedFolders = v;
				},
				enumerable: true,
				configurable: true,
			});

			// Initial fetch
			fetch("/banini/output_folders")
				.then(r => r.json())
				.then(folders => {
					folderWidget._cachedFolders = folders;
				})
				.catch(() => {});
		};
	},
});
