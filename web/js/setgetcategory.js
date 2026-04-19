import { app } from "../../../scripts/app.js";

// Set/Get nodes with category filtering
// Based on KJNodes Set/Get by kijai (originally by diffus3)

let _typeColorMap;
function setColorAndBgColor(node, type) {
	if (!_typeColorMap) {
		_typeColorMap = {
			"DEFAULT": LGraphCanvas.node_colors.gray,
			"MODEL": LGraphCanvas.node_colors.blue,
			"LATENT": LGraphCanvas.node_colors.purple,
			"VAE": LGraphCanvas.node_colors.red,
			"CONDITIONING": LGraphCanvas.node_colors.brown,
			"IMAGE": LGraphCanvas.node_colors.pale_blue,
			"CLIP": LGraphCanvas.node_colors.yellow,
			"FLOAT": LGraphCanvas.node_colors.green,
			"MASK": { color: "#1c5715", bgcolor: "#1f401b" },
			"INT": { color: "#1b4669", bgcolor: "#29699c" },
			"CONTROL_NET": { color: "#156653", bgcolor: "#1c453b" },
			"NOISE": { color: "#2e2e2e", bgcolor: "#242121" },
			"GUIDER": { color: "#3c7878", bgcolor: "#1c453b" },
			"SAMPLER": { color: "#614a4a", bgcolor: "#3b2c2c" },
			"SIGMAS": { color: "#485248", bgcolor: "#272e27" },
		};
	}
	const colors = _typeColorMap[type] || LGraphCanvas.node_colors?.gray;
	if (colors) {
		node.color = colors.color;
		node.bgcolor = colors.bgcolor;
	}
}

function getLink(graph, linkId) {
	if (linkId == null) return null;
	if (graph.getLink) return graph.getLink(linkId);
	return graph._links instanceof Map ? graph._links.get(linkId) : graph._links?.[linkId] ?? null;
}

// Build { category: Set([name, ...]) } from all SetNodeCategory nodes
function buildRegistry(graph) {
	const reg = {};
	if (!graph?._nodes) return reg;
	for (const n of graph._nodes) {
		if (n.type !== "SetNodeCategory") continue;
		const cat = (n.widgets?.[0]?.value || "default").trim() || "default";
		const name = (n.widgets?.[1]?.value || "value").trim() || "value";
		if (!reg[cat]) reg[cat] = new Set();
		reg[cat].add(name);
	}
	const out = {};
	for (const [cat, names] of Object.entries(reg)) {
		out[cat] = [...names].sort();
	}
	return out;
}

function findSetterByCategoryAndName(graph, category, name) {
	if (!graph?._nodes || !category || !name) return null;
	for (const n of graph._nodes) {
		if (n.type !== "SetNodeCategory") continue;
		const sCat = (n.widgets?.[0]?.value || "default").trim() || "default";
		const sName = (n.widgets?.[1]?.value || "value").trim() || "value";
		if (sCat === category && sName === name) return n;
	}
	return null;
}

const LGraphNode = LiteGraph.LGraphNode;


// ====================== SetNodeCategory ==========================

app.registerExtension({
	name: "SetGetCategory.SetNode",
	registerCustomNodes() {
		class SetNodeCategory extends LGraphNode {
			static title = "Set (Category)";
			static category = "utils/SetGetCategory";
			serialize_widgets = true;

			constructor(title) {
				super(title);
				if (!this.properties) {
					this.properties = {};
				}
				this.properties["Node name for S&R"] = "SetNodeCategory";
				this.properties["aux_id"] = "SetNodeCategory";
				this.isVirtualNode = true;

				// Widget 0: category
				this.addWidget("text", "category", "default", () => {
					if (!this.graph || app.configuringGraph) return;
					this._updateTitle();
					this._notifyGetNodes();
				}, {});

				// Widget 1: name
				this.addWidget("text", "name", "value", () => {
					if (!this.graph || app.configuringGraph) return;
					this._updateTitle();
					this._notifyGetNodes();
				}, {});

				this.addInput("*", "*");
				this.addOutput("*", "*");

				this._updateTitle();
			}

			_updateTitle() {
				const cat = this.widgets?.[0]?.value || "default";
				const name = this.widgets?.[1]?.value || "value";
				this.title = "Set: " + cat + " / " + name;
			}

			_notifyGetNodes() {
				if (!this.graph?._nodes) return;
				for (const n of this.graph._nodes) {
					if (n.type === "GetNodeCategory" && n._refresh) {
						n._refresh();
					}
				}
			}

			onConnectionsChange(slotType, slot, isChangeConnect, link_info) {
				if (app.configuringGraph) return;

				// Disconnection on input
				if (slotType === LiteGraph.INPUT && !isChangeConnect) {
					if (this.inputs[0].link == null) {
						this.inputs[0].type = "*";
						this.inputs[0].name = "*";
						this.outputs[0].type = "*";
						this.outputs[0].name = "*";
						this.color = null;
						this.bgcolor = null;
					}
					this._notifyGetNodes();
				}

				// Connection on input
				if (link_info && this.graph && slotType === LiteGraph.INPUT && isChangeConnect) {
					const resolve = link_info.resolve(this.graph);
					const resolvedSlot = resolve?.subgraphInput ?? resolve?.output;
					const type = resolvedSlot?.type;
					if (type) {
						this.inputs[0].type = type;
						this.inputs[0].name = type;
						this.outputs[0].type = type;
						this.outputs[0].name = type;
						setColorAndBgColor(this, type);
					}
					this._notifyGetNodes();
				}

				// Connection on output
				if (link_info && this.graph && slotType === LiteGraph.OUTPUT && isChangeConnect) {
					const inputType = this.inputs[0]?.type;
					if (inputType && inputType !== "*") {
						this.outputs[0].type = inputType;
						this.outputs[0].name = inputType;
					}
				}
			}

			onAdded() {
				this._updateTitle();
			}

			onRemoved() {
				this._notifyGetNodes();
			}

			clone() {
				const cloned = super.clone();
				cloned.inputs[0].type = "*";
				cloned.inputs[0].name = "*";
				cloned.outputs[0].type = "*";
				cloned.outputs[0].name = "*";
				cloned.color = null;
				cloned.bgcolor = null;
				cloned.size = cloned.computeSize();
				return cloned;
			}
		}

		LiteGraph.registerNodeType("SetNodeCategory", SetNodeCategory);
	},
});


