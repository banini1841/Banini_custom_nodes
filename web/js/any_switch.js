import { app } from "../../../scripts/app.js";

app.registerExtension({
	name: "BaniniNodes.AnySwitch",

	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "AnySwitch") return;

		function syncInputSlots(node) {
			// Find the highest connected input_N index
			let lastConnected = 0;
			for (const inp of node.inputs) {
				if (inp.name.startsWith("input_") && inp.link != null) {
					const idx = parseInt(inp.name.split("_")[1]);
					if (idx > lastConnected) lastConnected = idx;
				}
			}

			// We want exactly: input_1 .. input_(lastConnected+1)
			const target = lastConnected + 1;

			// Remove excess trailing unconnected input_N slots
			for (let i = node.inputs.length - 1; i >= 0; i--) {
				if (!node.inputs[i].name.startsWith("input_")) continue;
				const idx = parseInt(node.inputs[i].name.split("_")[1]);
				if (idx > target && node.inputs[i].link == null) {
					node.removeInput(i);
				}
			}

			// Add missing slots up to target
			const existing = new Set();
			for (const inp of node.inputs) {
				if (inp.name.startsWith("input_")) {
					existing.add(parseInt(inp.name.split("_")[1]));
				}
			}
			for (let i = 1; i <= target; i++) {
				if (!existing.has(i)) {
					node.addInput(`input_${i}`, "*");
				}
			}
		}

		const onCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			onCreated?.apply(this, arguments);

			// Only strip inputs on genuinely new nodes, not during load/undo
			if (app.configuringGraph) return;

			for (let i = this.inputs.length - 1; i >= 0; i--) {
				if (this.inputs[i].name.startsWith("input_") && this.inputs[i].name !== "input_1") {
					this.removeInput(i);
				}
			}
		};

		const onConnChange = nodeType.prototype.onConnectionsChange;
		nodeType.prototype.onConnectionsChange = function (side, slot, connected, linkInfo) {
			onConnChange?.apply(this, arguments);
			if (side !== LiteGraph.INPUT) return;
			if (app.configuringGraph) return;
			syncInputSlots(this);
		};

		// On load/undo/redo: let ComfyUI restore all links first, then clean up
		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function (info) {
			onConfigure?.apply(this, arguments);

			// After links are restored, sync slots
			requestAnimationFrame(() => {
				syncInputSlots(this);
			});
		};

		// On clone/paste: reset to just input_1
		const origClone = nodeType.prototype.clone;
		nodeType.prototype.clone = function () {
			const cloned = origClone
				? origClone.apply(this, arguments)
				: LiteGraph.LGraphNode.prototype.clone.call(this);

			for (let i = cloned.inputs.length - 1; i >= 0; i--) {
				if (cloned.inputs[i].name.startsWith("input_") && cloned.inputs[i].name !== "input_1") {
					cloned.removeInput(i);
				}
			}
			const has1 = cloned.inputs.some(inp => inp.name === "input_1");
			if (!has1) {
				cloned.addInput("input_1", "*");
			}
			for (const inp of cloned.inputs) {
				if (inp.name.startsWith("input_")) {
					inp.link = null;
				}
			}

			return cloned;
		};
	},
});
