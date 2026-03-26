import { app } from "../../../scripts/app.js";

app.registerExtension({
	name: "BaniniNodes.AnySwitch",

	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "AnySwitch") return;

		const onCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			onCreated?.apply(this, arguments);

			// Remove all input_N slots except input_1
			const toRemove = [];
			for (let i = this.inputs.length - 1; i >= 0; i--) {
				if (this.inputs[i].name.startsWith("input_") && this.inputs[i].name !== "input_1") {
					toRemove.push(i);
				}
			}
			for (const idx of toRemove) {
				this.removeInput(idx);
			}
		};

		const onConnChange = nodeType.prototype.onConnectionsChange;
		nodeType.prototype.onConnectionsChange = function (side, slot, connected, linkInfo) {
			onConnChange?.apply(this, arguments);

			if (side !== LiteGraph.INPUT) return;

			const inputSlots = this.inputs.filter(inp => inp.name.startsWith("input_"));
			const lastInput = inputSlots[inputSlots.length - 1];

			if (connected && lastInput && lastInput.link != null) {
				const nextIdx = inputSlots.length + 1;
				if (nextIdx <= 20) {
					this.addInput(`input_${nextIdx}`, "*");
				}
			}

			if (!connected) {
				let removed = true;
				while (removed) {
					removed = false;
					const allInputs = this.inputs;
					for (let i = allInputs.length - 1; i >= 0; i--) {
						if (allInputs[i].name.startsWith("input_")) {
							const count = allInputs.filter(inp => inp.name.startsWith("input_")).length;
							if (count > 1 && allInputs[i].link == null) {
								let prevEmpty = false;
								for (let j = i - 1; j >= 0; j--) {
									if (allInputs[j].name.startsWith("input_") && allInputs[j].link == null) {
										prevEmpty = true;
										break;
									}
								}
								if (prevEmpty) {
									this.removeInput(i);
									removed = true;
								}
							}
							break;
						}
					}
				}
			}
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function (info) {
			for (let i = this.inputs.length - 1; i >= 0; i--) {
				if (this.inputs[i].name.startsWith("input_")) {
					this.removeInput(i);
				}
			}

			const savedInputs = info.inputs || [];
			let maxIdx = 1;
			for (const inp of savedInputs) {
				if (inp.name.startsWith("input_")) {
					const idx = parseInt(inp.name.split("_")[1]);
					if (idx > maxIdx) maxIdx = idx;
				}
			}

			for (let i = 1; i <= maxIdx + 1; i++) {
				this.addInput(`input_${i}`, "*");
			}

			onConfigure?.apply(this, arguments);
		};
	},
});