// ====================== GetNodeCategory ==========================

app.registerExtension({
	name: "SetGetCategory.GetNode",
	registerCustomNodes() {
		class GetNodeCategory extends LGraphNode {
			static title = "Get (Category)";
			static category = "utils/SetGetCategory";
			serialize_widgets = true;

			constructor(title) {
				super(title);
				if (!this.properties) {
					this.properties = {};
				}
				this.properties["Node name for S&R"] = "GetNodeCategory";
				this.properties["aux_id"] = "GetNodeCategory";
				this.isVirtualNode = true;

				// Widget 0: category (combo with dynamic values)
				const catOptions = {};
				Object.defineProperty(catOptions, "values", {
					get: () => {
						const reg = buildRegistry(this.graph);
						const cats = Object.keys(reg).sort();
						return cats.length ? cats : ["default"];
					},
					enumerable: true,
					configurable: true,
				});
				this.addWidget("combo", "category", "default", () => {
					if (!app.configuringGraph) {
						this._refreshNameOptions();
						this._syncType();
					}
				}, catOptions);

				// Widget 1: name (combo, filtered by selected category)
				const nameOptions = {};
				Object.defineProperty(nameOptions, "values", {
					get: () => {
						const reg = buildRegistry(this.graph);
						const cat = (this.widgets?.[0]?.value || "default").trim() || "default";
						const names = reg[cat] || [];
						return names.length ? names : ["value"];
					},
					enumerable: true,
					configurable: true,
				});
				this.addWidget("combo", "name", "value", () => {
					if (!app.configuringGraph) this._syncType();
				}, nameOptions);

				this.addOutput("*", "*");
				this._updateTitle();
			}

			_refresh() {
				this._refreshNameOptions();
				this._syncType();
			}

			_refreshNameOptions() {
				const reg = buildRegistry(this.graph);
				const cat = (this.widgets?.[0]?.value || "default").trim() || "default";
				const names = reg[cat] || [];
				if (names.length && !names.includes(this.widgets[1].value)) {
					this.widgets[1].value = names[0];
				}
				this._updateTitle();
			}

			_syncType() {
				const setter = this._findSetter();
				if (setter?.inputs?.[0]) {
					const type = setter.inputs[0].type || "*";
					this.outputs[0].type = type;
					this.outputs[0].name = type;
					if (type !== "*") {
						setColorAndBgColor(this, type);
					} else {
						this.color = null;
						this.bgcolor = null;
					}
				} else {
					this.outputs[0].type = "*";
					this.outputs[0].name = "*";
					this.color = null;
					this.bgcolor = null;
				}
				this._updateTitle();
				app.canvas?.setDirty(true, true);
			}

			_updateTitle() {
				const cat = this.widgets?.[0]?.value || "default";
				const name = this.widgets?.[1]?.value || "value";
				this.title = "Get: " + cat + " / " + name;
			}

			_findSetter() {
				const cat = (this.widgets?.[0]?.value || "default").trim() || "default";
				const name = (this.widgets?.[1]?.value || "value").trim() || "value";
				return findSetterByCategoryAndName(this.graph, cat, name);
			}

			// ComfyUI calls this to resolve virtual node connections
			getInputLink(slot) {
				const setter = this._findSetter();
				if (!setter) return null;
				const slotInfo = setter.inputs[slot];
				if (!slotInfo || slotInfo.link == null) return null;
				return getLink(this.graph, slotInfo.link);
			}

			onConnectionsChange() {
				if (app.configuringGraph) return;
				this._syncType();
			}

			onAdded() {
				this._refresh();
			}

			clone() {
				const cloned = super.clone();
				cloned.outputs[0].type = "*";
				cloned.outputs[0].name = "*";
				cloned.color = null;
				cloned.bgcolor = null;
				cloned.size = cloned.computeSize();
				return cloned;
			}
		}

		LiteGraph.registerNodeType("GetNodeCategory", GetNodeCategory);
	},
});


// ====================== Periodic refresh =========================

app.registerExtension({
	name: "SetGetCategory.Refresh",
	setup() {
		let lastFP = "";
		setInterval(() => {
			const g = app.graph;
			if (!g?._nodes || app.configuringGraph) return;

			let fp = "";
			for (const n of g._nodes) {
				if (n.type === "SetNodeCategory") {
					fp += (n.widgets?.[0]?.value || "") + "|" + (n.widgets?.[1]?.value || "") + "|" + (n.inputs?.[0]?.type || "*") + ";";
				}
			}
			if (fp === lastFP) return;
			lastFP = fp;

			for (const n of g._nodes) {
				if (n.type === "GetNodeCategory" && n._refresh) {
					n._refresh();
				}
			}
		}, 2000);
	},
});
