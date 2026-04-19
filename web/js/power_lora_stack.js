import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

let LORA_LIST = ["None"];

async function fetchLoraList() {
    try {
        const resp = await api.fetchApi("/object_info/LoraLoader");
        const data = await resp.json();
        LORA_LIST = ["None", ...data.LoraLoader.input.required.lora_name[0]];
    } catch (e) {
        console.warn("PowerLoraStack: could not fetch lora list", e);
    }
}
fetchLoraList();

function shortName(path) {
    if (!path || path === "None") return "— select lora —";
    return path.split(/[/\\]/).pop().replace(/\.[^.]+$/, "");
}

function clampStrength(v) {
    return Math.round(Math.max(-10, Math.min(10, v)) * 100) / 100;
}

function buildRow(row, onChange, onRemove) {
    const rowEl = document.createElement("div");
    rowEl.style.cssText = "display:flex;align-items:center;gap:4px;height:24px;box-sizing:border-box;";

    const toggle = document.createElement("button");
    toggle.textContent = row.enabled ? "ON" : "OFF";
    toggle.style.cssText = `flex:0 0 44px;height:22px;border:none;border-radius:4px;color:#fff;font:bold 10px Arial;cursor:pointer;padding:0;background:${row.enabled ? "#3a7d44" : "#4a4a4a"};`;
    toggle.onclick = (e) => {
        e.stopPropagation();
        row.enabled = !row.enabled;
        toggle.textContent = row.enabled ? "ON" : "OFF";
        toggle.style.background = row.enabled ? "#3a7d44" : "#4a4a4a";
        onChange();
    };
    rowEl.appendChild(toggle);

    const nameBtn = document.createElement("button");
    nameBtn.textContent = shortName(row.name);
    nameBtn.style.cssText = `flex:1 1 auto;min-width:60px;height:22px;background:#222;color:${row.name && row.name !== "None" ? "#ddd" : "#666"};border:1px solid #555;border-radius:4px;font:11px Arial;text-align:left;padding:0 6px;cursor:pointer;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;`;
    nameBtn.onclick = (e) => {
        e.stopPropagation();
        new LiteGraph.ContextMenu(
            LORA_LIST.map(v => ({
                content: v,
                callback: () => {
                    row.name = v;
                    nameBtn.textContent = shortName(row.name);
                    nameBtn.style.color = row.name && row.name !== "None" ? "#ddd" : "#666";
                    onChange();
                }
            })),
            { event: e, className: "dark", scroll_speed: 0.1 }
        );
    };
    rowEl.appendChild(nameBtn);

    const strBox = document.createElement("div");
    strBox.style.cssText = "display:flex;flex:0 0 82px;height:22px;background:#222;border:1px solid #555;border-radius:4px;overflow:hidden;box-sizing:border-box;";

    const left = document.createElement("button");
    left.textContent = "<";
    left.style.cssText = "width:16px;background:transparent;border:none;color:#aaa;font:11px Arial;cursor:pointer;padding:0;";
    left.onclick = (e) => {
        e.stopPropagation();
        row.strength = clampStrength(row.strength - 0.05);
        val.textContent = row.strength.toFixed(2);
        onChange();
    };

    const val = document.createElement("span");
    val.textContent = row.strength.toFixed(2);
    val.style.cssText = "flex:1;text-align:center;color:#ddd;font:11px Arial;line-height:22px;cursor:ew-resize;user-select:none;touch-action:none;";

    let dragStartX = 0, dragStartStrength = 0, hasDragged = false, dragPointerId = -1;
    val.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        dragStartX = e.clientX;
        dragStartStrength = row.strength;
        hasDragged = false;
        dragPointerId = e.pointerId;
        val.setPointerCapture(e.pointerId);
    });
    val.addEventListener("pointermove", (e) => {
        if (e.pointerId !== dragPointerId) return;
        const dx = e.clientX - dragStartX;
        if (Math.abs(dx) > 2) hasDragged = true;
        if (hasDragged) {
            row.strength = clampStrength(dragStartStrength + dx * 0.05);
            val.textContent = row.strength.toFixed(2);
        }
    });
    val.addEventListener("pointerup", (e) => {
        if (e.pointerId !== dragPointerId) return;
        try { val.releasePointerCapture(dragPointerId); } catch {}
        const wasDragged = hasDragged;
        dragPointerId = -1;
        if (wasDragged) {
            onChange();
        } else {
            app.canvas.prompt("Strength", row.strength, (v) => {
                const n = parseFloat(v);
                if (!isNaN(n)) {
                    row.strength = clampStrength(n);
                    val.textContent = row.strength.toFixed(2);
                    onChange();
                }
            }, e);
        }
    });

    const right = document.createElement("button");
    right.textContent = ">";
    right.style.cssText = "width:16px;background:transparent;border:none;color:#aaa;font:11px Arial;cursor:pointer;padding:0;";
    right.onclick = (e) => {
        e.stopPropagation();
        row.strength = clampStrength(row.strength + 0.05);
        val.textContent = row.strength.toFixed(2);
        onChange();
    };

    strBox.appendChild(left);
    strBox.appendChild(val);
    strBox.appendChild(right);
    rowEl.appendChild(strBox);

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.style.cssText = "flex:0 0 22px;height:22px;background:#6a1e1e;color:#fff;border:none;border-radius:4px;font:bold 14px Arial;cursor:pointer;padding:0;";
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        onRemove();
    };
    rowEl.appendChild(removeBtn);

    return rowEl;
}

