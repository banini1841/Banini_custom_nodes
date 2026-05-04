import { app } from "../../../scripts/app.js";

app.registerExtension({
	name: "BaniniNodes.TensorDrain",

	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "TensorDrain") return;

		function syncDrainSlots(node) {
			// Find the highest connected drainN index
			let lastConnected = 0;
			for (const inp of node.inputs) {
				if (inp.name.startsWith("drain") && inp.link != null) {
					const idx = parseInt(inp.name.slice(5));
					if (idx > lastConnected) lastConnected = idx;
				}
			}

			const target = lastConnected + 1;

			// Remove excess trailing unconnected drainN slots
			for (let i = node.inputs.length - 1; i >= 0; i--) {
				if (!node.inputs[i].name.startsWith("drain")) continue;
				const idx = parseInt(node.inputs[i].name.slice(5));
				if (idx > target && node.inputs[i].link == null) {
					node.removeInput(i);
				}
			}

			// Add missing slots up to target
			const existing = new Set();
			for (const inp of node.inputs) {
				if (inp.name.startsWith("drain")) {
					existing.add(parseInt(inp.name.slice(5)));
				}
			}
			for (let i = 1; i <= target; i++) {
				if (!existing.has(i)) {
					node.addInput(`drain${i}`, "IMAGE");
				}
			}

			node.setSize(node.computeSize());
		}

		const onCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			onCreated?.apply(this, arguments);

			if (app.configuringGraph) return;

			for (let i = this.inputs.length - 1; i >= 0; i--) {
				if (this.inputs[i].name.startsWith("drain") && this.inputs[i].name !== "drain1") {
					this.removeInput(i);
				}
			}
			this.setSize(this.computeSize());
		};

		const onConnChange = nodeType.prototype.onConnectionsChange;
		nodeType.prototype.onConnectionsChange = function (side, slot, connected, linkInfo) {
			onConnChange?.apply(this, arguments);
			if (side !== LiteGraph.INPUT) return;
			if (app.configuringGraph) return;
			syncDrainSlots(this);
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function (info) {
			onConfigure?.apply(this, arguments);
			requestAnimationFrame(() => {
				syncDrainSlots(this);
			});
		};

		const origClone = nodeType.prototype.clone;
		nodeType.prototype.clone = function () {
			const cloned = origClone
				? origClone.apply(this, arguments)
				: LiteGraph.LGraphNode.prototype.clone.call(this);

			for (let i = cloned.inputs.length - 1; i >= 0; i--) {
				if (cloned.inputs[i].name.startsWith("drain") && cloned.inputs[i].name !== "drain1") {
					cloned.removeInput(i);
				}
			}
			const has1 = cloned.inputs.some(inp => inp.name === "drain1");
			if (!has1) {
				cloned.addInput("drain1", "IMAGE");
			}
			for (const inp of cloned.inputs) {
				if (inp.name.startsWith("drain")) {
					inp.link = null;
				}
			}
			cloned.setSize(cloned.computeSize());
			return cloned;
		};
	},
});
