import type { ProjectionTree } from "../../L01-foundation/projection-types.ts";

export function emitHandlersJs(tree: ProjectionTree): string {
  const lines: string[] = [];
  lines.push("(function(){");
  lines.push(
    '  var send = (window["__adkSend"] || function(f){ if(window.ws) window.ws.send(JSON.stringify(f)); });',
  );
  lines.push(
    '  var custom = function(name, payload){ if (typeof window["__adkCustomAction"] === "function") window["__adkCustomAction"](name, payload); };',
  );
  for (const h of tree.actionHandlers) {
    const payloadJson = JSON.stringify(h.binding.payload ?? {});
    const targetJson = JSON.stringify(h.binding.target ?? null);
    const ident = safeIdent(h.nodeId);
    lines.push(`  var el_${ident} = document.querySelector('[data-node-id="${h.nodeId}"]');`);
    if (h.kind === "custom") {
      lines.push(
        `  if (el_${ident}) el_${ident}.addEventListener('click', function(){ custom(${JSON.stringify(h.binding.action)}, ${payloadJson}); });`,
      );
    } else {
      lines.push(
        `  if (el_${ident}) el_${ident}.addEventListener('click', function(){ send({ type: "action", ref: ${JSON.stringify(h.binding.action)}, target: ${targetJson}, payload: ${payloadJson} }); });`,
      );
    }
  }
  lines.push("})();");
  return lines.join("\n");
}

export default emitHandlersJs;

function safeIdent(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_");
}