function buildWidget(node, savedValue) {
    let rows;
    try { rows = JSON.parse(savedValue); } catch { rows = []; }
    if (!rows.length) rows = [{ enabled: true, name: "None", strength: 1.0 }];

    const container = document.createElement("div");
    container.style.cssText = "display:flex;flex-direction:column;gap:2px;padding:4px;box-sizing:border-box;width:100%;";

    const rowsEl = document.createElement("div");
    rowsEl.style.cssText = "display:flex;flex-direction:column;gap:2px;";
    container.appendChild(rowsEl);

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add Lora";
    addBtn.style.cssText = "width:100%;height:24px;background:#1a3a1a;color:#999;border:none;border-radius:4px;font:12px Arial;cursor:pointer;margin-top:4px;padding:0;";
    container.appendChild(addBtn);

    const onChange = () => {
        node.setDirtyCanvas?.(true, true);
    };

    const render = () => {
        rowsEl.replaceChildren(...rows.map((row, i) => buildRow(row, onChange, () => {
            rows.splice(i, 1);
            if (!rows.length) rows.push({ enabled: true, name: "None", strength: 1.0 });
            render();
            node.setSize([node.size[0], node.computeSize()[1]]);
            onChange();
        })));
    };

    addBtn.onclick = (e) => {
        e.stopPropagation();
        rows.push({ enabled: true, name: "None", strength: 1.0 });
        render();
        node.setSize([node.size[0], node.computeSize()[1]]);
        onChange();
    };

    render();

    const widget = node.addDOMWidget("loras", "power_lora_stack", container, {
        serialize: true,
        hideOnZoom: false,
        getValue: () => JSON.stringify(rows),
        setValue: (v) => {
            try { rows = typeof v === "string" ? JSON.parse(v) : v; } catch { rows = []; }
            if (!rows?.length) rows = [{ enabled: true, name: "None", strength: 1.0 }];
            render();
        },
    });

    return widget;
}

app.registerExtension({
    name: "PowerLoraStack",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "PowerLoraStack") return;

        fetchLoraList();

        const _onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            _onCreated?.apply(this, arguments);

            const idx = this.widgets?.findIndex(w => w.name === "loras") ?? -1;
            const saved = idx >= 0 ? this.widgets[idx].value : "[]";
            if (idx >= 0) this.widgets.splice(idx, 1);

            buildWidget(this, saved);

            this.setSize([Math.max(this.size[0], 360), this.computeSize()[1]]);
        };
    }
});
