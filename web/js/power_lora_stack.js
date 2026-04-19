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

const ROW_H    = 28;
const ADD_H    = 24;
const GAP      =  4;
const MARGIN   = 10;
const TOGGLE_W = 44;
const ARROW_W  = 16;
const VAL_W    = 50;
const STR_W    = ARROW_W + VAL_W + ARROW_W;
const REM_W    = 22;

function nameW(totalW) {
    return totalW - MARGIN * 2 - TOGGLE_W - STR_W - REM_W - GAP * 3;
}

function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function shortName(path) {
    if (!path || path === "None") return "— select lora —";
    return path.split(/[/\\]/).pop().replace(/\.[^.]+$/, "");
}

function buildWidget(node, savedValue) {
    let rows;
    try { rows = JSON.parse(savedValue); } catch { rows = []; }
    if (!rows.length) rows = [{ enabled: true, name: "None", strength: 1.0 }];

    const w = {
        name: "loras",
        type: "custom",
        _rows: rows,
        _y: 0,
        _draggingRow: -1,
        _dragStartX: 0,
        _dragStartStrength: 0,
        _hasDragged: false,

        get value()  { return JSON.stringify(this._rows); },
        set value(v) {
            try { this._rows = typeof v === "string" ? JSON.parse(v) : v; }
            catch { this._rows = []; }
            if (!this._rows?.length) this._rows = [{ enabled: true, name: "None", strength: 1.0 }];
        },

        computeSize(W) {
            return [W, ROW_H * this._rows.length + ADD_H + GAP * 2];
        },

        draw(ctx, node, W, y) {
            this._y = y;
            const nw = nameW(W);

            for (let i = 0; i < this._rows.length; i++) {
                const row = this._rows[i];
                const ry  = y + i * ROW_H;
                let   cx  = MARGIN;

                // Toggle
                ctx.fillStyle = row.enabled ? "#3a7d44" : "#4a4a4a";
                rrect(ctx, cx, ry + 3, TOGGLE_W, ROW_H - 6, 4); ctx.fill();
                ctx.fillStyle = "#fff";
                ctx.font = "bold 10px Arial";
                ctx.textAlign = "center";
                ctx.fillText(row.enabled ? "ON" : "OFF", cx + TOGGLE_W / 2, ry + ROW_H / 2 + 4);
                cx += TOGGLE_W + GAP;

                // Name
                ctx.fillStyle = "#222";
                rrect(ctx, cx, ry + 3, nw, ROW_H - 6, 4); ctx.fill();
                ctx.strokeStyle = "#555"; ctx.lineWidth = 1;
                rrect(ctx, cx, ry + 3, nw, ROW_H - 6, 4); ctx.stroke();
                ctx.save();
                ctx.beginPath(); ctx.rect(cx + 4, ry, nw - 8, ROW_H); ctx.clip();
                ctx.fillStyle = row.name && row.name !== "None" ? "#ddd" : "#666";
                ctx.font = "11px Arial"; ctx.textAlign = "left";
                ctx.fillText(shortName(row.name), cx + 6, ry + ROW_H / 2 + 4);
                ctx.restore();
                cx += nw + GAP;

                // Strength: [<] [value] [>]
                ctx.fillStyle = "#222";
                rrect(ctx, cx, ry + 3, STR_W, ROW_H - 6, 4); ctx.fill();
                ctx.strokeStyle = "#555"; ctx.lineWidth = 1;
                rrect(ctx, cx, ry + 3, STR_W, ROW_H - 6, 4); ctx.stroke();

                // Left arrow
                ctx.fillStyle = "#aaa";
                ctx.font = "11px Arial"; ctx.textAlign = "center";
                ctx.fillText("<", cx + ARROW_W / 2, ry + ROW_H / 2 + 4);

                // Value
                ctx.fillStyle = "#ddd";
                ctx.fillText(row.strength.toFixed(2), cx + ARROW_W + VAL_W / 2, ry + ROW_H / 2 + 4);

                // Right arrow
                ctx.fillStyle = "#aaa";
                ctx.fillText(">", cx + ARROW_W + VAL_W + ARROW_W / 2, ry + ROW_H / 2 + 4);

                cx += STR_W + GAP;

                // Remove
                ctx.fillStyle = "#6a1e1e";
                rrect(ctx, cx, ry + 3, REM_W, ROW_H - 6, 4); ctx.fill();
                ctx.fillStyle = "#fff"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center";
                ctx.fillText("×", cx + REM_W / 2, ry + ROW_H / 2 + 5);
            }

            // Add button
            const ay = y + this._rows.length * ROW_H + GAP;
            ctx.fillStyle = "#1a3a1a";
            rrect(ctx, MARGIN, ay, W - MARGIN * 2, ADD_H, 4); ctx.fill();
            ctx.fillStyle = "#999"; ctx.font = "12px Arial"; ctx.textAlign = "center";
            ctx.fillText("+ Add Lora", W / 2, ay + ADD_H / 2 + 4);
        },

        mouse(event, pos, node) {
            const W  = node.size[0];
            const nw = nameW(W);
            const ry = pos[1] - this._y;
            const rx = pos[0] - MARGIN;

            if (event.type === "pointermove") {
                if (this._draggingRow >= 0) {
                    const dx = event.clientX - this._dragStartX;
                    if (Math.abs(dx) > 2) this._hasDragged = true;
                    if (this._hasDragged) {
                        const v = this._dragStartStrength + dx * 0.05;
                        this._rows[this._draggingRow].strength = Math.round(Math.max(-10, Math.min(10, v)) * 100) / 100;
                        return true;
                    }
                }
                return;
            }

            if (event.type === "pointerup") {
                const wasDragging = this._draggingRow >= 0;
                const hadDragged  = this._hasDragged;
                const dragRow     = this._draggingRow;
                this._draggingRow = -1;
                this._hasDragged  = false;

                // If clicked value without dragging, open prompt
                if (wasDragging && !hadDragged) {
                    const strCx = TOGGLE_W + GAP + nw + GAP;
                    const localRx = pos[0] - MARGIN;
                    if (localRx >= strCx + ARROW_W && localRx < strCx + ARROW_W + VAL_W) {
                        app.canvas.prompt("Strength", this._rows[dragRow].strength, (v) => {
                            const n = parseFloat(v);
                            if (!isNaN(n)) {
                                this._rows[dragRow].strength = Math.round(Math.max(-10, Math.min(10, n)) * 100) / 100;
                                node.setDirtyCanvas(true, true);
                            }
                        }, event);
                    }
                }
                return wasDragging ? true : undefined;
            }

            if (event.type !== "pointerdown") return;

            // Add button
            const ay = this._rows.length * ROW_H + GAP;
            if (ry >= ay && ry < ay + ADD_H) {
                this._rows.push({ enabled: true, name: "None", strength: 1.0 });
                node.setSize([node.size[0], node.computeSize()[1]]);
                node.setDirtyCanvas(true, true);
                return true;
            }

            const rowIdx = Math.floor(ry / ROW_H);
            if (rowIdx < 0 || rowIdx >= this._rows.length) return;

            let cx = 0;

            // Toggle
            if (rx >= cx && rx < cx + TOGGLE_W) {
                this._rows[rowIdx].enabled = !this._rows[rowIdx].enabled;
                node.setDirtyCanvas(true, true);
                return true;
            }
            cx += TOGGLE_W + GAP;

            // Name dropdown
            if (rx >= cx && rx < cx + nw) {
                new LiteGraph.ContextMenu(
                    LORA_LIST.map(v => ({
                        content: v,
                        callback: () => {
                            this._rows[rowIdx].name = v;
                            node.setDirtyCanvas(true, true);
                        }
                    })),
                    { event, className: "dark" }
                );
                return true;
            }
            cx += nw + GAP;

            // Strength left arrow
            if (rx >= cx && rx < cx + ARROW_W) {
                this._rows[rowIdx].strength = Math.round(Math.max(-10, Math.min(10, this._rows[rowIdx].strength - 0.05)) * 100) / 100;
                node.setDirtyCanvas(true, true);
                return true;
            }

            // Strength value (start drag, confirm on pointerup if no drag)
            if (rx >= cx + ARROW_W && rx < cx + ARROW_W + VAL_W) {
                this._draggingRow       = rowIdx;
                this._dragStartX        = event.clientX;
                this._dragStartStrength = this._rows[rowIdx].strength;
                this._hasDragged        = false;
                return true;
            }

            // Strength right arrow
            if (rx >= cx + ARROW_W + VAL_W && rx < cx + STR_W) {
                this._rows[rowIdx].strength = Math.round(Math.max(-10, Math.min(10, this._rows[rowIdx].strength + 0.05)) * 100) / 100;
                node.setDirtyCanvas(true, true);
                return true;
            }
            cx += STR_W + GAP;

            // Remove
            if (rx >= cx && rx < cx + REM_W) {
                this._rows.splice(rowIdx, 1);
                if (!this._rows.length) this._rows.push({ enabled: true, name: "None", strength: 1.0 });
                node.setSize([node.size[0], node.computeSize()[1]]);
                node.setDirtyCanvas(true, true);
                return true;
            }

            return;
        }
    };

    return w;
}

app.registerExtension({
    name: "PowerLoraStack",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "PowerLoraStack") return;

        // Re-fetch lora list on every node def refresh (e.g. pressing 'r')
        fetchLoraList();

        const _onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            _onCreated?.apply(this, arguments);

            const idx   = this.widgets?.findIndex(w => w.name === "loras") ?? -1;
            const saved = idx >= 0 ? this.widgets[idx].value : "[]";
            if (idx >= 0) this.widgets.splice(idx, 1);

            const widget = buildWidget(this, saved);
            this.addCustomWidget(widget);

            // addCustomWidget appends — move back to the original slot so the
            // widget stays where the stock "loras" string widget was.
            if (idx >= 0 && idx < this.widgets.length - 1) {
                const added = this.widgets.pop();
                this.widgets.splice(idx, 0, added);
            }

            this.setSize([Math.max(this.size[0], 360), this.computeSize()[1]]);
        };
    }
});
